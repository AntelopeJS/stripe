import {
  equal,
  type App,
  type CallResult,
  type Check,
  type JourneyContext,
} from "@antelopejs/tooling-configs/verify";

import { canonical, pick, text, tuple, type Json } from "./json.ts";
import { eventPayload, stripeSignature, StripeApi, type LoggedRequest } from "./stripe-api.ts";

export { pick, text, tuple, type Json } from "./json.ts";
export type ModuleConfig = NonNullable<NonNullable<Parameters<JourneyContext["fixture"]>[0]>["moduleConfig"]>;

export const API_KEY = "sk_test_verifyDefaultAccount";
export const SECONDARY_KEY = "sk_test_verifySecondaryAccount";
export const WEBHOOK_SECRET = "whsec_verifyDefault";
export const SECONDARY_WEBHOOK_SECRET = "whsec_verifySecondary";

const PAYMENT_INTERFACE = "@antelopejs/interface-payment";
const LEGACY_INTERFACE = "@antelopejs/interface-stripe";
const SUBSCRIPTIONS_INTERFACE = "@antelopejs/interface-subscriptions";

export const EUR = { value: 2500, currency: "EUR" } as const;

export interface Session {
  context: JourneyContext;
  app: App;
  stripe: StripeApi;
}

/** The module config pointing the default and the `secondary` account at the stand-in; `overrides` replace top-level keys. */
export function sessionConfig(port: number, overrides: ModuleConfig = {}): ModuleConfig {
  return {
    apiKey: API_KEY,
    webhookSecret: WEBHOOK_SECRET,
    host: "127.0.0.1",
    port,
    protocol: "http",
    accounts: { secondary: { apiKey: SECONDARY_KEY, webhookSecret: SECONDARY_WEBHOOK_SECRET } },
    ...overrides,
  };
}

/** Starts the stand-in for api.stripe.com, loads the module in `ajs project dev` pointed at it, and hands both to `run`. */
export async function withSession(context: JourneyContext, run: (session: Session) => Promise<void>, overrides: ModuleConfig = {}): Promise<void> {
  const stripe = new StripeApi([API_KEY, SECONDARY_KEY]);
  await stripe.start();
  try {
    const project = context.fixture({ moduleConfig: sessionConfig(stripe.port, overrides) });
    const app = await context.dev("ajs-project-dev", project);
    await run({ context, app, stripe });
  } finally {
    await stripe.close();
  }
}

export function call(session: Session, name: string, path: string, args: Json[], entry = "."): Promise<CallResult> {
  return session.context.call(name, session.app, { interface: PAYMENT_INTERFACE, entry, path: [path], args });
}

export function callSubscriptions(session: Session, name: string, path: string, args: Json[]): Promise<CallResult> {
  return session.context.call(name, session.app, { interface: SUBSCRIPTIONS_INTERFACE, path: [path], args });
}

export function callLegacy(session: Session, name: string, path: string, args: Json[]): Promise<CallResult> {
  return session.context.call(name, session.app, { interface: LEGACY_INTERFACE, path: [path], args });
}

let counter = 0;

/** A fresh idempotency key or reference, unique within the process. */
export function fresh(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${counter}`;
}

/** The name and message of the error a call threw, or `null` when it returned. */
export function thrown(result: CallResult): Json {
  return [pick(result.json, "error", "name") ?? null, pick(result.json, "error", "message") ?? null];
}

export function answered(result: CallResult): Check {
  return { name: "the call through core answered", pass: result.ok, detail: result.ok ? "ok" : `${result.body}` };
}

/** `equal` that ignores key order; an absent value, also inside an array, reads as `null`. */
export function same(name: string, actual: Json | undefined | (Json | undefined)[], expected: Json | undefined): Check {
  return equal(name, canonical(Array.isArray(actual) ? tuple(...actual) : actual), canonical(expected));
}

/** The requests the stand-in answered to one endpoint, oldest first. */
export function requestsTo(session: Session, method: string, path: string): LoggedRequest[] {
  return session.stripe.to(method, path);
}

/** How `pay` differs from its defaults: request fields, the idempotency key and the account. */
export interface PayOptions {
  request?: { [field: string]: Json };
  key?: string;
  provider?: string;
}

/** `CreatePayment` of 25.00 EUR with a Stripe test PaymentMethod token, `options.request` replacing the defaults. */
export function pay(session: Session, name: string, token: string, options: PayOptions = {}): Promise<CallResult> {
  const request = { amount: EUR, reference: fresh("ref"), paymentMethod: token, ...options.request };
  return call(session, name, "CreatePayment", [request, options.key ?? fresh("key"), options.provider ?? null]);
}

/** A delivery as `VerifyWebhook` takes it. */
export type Delivery = { body: string; headers: { [name: string]: string } };

/** A delivery signed with Stripe's documented scheme; the raw body is a string because the JSON driver cannot carry bytes. */
export function delivery(type: string, object: Json, secret: string = WEBHOOK_SECRET): Delivery {
  const body = eventPayload(type, object);
  return { body, headers: { "stripe-signature": stripeSignature(body, secret), "content-type": "application/json" } };
}

export { stripeSignature };

export function idOf(result: CallResult): string {
  return text(pick(result.value, "id"));
}
