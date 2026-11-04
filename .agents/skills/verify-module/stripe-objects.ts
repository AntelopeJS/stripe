import { randomBytes } from "node:crypto";

import { isNumber, isString, recordOf, text, type Json, type JsonRecord } from "./json.ts";

/** What a Stripe test PaymentMethod token does when a PaymentIntent is confirmed with it, from Stripe's testing documentation. */
export type Outcome =
  | { kind: "succeeds" }
  | { kind: "declines"; code: string; declineCode: string; message: string }
  | { kind: "authenticates" };

export const TEST_TOKENS = new Map<string, Outcome>(Object.entries({
  pm_card_visa: { kind: "succeeds" },
  pm_card_mastercard: { kind: "succeeds" },
  pm_card_chargeDeclined: { kind: "declines", code: "card_declined", declineCode: "generic_decline", message: "Your card was declined." },
  pm_card_chargeDeclinedInsufficientFunds: { kind: "declines", code: "card_declined", declineCode: "insufficient_funds", message: "Your card has insufficient funds." },
  pm_card_chargeDeclinedExpiredCard: { kind: "declines", code: "expired_card", declineCode: "expired_card", message: "Your card has expired." },
  pm_card_authenticationRequired: { kind: "authenticates" },
}));

/** One Stripe account, keyed by its secret key: everything it holds. */
export interface Account {
  objects: Map<string, JsonRecord>;
  outcomes: Map<string, Outcome>;
  deleted: Set<string>;
}

export function newAccount(): Account {
  return { objects: new Map(), outcomes: new Map(), deleted: new Set() };
}

export interface Reply {
  status: number;
  body: Json;
}

/** A request as a route handler sees it: the account, the form (or query) fields and the matched path segments. */
export interface Call {
  account: Account;
  form: JsonRecord;
  segments: string[];
}

export type Handler = (call: Call) => Reply;

const MINIMUM_AMOUNT = 50;

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function ok(body: Json): Reply {
  return { status: 200, body };
}

/** Stripe's error envelope: `{ error: { type, code?, message, param? } }`. */
export function fail(status: number, type: string, message: string, extra: JsonRecord = {}): Reply {
  return { status, body: { error: { type, message, ...extra } } };
}

export function missing(kind: string, id: string, param: string): Reply {
  return fail(404, "invalid_request_error", `No such ${kind}: '${id}'`, { code: "resource_missing", param });
}

export function find(account: Account, id: string, prefix: string): JsonRecord | undefined {
  return id.startsWith(prefix) ? account.objects.get(id) : undefined;
}

function expandList(form: JsonRecord): string[] {
  const expand = form.expand;
  if (Array.isArray(expand)) return expand.filter(isString);
  return isString(expand) ? [expand] : [];
}

/** The object with the paths named by `expand[]` replaced by the objects they point at. */
export function expanded(account: Account, object: JsonRecord, form: JsonRecord): JsonRecord {
  const copy: JsonRecord = { ...object };
  for (const path of expandList(form)) {
    const target = copy[path];
    if (isString(target)) {
      const found = account.objects.get(target);
      if (found !== undefined) copy[path] = found;
    }
  }
  return copy;
}

export function list(url: string, data: Json[]): Reply {
  return ok({ object: "list", url, has_more: false, data });
}

function paymentMethodOf(account: Account, token: string): { method: JsonRecord; outcome: Outcome } | Reply {
  const known = find(account, token, "pm_");
  const outcome = account.outcomes.get(token) ?? TEST_TOKENS.get(token);
  if (known !== undefined && outcome !== undefined) return { method: known, outcome };
  if (outcome === undefined) return missing("PaymentMethod", token, "payment_method");
  const id = newId("pm");
  const method: JsonRecord = {
    id,
    object: "payment_method",
    type: "card",
    customer: null,
    created: now(),
    card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: new Date().getFullYear() + 3, funding: "credit", country: "US" },
  };
  account.objects.set(id, method);
  account.outcomes.set(id, outcome);
  return { method, outcome };
}

function isReply(value: { method: JsonRecord; outcome: Outcome } | Reply): value is Reply {
  return "status" in value;
}

