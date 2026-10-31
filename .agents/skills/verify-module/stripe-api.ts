import { createHash, createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { isString, text, type Json, type JsonRecord } from "./json.ts";
import { parseForm } from "./stripe-form.ts";
import {
  authenticate,
  cancelIntent,
  captureIntent,
  createCustomer,
  createIntent,
  createRefund,
  deleteCustomer,
  detachPaymentMethod,
  fail,
  listInvoicePayments,
  listPaymentMethods,
  newAccount,
  newId,
  now,
  retrieveCharge,
  retrieveCustomer,
  retrieveIntent,
  retrieveRefund,
  type Account,
  type Handler,
  type Reply,
} from "./stripe-objects.ts";
import { cancelSubscription, createProduct, createSubscription, listSubscriptions, retrieveSubscription, updateSubscription } from "./stripe-subscriptions.ts";
import { createSession, payCheckout, retrieveSession } from "./stripe-checkout.ts";

/** One request the stand-in answered, as it recorded it. */
export interface LoggedRequest {
  key: string;
  method: string;
  path: string;
  form: JsonRecord;
  idempotencyKey: string | null;
  status: number;
  replayed: boolean;
}

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  /** The top-level parameters the endpoint documents; any other is refused as Stripe does. */
  params: string[] | null;
}

const COMMON = ["expand", "metadata"];

const ROUTES: Route[] = [
  { method: "POST", pattern: /^\/v1\/payment_intents$/, handler: createIntent, params: [...COMMON, "amount", "currency", "confirm", "payment_method", "customer", "payment_method_types", "capture_method", "off_session", "setup_future_usage", "description", "return_url", "automatic_payment_methods", "receipt_email", "statement_descriptor"] },
  { method: "GET", pattern: /^\/v1\/payment_intents\/([^/]+)$/, handler: retrieveIntent, params: null },
  { method: "POST", pattern: /^\/v1\/payment_intents\/([^/]+)\/capture$/, handler: captureIntent, params: [...COMMON, "amount_to_capture"] },
  { method: "POST", pattern: /^\/v1\/payment_intents\/([^/]+)\/cancel$/, handler: cancelIntent, params: [...COMMON, "cancellation_reason"] },
  { method: "GET", pattern: /^\/v1\/charges\/([^/]+)$/, handler: retrieveCharge, params: null },
  { method: "POST", pattern: /^\/v1\/refunds$/, handler: createRefund, params: [...COMMON, "payment_intent", "charge", "amount", "reason"] },
  { method: "GET", pattern: /^\/v1\/invoice_payments$/, handler: listInvoicePayments, params: null },
  { method: "GET", pattern: /^\/v1\/refunds\/([^/]+)$/, handler: retrieveRefund, params: null },
  { method: "POST", pattern: /^\/v1\/customers$/, handler: createCustomer, params: [...COMMON, "email", "name", "description", "payment_method"] },
  { method: "GET", pattern: /^\/v1\/customers\/([^/]+)$/, handler: retrieveCustomer, params: null },
  { method: "DELETE", pattern: /^\/v1\/customers\/([^/]+)$/, handler: deleteCustomer, params: null },
  { method: "GET", pattern: /^\/v1\/payment_methods$/, handler: listPaymentMethods, params: null },
  { method: "POST", pattern: /^\/v1\/payment_methods\/([^/]+)\/detach$/, handler: detachPaymentMethod, params: [...COMMON] },
  { method: "POST", pattern: /^\/v1\/checkout\/sessions$/, handler: createSession, params: [...COMMON, "mode", "managed_payments", "line_items", "success_url", "cancel_url", "customer", "locale", "payment_intent_data", "client_reference_id"] },
  { method: "GET", pattern: /^\/v1\/checkout\/sessions\/([^/]+)$/, handler: retrieveSession, params: null },
  { method: "POST", pattern: /^\/v1\/products$/, handler: createProduct, params: [...COMMON, "id", "name"] },
  { method: "POST", pattern: /^\/v1\/subscriptions$/, handler: createSubscription, params: [...COMMON, "customer", "default_payment_method", "items", "payment_behavior", "off_session", "description", "trial_end", "billing_cycle_anchor", "proration_behavior"] },
  { method: "GET", pattern: /^\/v1\/subscriptions$/, handler: listSubscriptions, params: null },
  { method: "GET", pattern: /^\/v1\/subscriptions\/([^/]+)$/, handler: retrieveSubscription, params: null },
  { method: "POST", pattern: /^\/v1\/subscriptions\/([^/]+)$/, handler: updateSubscription, params: [...COMMON, "cancel_at_period_end", "default_payment_method"] },
  { method: "DELETE", pattern: /^\/v1\/subscriptions\/([^/]+)$/, handler: cancelSubscription, params: null },
];

interface Answered {
  reply: Reply;
  replayed: boolean;
}

interface Remembered {
  fingerprint: string;
  reply: Reply;
}

function isAddress(value: ReturnType<Server["address"]>): value is AddressInfo {
  return typeof value === "object" && value !== null;
}

