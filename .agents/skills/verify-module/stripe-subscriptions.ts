import { isString, pick, recordOf, text, type Json, type JsonRecord } from "./json.ts";
import { confirm, expanded, fail, find, list, missing, newId, now, ok, type Call, type Reply } from "./stripe-objects.ts";

const MONTH_DAYS = 30;
const SECONDS_PER_DAY = 86_400;
const PERIOD_DAYS = new Map<string, number>([["day", 1], ["week", 7], ["month", MONTH_DAYS], ["year", 365]]);

export function createProduct(call: Call): Reply {
  const id = text(call.form.id);
  if (id !== "" && call.account.objects.has(id)) {
    return fail(400, "invalid_request_error", "Product already exists.", { code: "resource_already_exists", param: "id" });
  }
  const product: JsonRecord = { id: id === "" ? newId("prod") : id, object: "product", name: text(call.form.name), active: true, created: now() };
  call.account.objects.set(text(product.id), product);
  return ok(product);
}

function withInvoicePayment(subscription: JsonRecord, call: Call, intentId: string): void {
  const invoiceId = newId("in");
  call.account.objects.set(invoiceId, {
    id: invoiceId,
    object: "invoice",
    subscription: text(subscription.id),
    payments: { object: "list", has_more: false, url: `/v1/invoices/${invoiceId}/payments`, data: [{ id: newId("inpay"), object: "invoice_payment", payment: { type: "payment_intent", payment_intent: intentId } }] },
  });
  subscription.latest_invoice = invoiceId;
}

function chargeFor(call: Call, subscription: JsonRecord, price: Json | undefined): Reply {
  const intentId = newId("pi");
  const intent: JsonRecord = {
    id: intentId,
    object: "payment_intent",
    amount: pick(price, "unit_amount") ?? 0,
    amount_received: 0,
    amount_capturable: 0,
    currency: pick(price, "currency") ?? "eur",
    status: "requires_confirmation",
    created: now(),
    customer: subscription.customer,
    payment_method: subscription.default_payment_method,
    capture_method: "automatic",
    setup_future_usage: null,
    description: null,
    metadata: {},
    latest_charge: null,
    last_payment_error: null,
    next_action: null,
    canceled_at: null,
  };
  call.account.objects.set(intentId, intent);
  const outcome = confirm(call.account, intent, {}, true);
  if (outcome.status === 200) withInvoicePayment(subscription, call, intentId);
  return outcome;
}

export function createSubscription(call: Call): Reply {
  const { form, account } = call;
  const price = pick(form.items, 0, "price_data");
  const customer = text(form.customer);
  if (find(account, customer, "cus_") === undefined) return missing("customer", customer, "customer");
  const created = now();
  const interval = text(pick(price, "recurring", "interval"));
  const count = Number(pick(price, "recurring", "interval_count") ?? 1);
  const trialEnd = form.trial_end === undefined ? null : Number(form.trial_end);
  const id = newId("sub");
  const subscription: JsonRecord = {
    id,
    object: "subscription",
    customer,
    default_payment_method: isString(form.default_payment_method) ? form.default_payment_method : null,
    status: trialEnd !== null && trialEnd > created ? "trialing" : "active",
    created,
    cancel_at_period_end: false,
    trial_end: trialEnd,
    canceled_at: null,
    ended_at: null,
    cancellation_details: { reason: null, comment: null },
    collection_method: "charge_automatically",
    metadata: recordOf(form.metadata),
    description: isString(form.description) ? form.description : null,
    latest_invoice: null,
    items: {
      object: "list",
      has_more: false,
      url: "/v1/subscription_items",
      data: [{ id: newId("si"), object: "subscription_item", price: { unit_amount: Number(pick(price, "unit_amount")), currency: pick(price, "currency") ?? "eur", recurring: { interval, interval_count: count } }, current_period_start: created, current_period_end: created + (PERIOD_DAYS.get(interval) ?? MONTH_DAYS) * count * SECONDS_PER_DAY }],
    },
  };
  account.objects.set(id, subscription);
  if (subscription.status === "trialing") return ok(expanded(account, subscription, form));
  const charged = chargeFor(call, subscription, price);
  if (charged.status !== 200) {
    account.objects.delete(id);
    return charged;
  }
  return ok(expandInvoice(call, subscription));
}

function expandInvoice(call: Call, subscription: JsonRecord): JsonRecord {
  const copy = expanded(call.account, subscription, call.form);
  const wanted = Array.isArray(call.form.expand) ? call.form.expand : [];
  const invoice = call.account.objects.get(text(subscription.latest_invoice));
  if (wanted.includes("latest_invoice.payments") && invoice !== undefined) copy.latest_invoice = invoice;
  return copy;
}

export function retrieveSubscription(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const subscription = find(call.account, id, "sub_");
  return subscription === undefined ? missing("subscription", id, "subscription_exposed_id") : ok(expandInvoice(call, subscription));
}

export function listSubscriptions(call: Call): Reply {
  const customer = text(call.form.customer);
  const found = [...call.account.objects.values()].filter((object) => object.object === "subscription" && object.customer === customer);
  return list("/v1/subscriptions", found.map((subscription) => expandInvoice({ ...call, form: { expand: ["latest_invoice.payments"] } }, subscription)));
}

export function cancelSubscription(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const subscription = find(call.account, id, "sub_");
  if (subscription === undefined || subscription.status === "canceled") return missing("subscription", id, "subscription_exposed_id");
  subscription.status = "canceled";
  subscription.canceled_at = now();
  subscription.ended_at = now();
  subscription.cancellation_details = { reason: "cancellation_requested", comment: pick(call.form, "cancellation_details", "comment") ?? null };
  return ok(expandInvoice(call, subscription));
}

export function updateSubscription(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const subscription = find(call.account, id, "sub_");
  if (subscription === undefined) return missing("subscription", id, "subscription_exposed_id");
  if (call.form.cancel_at_period_end !== undefined) subscription.cancel_at_period_end = call.form.cancel_at_period_end === "true";
  if (isString(call.form.default_payment_method)) subscription.default_payment_method = call.form.default_payment_method;
  return ok(expandInvoice(call, subscription));
}
