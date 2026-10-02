import Stripe from "stripe";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CreateCustomer,
  CreatePayment,
  ListPaymentMethods,
  VerifyWebhook,
} from "@antelopejs/interface-payment";
import {
  CancelSubscription,
  CreateSubscription,
  SUBSCRIPTION_METADATA_KEY,
  type Subscription,
  type SubscriptionEvent,
  type SubscriptionRequest,
  SubscriptionEvents,
} from "@antelopejs/interface-subscriptions";

const SUITE_TIMEOUT = 120_000;
const SECRET = process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "";
const SECOND_MS = 1000;
const TRIAL_MS = 7 * 24 * 60 * 60 * SECOND_MS;
const AMOUNT = { value: 1900, currency: "EUR" };
const HANDLER = "stripe-subscription-events";

const client = new Stripe(process.env.STRIPE_KEY ?? "");
const signer = new Stripe("sk_test_unused_for_signing_only");
const received: SubscriptionEvent[] = [];
let shouldFail = false;

function deliver(type: string, object: unknown) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    created: Math.floor(Date.now() / SECOND_MS),
    type,
    data: { object },
  });
  const signature = signer.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
  });
  return VerifyWebhook({
    body: Buffer.from(payload),
    headers: { "stripe-signature": signature },
  });
}

async function payer(): Promise<{ customer: string; method: string }> {
  const customer = await CreateCustomer({}, `events-${randomUUID()}`);
  await CreatePayment(
    {
      amount: AMOUNT,
      reference: `events-save-${randomUUID()}`,
      customer: customer.id,
      paymentMethod: "pm_card_visa",
      savePaymentMethod: true,
      returnUrl: "https://merchant.invalid/return",
    },
    `events-save-${randomUUID()}`,
  );
  const [method] = await ListPaymentMethods(customer.id);
  return { customer: customer.id, method: method.id };
}

async function subscribe(trialEnd?: number): Promise<Subscription> {
  const { customer, method } = await payer();
  const request: SubscriptionRequest = {
    reference: `events-${randomUUID()}`,
    customer,
    paymentMethod: method,
    amount: AMOUNT,
    interval: "month",
  };
  if (trialEnd !== undefined) request.trialEnd = trialEnd;
  return CreateSubscription(request, `events-${randomUUID()}`);
}

function eventsFor(id: string): SubscriptionEvent[] {
  return received.filter((event) => event.subscription.id === id);
}

async function rawSubscription(id: string): Promise<Stripe.Subscription> {
  return client.subscriptions.retrieve(id);
}

async function rawInvoice(subscription: string): Promise<Stripe.Invoice> {
  const { latest_invoice } = await rawSubscription(subscription);
  return client.invoices.retrieve(latest_invoice as string);
}

describe("[stripe] subscription events from webhooks", function () {
  this.timeout(SUITE_TIMEOUT);

  before(() => {
    SubscriptionEvents.register(HANDLER, (event) => {
      if (shouldFail) throw new Error("handler failed");
      received.push(event);
    });
  });

  after(() => SubscriptionEvents.unregister(HANDLER));

  afterEach(() => {
    shouldFail = false;
  });

  it("raises created, and leaves the payment interface's answer unmodelled", async () => {
    const created = await subscribe();

    const answer = await deliver(
      "customer.subscription.created",
      await rawSubscription(created.id),
    );

    assert.equal(answer, undefined);
    const [event] = eventsFor(created.id);
    assert.equal(event.type, "subscription.created");
    assert.equal(event.subscription.status, "active");
    assert.equal(event.subscription.latestPayment, created.latestPayment);
  });

  it("raises payment_succeeded for a paid invoice, naming the charge", async () => {
    const created = await subscribe();

    await deliver("invoice.paid", await rawInvoice(created.id));

    const [event] = eventsFor(created.id);
    assert.equal(event.type, "subscription.payment_succeeded");
    assert.equal(event.payment, created.latestPayment);
  });

  it("raises nothing for the free invoice that opens a trial", async () => {
    const created = await subscribe(Date.now() + TRIAL_MS);

    await deliver("invoice.paid", await rawInvoice(created.id));

    assert.deepEqual(eventsFor(created.id), []);
  });

  it("raises canceled from the deletion", async () => {
    const created = await subscribe();
    await CancelSubscription(created.id, `events-${randomUUID()}`, "now");

    await deliver(
      "customer.subscription.deleted",
      await rawSubscription(created.id),
    );

    const [event] = eventsFor(created.id);
    assert.equal(event.type, "subscription.canceled");
    assert.equal(event.subscription.endReason, "requested");
  });

  it("rejects the delivery when a handler throws, so Stripe delivers it again", async () => {
    const created = await subscribe();
    const invoice = await rawInvoice(created.id);

    shouldFail = true;
    await assert.rejects(deliver("invoice.paid", invoice), /handler failed/);
    shouldFail = false;
    await deliver("invoice.paid", invoice);

    assert.equal(eventsFor(created.id).length, 1);
  });

  it("marks the subscription's charge in its payment webhook", async () => {
    const created = await subscribe();
    const intent = await client.paymentIntents.retrieve(created.latestPayment!);

    const answer = await deliver("payment_intent.succeeded", intent);

    assert.equal(answer?.type, "payment.succeeded");
    assert.equal(
      answer?.payment?.metadata?.[SUBSCRIPTION_METADATA_KEY],
      created.id,
    );
  });
});