function createCharge(account: Account, intent: JsonRecord, paid: boolean, captured: boolean): JsonRecord {
  const id = newId("ch");
  const charge: JsonRecord = {
    id,
    object: "charge",
    amount: intent.amount ?? 0,
    amount_refunded: 0,
    currency: intent.currency ?? "eur",
    customer: intent.customer ?? null,
    payment_intent: intent.id ?? null,
    payment_method: intent.payment_method ?? null,
    paid,
    captured,
    refunded: false,
    status: paid ? "succeeded" : "failed",
    created: now(),
    metadata: intent.metadata ?? {},
  };
  account.objects.set(id, charge);
  return charge;
}

function succeed(account: Account, intent: JsonRecord): void {
  const manual = intent.capture_method === "manual";
  const charge = createCharge(account, intent, true, !manual);
  intent.latest_charge = text(charge.id);
  intent.status = manual ? "requires_capture" : "succeeded";
  intent.amount_received = manual ? 0 : (intent.amount ?? 0);
  intent.amount_capturable = manual ? (intent.amount ?? 0) : 0;
  intent.next_action = null;
  intent.last_payment_error = null;
}

function declinedError(intent: JsonRecord, outcome: Extract<Outcome, { kind: "declines" }>, chargeId: string): JsonRecord {
  return {
    type: "card_error",
    code: outcome.code,
    decline_code: outcome.declineCode,
    message: outcome.message,
    payment_method: intent.payment_method ?? null,
    charge: chargeId,
  };
}

function decline(account: Account, intent: JsonRecord, outcome: Extract<Outcome, { kind: "declines" }>): Reply {
  const charge = createCharge(account, intent, false, false);
  const error = declinedError(intent, outcome, text(charge.id));
  intent.status = "requires_payment_method";
  intent.last_payment_error = error;
  intent.latest_charge = text(charge.id);
  return { status: 402, body: { error: { ...error, payment_intent: intent } } };
}

function requireAction(intent: JsonRecord, form: JsonRecord): void {
  intent.status = "requires_action";
  const returnUrl = form.return_url;
  intent.next_action = isString(returnUrl)
    ? { type: "redirect_to_url", redirect_to_url: { url: `https://hooks.stripe.com/3d_secure_2/authenticate/${text(intent.id)}`, return_url: returnUrl } }
    : { type: "use_stripe_sdk" };
}

/** Confirms a PaymentIntent with its payment method: success, decline or a 3-D Secure step, as the method's test token behaves. */
export function confirm(account: Account, intent: JsonRecord, form: JsonRecord, offSession: boolean): Reply {
  const token = text(intent.payment_method);
  if (token === "") {
    return fail(400, "invalid_request_error", "You cannot confirm this PaymentIntent because it's missing a payment method.", { code: "payment_intent_unexpected_state" });
  }
  const found = paymentMethodOf(account, token);
  if (isReply(found)) return found;
  const { method, outcome } = found;
  const owner = text(method.customer);
  if (owner !== "" && owner !== text(intent.customer)) {
    return fail(400, "invalid_request_error", `The customer does not have a payment method with the ID ${text(method.id)}. The payment method must be attached to the customer.`, { code: "resource_missing", param: "payment_method" });
  }
  intent.payment_method = text(method.id);
  if (outcome.kind === "declines") return decline(account, intent, outcome);
  if (outcome.kind === "authenticates") {
    if (offSession) return decline(account, intent, { kind: "declines", code: "authentication_required", declineCode: "authentication_required", message: "This payment requires authentication." });
    requireAction(intent, form);
    return ok(intent);
  }
  succeed(account, intent);
  if (isString(intent.customer) && intent.setup_future_usage === "off_session" && owner === "") method.customer = intent.customer;
  return ok(intent);
}

/** The payer completing 3-D Secure at the issuer: the PaymentIntent succeeds, or fails authentication. */
export function authenticate(account: Account, id: string, passes: boolean): JsonRecord | undefined {
  const intent = find(account, id, "pi_");
  if (intent === undefined || intent.status !== "requires_action") return undefined;
  if (passes) {
    succeed(account, intent);
  } else {
    intent.status = "requires_payment_method";
    intent.next_action = null;
    intent.last_payment_error = { type: "invalid_request_error", code: "payment_intent_authentication_failure", message: "The provided PaymentMethod has failed authentication. You can provide payment_method_data or a new PaymentMethod to attempt to fulfill this PaymentIntent again." };
  }
  return intent;
}

