import { isString, pick, recordOf, type JsonRecord } from "./json.ts";
import { confirm, expanded, fail, find, missing, newId, now, ok, type Account, type Call, type Reply } from "./stripe-objects.ts";

const SECONDS_PER_DAY = 86_400;

export function createSession(call: Call): Reply {
  const { form, account } = call;
  if (form.mode !== "payment") return fail(400, "invalid_request_error", "Invalid mode: must be one of payment, setup, or subscription", { param: "mode" });
  if (!isString(form.success_url)) return fail(400, "invalid_request_error", "Missing required param: success_url.", { code: "parameter_missing", param: "success_url" });
  const item = pick(form.line_items, 0, "price_data");
  const amount = Number(pick(item, "unit_amount"));
  const currency = pick(item, "currency");
  if (!Number.isInteger(amount) || !isString(currency)) return fail(400, "invalid_request_error", "Missing required param: line_items[0][price_data][unit_amount].", { code: "parameter_missing", param: "line_items[0][price_data][unit_amount]" });
  const id = newId("cs_test");
  const session: JsonRecord = {
    id,
    object: "checkout.session",
    url: `https://checkout.stripe.com/c/pay/${id}`,
    mode: "payment",
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
    amount_total: amount,
    currency,
    customer: isString(form.customer) ? form.customer : null,
    success_url: form.success_url,
    cancel_url: isString(form.cancel_url) ? form.cancel_url : null,
    locale: isString(form.locale) ? form.locale : null,
    metadata: recordOf(form.metadata),
    payment_intent_data: recordOf(form.payment_intent_data),
    created: now(),
    expires_at: now() + SECONDS_PER_DAY,
  };
  account.objects.set(id, session);
  return ok(session);
}

export function retrieveSession(call: Call): Reply {
  const id = call.segments[0] ?? "";
  const session = find(call.account, id, "cs_");
  return session === undefined ? missing("checkout.session", id, "session") : ok(expanded(call.account, session, call.form));
}

/** The payer paying a Checkout page with a test PaymentMethod token: the session completes and produces its PaymentIntent. */
export function payCheckout(account: Account, id: string, token: string): JsonRecord | undefined {
  const session = find(account, id, "cs_");
  if (session === undefined || session.status !== "open") return undefined;
  const data = recordOf(session.payment_intent_data);
  const intentId = newId("pi");
  const intent: JsonRecord = {
    id: intentId,
    object: "payment_intent",
    amount: session.amount_total ?? 0,
    amount_received: 0,
    amount_capturable: 0,
    currency: session.currency ?? "eur",
    status: "requires_confirmation",
    created: now(),
    customer: session.customer,
    payment_method: token,
    capture_method: data.capture_method === "manual" ? "manual" : "automatic",
    setup_future_usage: isString(data.setup_future_usage) ? data.setup_future_usage : null,
    description: null,
    metadata: recordOf(data.metadata),
    latest_charge: null,
    last_payment_error: null,
    next_action: null,
    canceled_at: null,
  };
  account.objects.set(intentId, intent);
  const outcome = confirm(account, intent, {}, false);
  if (outcome.status === 200) {
    session.status = "complete";
    session.payment_status = "paid";
  }
  session.payment_intent = intentId;
  return session;
}