async function readText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function headerOf(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return isString(value) ? value : null;
}

/** An in-process stand-in for api.stripe.com: form-encoded requests, bearer keys, `Idempotency-Key`, Stripe's error envelope and a stateful account behind each secret key. */
export class StripeApi {
  readonly requests: LoggedRequest[] = [];
  private server: Server | undefined;
  private readonly accounts = new Map<string, Account>();
  private readonly remembered = new Map<string, Remembered>();
  private readonly keys: string[];
  port = 0;

  constructor(keys: string[]) {
    this.keys = keys;
    for (const key of keys) this.accounts.set(key, newAccount());
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    const server = this.server;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    this.port = isAddress(address) ? address.port : 0;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server === undefined) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** The account behind a secret key. */
  account(key: string): Account {
    const found = this.accounts.get(key);
    if (found === undefined) throw new Error(`the stand-in has no account for ${key}`);
    return found;
  }

  /** What an account holds under `id`, or `null`. */
  object(key: string, id: string): Json {
    return this.account(key).objects.get(id) ?? null;
  }

  /** The payer completing 3-D Secure for a PaymentIntent. */
  completeAuthentication(key: string, id: string, passes: boolean): Json {
    return authenticate(this.account(key), id, passes) ?? null;
  }

  /** The payer paying a Checkout page with a test PaymentMethod token. */
  payCheckoutSession(key: string, id: string, token: string): Json {
    return payCheckout(this.account(key), id, token) ?? null;
  }

  /** The requests made to `method path`, oldest first. */
  to(method: string, path: string): LoggedRequest[] {
    return this.requests.filter((entry) => entry.method === method && entry.path === path);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://stripe.invalid");
    const method = request.method ?? "GET";
    const body = await readText(request);
    const form = parseForm(method === "POST" ? body : url.search.slice(1));
    const authorization = headerOf(request, "authorization") ?? "";
    const key = authorization.replace(/^Bearer /, "");
    const idempotencyKey = headerOf(request, "idempotency-key");
    const { reply, replayed } = this.answer(method, url.pathname, key, form, idempotencyKey);
    this.requests.push({ key, method, path: url.pathname, form, idempotencyKey, status: reply.status, replayed });
    response.statusCode = reply.status;
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Request-Id", newId("req"));
    if (replayed) response.setHeader("Idempotent-Replayed", "true");
    response.end(JSON.stringify(reply.body));
  }

  private route(method: string, path: string): { route: Route; segments: string[] } | undefined {
    for (const route of ROUTES) {
      const match = route.method === method ? route.pattern.exec(path) : null;
      if (match !== null) return { route, segments: match.slice(1) };
    }
    return undefined;
  }

  private answer(method: string, path: string, key: string, form: JsonRecord, idempotencyKey: string | null): Answered {
    if (!this.accounts.has(key)) {
      return { reply: fail(401, "invalid_request_error", `Invalid API Key provided: ${key.slice(0, 8)}****`), replayed: false };
    }
    const found = this.route(method, path);
    if (found === undefined) {
      return { reply: fail(404, "invalid_request_error", `Unrecognized request URL (${method}: ${path}). Please see https://stripe.com/docs or we can help at https://support.stripe.com/.`), replayed: false };
    }
    const unknown = found.route.params === null ? undefined : Object.keys(form).find((name) => !found.route.params?.includes(name));
    if (unknown !== undefined) {
      return { reply: fail(400, "invalid_request_error", `Received unknown parameter: ${unknown}`, { code: "parameter_unknown", param: unknown }), replayed: false };
    }
    const fingerprint = createHash("sha256").update(`${method} ${path} ${JSON.stringify(form)}`).digest("hex");
    const memory = idempotencyKey === null || method !== "POST" ? undefined : `${key}|${idempotencyKey}`;
    const earlier = memory === undefined ? undefined : this.remembered.get(memory);
    if (earlier !== undefined) {
      if (earlier.fingerprint !== fingerprint) {
        return { reply: fail(400, "idempotency_error", `Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than '${text(idempotencyKey)}' if you meant to execute a different request.`), replayed: false };
      }
      return { reply: earlier.reply, replayed: true };
    }
    const reply = found.route.handler({ account: this.account(key), form, segments: found.segments });
    if (memory !== undefined) this.remembered.set(memory, { fingerprint, reply });
    return { reply, replayed: false };
  }
}

/** Stripe's webhook signature header for `payload`: `t=<seconds>,v1=<hex HMAC-SHA256 of "<seconds>.<payload>" under the endpoint secret>`, as documented under "Verify webhook signatures". */
export function stripeSignature(payload: string, secret: string, seconds: number = now()): string {
  return `t=${seconds},v1=${createHmac("sha256", secret).update(`${seconds}.${payload}`).digest("hex")}`;
}

/** An event envelope as Stripe delivers it. */
export function eventPayload(type: string, object: Json): string {
  return JSON.stringify({ id: newId("evt"), object: "event", api_version: "2025-09-30.clover", created: now(), type, livemode: false, pending_webhooks: 1, data: { object } });
}