export function createIntent(call: Call): Reply {
  const { form, account } = call;
  const amount = Number(form.amount);
  if (form.amount === undefined) return fail(400, "invalid_request_error", "Missing required param: amount.", { code: "parameter_missing", param: "amount" });
  if (!isString(form.currency)) return fail(400, "invalid_request_error", "Missing required param: currency.", { code: "parameter_missing", param: "currency" });
  if (!Number.isInteger(amount) || amount < MINIMUM_AMOUNT) {
    return fail(400, "invalid_request_error", `Amount must be at least ${(MINIMUM_AMOUNT / 100).toFixed(2)} ${form.currency}`, { code: "amount_too_small", param: "amount" });
  }
  const id = newId("pi");
  const paymentMethod = isString(form.payment_method) ? form.payment_method : null;
  const intent: JsonRecord = {
    id,
    object: "payment_intent",
    amount,
    amount_received: 0,
    amount_capturable: 0,
    currency: form.currency,
    status: paymentMethod === null ? "requires_payment_method" : "requires_confirmation",
    created: now(),
    customer: isString(form.customer) ? form.customer : null,
    payment_method: paymentMethod,
    capture_method: form.capture_method === "manual" ? "manual" : "automatic",
    setup_future_usage: isString(form.setup_future_usage) ? form.setup_future_usage : null,
    description: isString(form.description) ? form.description : null,
    metadata: recordOf(form.metadata),
    latest_charge: null,
    last_payment_error: null,
    next_action: null,
    client_secret: `${id}_secret_${randomBytes(6).toString("hex")}`,
    canceled_at: null,
  };
  account.objects.set(id, intent);
  if (form.confirm !== "true") return ok(intent);
  return confirm(account, intent, form, form.off_session === "true");
}

function intentOf(call: Call): JsonRecord | Reply {
  const id = call.segments[0] ?? "";
  return find(call.account, id, "pi_") ?? missing("payment_intent", id, "intent");
}

function isRecordReply(value: JsonRecord | Reply): value is Reply {
  return isNumber(value.status) && "body" in value;
}

export function retrieveIntent(call: Call): Reply {
  const intent = intentOf(call);
  return isRecordReply(intent) ? intent : ok(expanded(call.account, intent, call.form));
}

function unexpected(intent: JsonRecord, verb: string, allowed: string): Reply {
  return fail(400, "invalid_request_error", `This PaymentIntent could not be ${verb} because it has a status of ${text(intent.status)}. Only a PaymentIntent with one of the following statuses may be ${verb}: ${allowed}.`, { code: "payment_intent_unexpected_state" });
}

export function captureIntent(call: Call): Reply {
  const intent = intentOf(call);
  if (isRecordReply(intent)) return intent;
  if (intent.status !== "requires_capture") return unexpected(intent, "captured", "requires_capture");
  const amount = call.form.amount_to_capture === undefined ? Number(intent.amount) : Number(call.form.amount_to_capture);
  if (!Number.isInteger(amount) || amount > Number(intent.amount)) {
    return fail(400, "invalid_request_error", "The amount_to_capture must be less than or equal to the amount capturable.", { code: "amount_too_large", param: "amount_to_capture" });
  }
  const charge = find(call.account, text(intent.latest_charge), "ch_");
  if (charge !== undefined) {
    charge.captured = true;
    charge.amount = amount;
  }
  intent.status = "succeeded";
  intent.amount_received = amount;
  intent.amount_capturable = 0;
  return ok(intent);
}

const CANCELABLE = new Set(["requires_payment_method", "requires_capture", "requires_confirmation", "requires_action", "processing"]);

export function cancelIntent(call: Call): Reply {
  const intent = intentOf(call);
  if (isRecordReply(intent)) return intent;
  if (!CANCELABLE.has(text(intent.status))) {
    return fail(400, "invalid_request_error", `You cannot cancel this PaymentIntent because it has a status of ${text(intent.status)}. You may only cancel PaymentIntents with one of the following statuses: requires_payment_method, requires_capture, requires_confirmation, requires_action, processing.`, { code: "payment_intent_unexpected_state" });
  }
  intent.status = "canceled";
  intent.canceled_at = now();
  intent.amount_capturable = 0;
  return ok(intent);
}

