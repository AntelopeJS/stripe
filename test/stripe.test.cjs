const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const { after, before, describe, it } = require("node:test");
const apiInterface = require("@antelopejs/interface-api");
const redisInterface = require("@antelopejs/interface-redis");
const stripeInterface = require("@antelopejs/interface-stripe");

const API_KEY = "local-api-key";
const WEBHOOK_SECRET = "local-webhook-secret";
const CHANNEL = "stripe:payment_intent:changes";

class RedisSubscriber extends EventEmitter {
  subscriptions = [];
  unsubscribed = [];
  didQuit = false;

  async subscribe(channel) {
    this.subscriptions.push(channel);
  }

  async unsubscribe(channel) {
    this.unsubscribed.push(channel);
  }

  async quit() {
    this.didQuit = true;
  }
}

class RedisProvider {
  subscriber = new RedisSubscriber();
  published = [];

  duplicate() {
    return this.subscriber;
  }

  async publish(channel, message) {
    this.published.push({ channel, message });
    return 1;
  }
}

function paymentIntent(status = "requires_payment_method") {
  return {
    id: "pi_local",
    object: "payment_intent",
    amount: 2500,
    currency: "usd",
    metadata: { payload: "order_local" },
    status,
  };
}

function stripeEvent(intent) {
  return {
    id: "evt_local",
    object: "event",
    created: 1_700_000_000,
    data: { object: intent },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
  };
}

async function readRequest(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const state = {
  redis: new RedisProvider(),
  requests: [],
  routes: [],
  watched: [],
};

async function handleProviderRequest(request, response) {
  state.requests.push({
    authorization: request.headers.authorization,
    body: await readRequest(request),
    method: request.method,
    url: request.url,
  });
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(paymentIntent()));
}

async function setupModule() {
  state.server = http.createServer(handleProviderRequest);
  await listen(state.server);
  state.routeLease = apiInterface.routesProxy.onRegister(
    (_id, handler) => state.routes.push(handler),
    true,
  );
  redisInterface.internal.SetClient(state.redis);
  state.stripeModule = require("../dist");
  state.stripeModule.construct({
    apiKey: API_KEY,
    webhookSecret: WEBHOOK_SECRET,
    host: "127.0.0.1",
    port: state.server.address().port,
    protocol: "http",
  });
  await state.stripeModule.start();
  stripeInterface.WatchAllPayments((id, intent, context) => {
    state.watched.push({ context, id, intent });
  });
}

async function teardownModule() {
  await state.stripeModule.stop();
  state.stripeModule.destroy();
  apiInterface.routesProxy.detach(state.routeLease);
  await close(state.server);
  assert.deepEqual(state.redis.subscriber.unsubscribed, [CHANNEL]);
  assert.equal(state.redis.subscriber.didQuit, true);
  assert.equal(state.redis.subscriber.listenerCount("message"), 0);
  const clientState = await Promise.race([
    stripeInterface.GetClient().then(() => "resolved"),
    new Promise((resolve) => setImmediate(() => resolve("pending"))),
  ]);
  assert.equal(clientState, "pending");
}

async function testStartup() {
  assert.deepEqual(state.redis.subscriber.subscriptions, [CHANNEL]);
  assert.equal(state.routes.length, 1);
  assert.equal(state.routes[0].location, "stripe/webhook");
  assert.equal(state.routes[0].method, "post");
  assert.equal(
    (await stripeInterface.GetClient()).getApiField("host"),
    "127.0.0.1",
  );
}

async function testPaymentCreation() {
  const created = await stripeInterface.InitializePayment("order_local", {
    amount: 2500,
    currency: "usd",
  });
  assert.equal(created.id, "pi_local");
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].method, "POST");
  assert.equal(state.requests[0].url, "/v1/payment_intents");
  assert.equal(state.requests[0].authorization, `Bearer ${API_KEY}`);
  const form = new URLSearchParams(state.requests[0].body);
  assert.equal(form.get("amount"), "2500");
  assert.equal(form.get("currency"), "usd");
  assert.equal(form.get("metadata[payload]"), "order_local");
}

async function testSignedWebhook() {
  const intent = paymentIntent("succeeded");
  const payload = JSON.stringify(stripeEvent(intent));
  const client = await stripeInterface.GetClient();
  const signature = client.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  await state.routes[0].callback(Buffer.from(payload), signature);
  assert.equal(state.watched.length, 1);
  assert.deepEqual(state.watched[0], {
    context: { local: true },
    id: "order_local",
    intent,
  });
  assert.equal(state.redis.published.length, 1);
  assert.equal(state.redis.published[0].channel, CHANNEL);
}

async function testInvalidWebhook() {
  await assert.rejects(
    state.routes[0].callback(Buffer.from("{}"), "invalid"),
    (error) =>
      error instanceof apiInterface.HTTPResult && error.getStatus() === 403,
  );
}

function testRemoteChanges() {
  const remoteIntent = { ...paymentIntent("succeeded"), id: "pi_remote" };
  state.redis.subscriber.emit(
    "message",
    CHANNEL,
    JSON.stringify({ messageId: "remote", paymentIntent: remoteIntent }),
  );
  assert.equal(state.watched.length, 2);
  assert.deepEqual(state.watched[1].context, { local: false });
  assert.equal(state.watched[1].intent.id, "pi_remote");
  state.redis.subscriber.emit(
    "message",
    CHANNEL,
    state.redis.published[0].message,
  );
  assert.equal(state.watched.length, 2);
}

describe("Stripe module", { concurrency: false }, () => {
  before(setupModule);
  after(teardownModule);
  it("starts with one webhook route and a public Stripe client", testStartup);
  it(
    "creates a payment through the public SDK against the local provider",
    testPaymentCreation,
  );
  it(
    "accepts a signed webhook and publishes the local change",
    testSignedWebhook,
  );
  it("rejects a webhook with an invalid signature", testInvalidWebhook);
  it(
    "relays remote changes and deduplicates its own publication",
    testRemoteChanges,
  );
});
