import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, EUR, answered, call, callSubscriptions, fresh, idOf, pay, pick, requestsTo, same, text, thrown, withSession, type Session } from "./session.ts";

async function savedCard(session: Session, customerId: string): Promise<string> {
  const saving = await pay(session, "CreatePayment saving the card", "pm_card_visa", { request: { customer: customerId, savePaymentMethod: true, returnUrl: "https://merchant.invalid/return" } });
  return text(pick(saving.value, "paymentMethod"));
}

async function customerWithCard(session: Session): Promise<{ customer: string; method: string }> {
  const created = await call(session, "CreateCustomer", "CreateCustomer", [{ email: `${fresh("sub")}@merchant.invalid` }, fresh("key"), null]);
  const customer = idOf(created);
  return { customer, method: await savedCard(session, customer) };
}

const subscriptionCreate: Journey = {
  title: "a subscription charges the saved card once at start, reads back with its interval, amount, period and latest payment, is listed on its customer, and a bad request is refused before Stripe is called",
  entryPoint: "`CreateSubscription`, `GetSubscription` and `ListSubscriptions` of the subscriptions interface through core",
  async run(context) {
    await withSession(context, async (session) => {
      const { customer, method } = await customerWithCard(session);
      const reference = fresh("plan");
      const key = fresh("key");
      const created = await callSubscriptions(session, "CreateSubscription", "CreateSubscription", [{ reference, customer, paymentMethod: method, amount: EUR, interval: "month" }, key, null]);
      const sent = requestsTo(session, "POST", "/v1/subscriptions")[0];
      context.expect(created.folder, [
        answered(created),
        same("the subscription is active for the amount and interval, on the customer and card", [pick(created.value, "status"), pick(created.value, "amount"), pick(created.value, "interval"), pick(created.value, "customer"), pick(created.value, "paymentMethod")], ["active", EUR, "month", customer, method]),
        same("it carries the reference and a first payment", [pick(created.value, "reference"), text(pick(created.value, "latestPayment")).startsWith("pi_")], [reference, true]),
        same("Stripe received a recurring price of 2500 eur monthly under the caller's key, failing rather than leaving it incomplete", [pick(sent?.form, "items", 0, "price_data", "unit_amount"), pick(sent?.form, "items", 0, "price_data", "recurring", "interval"), sent?.form.payment_behavior, sent?.idempotencyKey ?? null], ["2500", "month", "error_if_incomplete", key]),
        same("the period is one month long", Number(pick(created.value, "currentPeriodEnd")) - Number(pick(created.value, "currentPeriodStart")), 30 * 86_400 * 1000),
      ], { critical: true });
      const id = idOf(created);
      const read = await callSubscriptions(session, "GetSubscription", "GetSubscription", [id, null]);
      const listed = await callSubscriptions(session, "ListSubscriptions", "ListSubscriptions", [customer, null]);
      context.expect(read.folder, [
        same("reading it back gives the same subscription", [pick(read.value, "id"), pick(read.value, "status")], [id, "active"]),
        same("the customer's list holds it alone", [pick(listed.value, 0, "id"), Array.isArray(listed.value) ? listed.value.length : -1], [id, 1]),
        same("Stripe holds an active subscription on the customer", [pick(session.stripe.object(API_KEY, id), "status"), pick(session.stripe.object(API_KEY, id), "customer")], ["active", customer]),
      ]);
      const unknown = await callSubscriptions(session, "GetSubscription of an unknown id", "GetSubscription", ["sub_doesnotexist", null]);
      context.expect(unknown.folder, [same("an unknown subscription is not found", pick(thrown(unknown), 0), "SubscriptionNotFoundError")]);
      const before = requestsTo(session, "POST", "/v1/subscriptions").length;
      const invalid = await callSubscriptions(session, "CreateSubscription with a lowercase currency", "CreateSubscription", [{ reference, customer, paymentMethod: method, amount: { value: 2500, currency: "eur" }, interval: "month" }, fresh("key"), null]);
      context.expect(invalid.folder, [
        same("an invalid request is refused as such", pick(thrown(invalid), 0), "InvalidSubscriptionRequestError"),
        same("Stripe was not asked", requestsTo(session, "POST", "/v1/subscriptions").length, before),
      ]);
    });
  },
};

const subscriptionCancel: Journey = {
  title: "a subscription can be cancelled at once or at the end of its period, and an ended one cannot be cancelled again",
  entryPoint: "`CancelSubscription` and `UpdateSubscriptionPaymentMethod` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const { customer, method } = await customerWithCard(session);
      const started = await callSubscriptions(session, "CreateSubscription", "CreateSubscription", [{ reference: fresh("plan"), customer, paymentMethod: method, amount: EUR, interval: "month" }, fresh("key"), null]);
      const id = idOf(started);
      const later = await callSubscriptions(session, "CancelSubscription at period end", "CancelSubscription", [id, fresh("key"), "period_end", null]);
      context.expect(later.folder, [
        answered(later),
        same("the subscription stays active and is flagged to end with its period", [pick(later.value, "status"), pick(later.value, "cancelAtPeriodEnd")], ["active", true]),
        same("Stripe was told to cancel at the period end", requestsTo(session, "POST", `/v1/subscriptions/${id}`)[0]?.form.cancel_at_period_end, "true"),
      ], { critical: true });
      const key = fresh("key");
      const now = await callSubscriptions(session, "CancelSubscription now", "CancelSubscription", [id, key, "now", null]);
      context.expect(now.folder, [
        answered(now),
        same("the subscription is canceled and ended on request", [pick(now.value, "status"), pick(now.value, "endReason")], ["canceled", "requested"]),
        same("Stripe holds it as canceled", pick(session.stripe.object(API_KEY, id), "status"), "canceled"),
      ]);
      const again = await callSubscriptions(session, "CancelSubscription of an ended subscription", "CancelSubscription", [id, fresh("key"), "now", null]);
      context.expect(again.folder, [same("an ended subscription is a state error", pick(thrown(again), 0), "InvalidSubscriptionStateError")]);
      const replay = await callSubscriptions(session, "CancelSubscription replayed under the same key", "CancelSubscription", [id, key, "now", null]);
      context.expect(replay.folder, [answered(replay), same("the replay of a cancellation returns the ended subscription", pick(replay.value, "status"), "canceled")]);
      const other = await callSubscriptions(session, "GetSubscription of a subscription of another account", "GetSubscription", [id, "secondary"]);
      context.expect(other.folder, [same("another account does not see it", pick(thrown(other), 0), "SubscriptionNotFoundError")]);
    });
  },
};

export const subscriptionJourneys = { "subscription-create": subscriptionCreate, "subscription-cancel": subscriptionCancel };