export function retrieveCharge(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const charge = find(call.account, id, "ch_");
  return charge === undefined ? missing("charge", id, "charge") : ok(charge);
}

export function createRefund(call: Call): Reply {
  const { account, form } = call;
  const intentId = text(form.payment_intent);
  const intent = find(account, intentId, "pi_");
  if (intent === undefined) return missing("payment_intent", intentId, "payment_intent");
  const charge = find(account, text(intent.latest_charge), "ch_");
  if (charge === undefined || charge.paid !== true || charge.captured !== true) {
    return fail(400, "invalid_request_error", `This PaymentIntent (${intentId}) does not have a successful charge to refund.`, { param: "payment_intent" });
  }
  const left = Number(charge.amount) - Number(charge.amount_refunded);
  if (left === 0) return fail(400, "invalid_request_error", `Charge ${text(charge.id)} has already been refunded.`, { code: "charge_already_refunded" });
  const amount = form.amount === undefined ? left : Number(form.amount);
  if (!Number.isInteger(amount) || amount <= 0) return fail(400, "invalid_request_error", "Invalid positive integer", { param: "amount" });
  if (amount > left) return fail(400, "invalid_request_error", `Refund amount (${(amount / 100).toFixed(2)}) is greater than unrefunded amount on charge (${(left / 100).toFixed(2)})`, { param: "amount" });
  const id = newId("re");
  const refund: JsonRecord = {
    id,
    object: "refund",
    amount,
    currency: charge.currency ?? "eur",
    charge: text(charge.id),
    payment_intent: intentId,
    status: "succeeded",
    reason: isString(form.reason) ? form.reason : null,
    metadata: recordOf(form.metadata),
    created: now(),
  };
  account.objects.set(id, refund);
  charge.amount_refunded = Number(charge.amount_refunded) + amount;
  charge.refunded = charge.amount_refunded === charge.amount;
  return ok(refund);
}

export function retrieveRefund(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const refund = find(call.account, id, "re_");
  return refund === undefined ? missing("refund", id, "refund") : ok(refund);
}

export function createCustomer(call: Call): Reply {
  const id = newId("cus");
  const customer: JsonRecord = {
    id,
    object: "customer",
    email: isString(call.form.email) ? call.form.email : null,
    name: isString(call.form.name) ? call.form.name : null,
    description: isString(call.form.description) ? call.form.description : null,
    metadata: recordOf(call.form.metadata),
    created: now(),
  };
  call.account.objects.set(id, customer);
  return ok(customer);
}

export function retrieveCustomer(call: Call): Reply {
  const id = call.segments[0] ?? "";
  if (call.account.deleted.has(id)) return ok({ id, object: "customer", deleted: true });
  const customer = find(call.account, id, "cus_");
  return customer === undefined ? missing("customer", id, "id") : ok(customer);
}

export function deleteCustomer(call: Call): Reply {
  const id = call.segments[0] ?? "";
  if (find(call.account, id, "cus_") === undefined || call.account.deleted.has(id)) return missing("customer", id, "id");
  call.account.deleted.add(id);
  return ok({ id, object: "customer", deleted: true });
}

export function listPaymentMethods(call: Call): Reply {
  const customer = text(call.form.customer);
  if (customer !== "" && find(call.account, customer, "cus_") === undefined) return missing("customer", customer, "customer");
  const methods = [...call.account.objects.values()].filter((object) => object.object === "payment_method" && object.customer === customer);
  return list("/v1/payment_methods", methods.sort((first, second) => Number(second.created) - Number(first.created)));
}

export function detachPaymentMethod(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const method = find(call.account, id, "pm_");
  if (method === undefined) return missing("PaymentMethod", id, "payment_method");
  if (method.customer === null) return fail(400, "invalid_request_error", "The payment method you provided is not attached to a customer so detachment is not possible.");
  method.customer = null;
  return ok(method);
}

/** `GET /v1/invoice_payments`: the invoice payments that paid a PaymentIntent. The stand-in holds no invoices, so a PaymentIntent that is not an invoice's payment answers an empty list, as Stripe does. */
export function listInvoicePayments(): Reply {
  return list("/v1/invoice_payments", []);
}
