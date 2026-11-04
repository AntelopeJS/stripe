import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, EUR, answered, call, fresh, idOf, pick, requestsTo, same, text, thrown, withSession } from "./session.ts";

const REQUEST = { amount: EUR, successUrl: "https://shop.invalid/ok", cancelUrl: "https://shop.invalid/cancel", description: "Order 42" };
const SESSIONS = "/v1/checkout/sessions";

const hostedSession: Journey = {
  title: "a checkout session is a hosted Stripe page for the amount with return URLs, reads pending until paid, then carries the payment it produced; a replay of its key returns the same page",
  entryPoint: "`CreateCheckoutSession` and `GetCheckoutSession` through core, the payer paying the page at the stand-in",
  async run(context) {
    await withSession(context, async (session) => {
      const reference = fresh("order");
      const key = fresh("key");
      const created = await call(session, "CreateCheckoutSession", "CreateCheckoutSession", [{ ...REQUEST, reference, locale: "fr" }, key, null]);
      const sent = requestsTo(session, "POST", SESSIONS)[0];
      context.expect(created.folder, [
        answered(created),
        same("the session has Stripe's page URL and starts pending", [text(pick(created.value, "redirectUrl")).startsWith("https://checkout.stripe.com/"), pick(created.value, "status")], [true, "pending"]),
        same("Stripe was asked for a one-time payment page for 2500 eur", [sent?.form.mode, pick(sent?.form, "line_items", 0, "price_data", "unit_amount"), pick(sent?.form, "line_items", 0, "price_data", "currency"), pick(sent?.form, "line_items", 0, "quantity")], ["payment", "2500", "eur", "1"]),
        same("it names the product after the description and carries both return URLs", [pick(sent?.form, "line_items", 0, "price_data", "product_data", "name"), sent?.form.success_url, sent?.form.cancel_url], ["Order 42", "https://shop.invalid/ok", "https://shop.invalid/cancel"]),
        same("it keeps the reference on the session and on the payment it will create", [pick(sent?.form, "metadata", "antelope_reference"), pick(sent?.form, "payment_intent_data", "metadata", "antelope_reference"), sent?.form.locale], [reference, reference, "fr"]),
        same("it carries the caller's idempotency key", sent?.idempotencyKey ?? null, key),
      ], { critical: true });
      const id = idOf(created);
      const replay = await call(session, "CreateCheckoutSession replayed", "CreateCheckoutSession", [{ ...REQUEST, reference, locale: "fr" }, key, null]);
      context.expect(replay.folder, [same("the replay returns the same session", idOf(replay), id), same("Stripe answered it as a replay", requestsTo(session, "POST", SESSIONS).map((entry) => entry.replayed), [false, true])]);
      const waiting = await call(session, "GetCheckoutSession before payment", "GetCheckoutSession", [id]);
      context.expect(waiting.folder, [same("an unpaid page reads pending with no payment", [pick(waiting.value, "status"), pick(waiting.value, "payment") ?? null], ["pending", null])]);
      session.stripe.payCheckoutSession(API_KEY, id, "pm_card_visa");
      const paid = await call(session, "GetCheckoutSession after payment", "GetCheckoutSession", [id]);
      const intent = session.stripe.object(API_KEY, text(pick(paid.value, "payment")));
      context.expect(paid.folder, [
        answered(paid),
        same("the paid page carries the payment Stripe produced and its status", [text(pick(paid.value, "payment")).startsWith("pi_"), pick(paid.value, "status")], [true, "succeeded"]),
        same("that payment holds the reference and 2500 received", [pick(intent, "metadata", "antelope_reference"), pick(intent, "amount_received")], [reference, 2500]),
      ]);
    });
  },
};

const hostedOptions: Journey = {
  title: "an authorize-only session asks Stripe for a manual capture, a session to save the card needs a customer, and an unknown session is not found",
  entryPoint: "`CreateCheckoutSession` with `authorizeOnly` and `savePaymentMethod`, `GetCheckoutSession` of an unknown id",
  async run(context) {
    await withSession(context, async (session) => {
      const hold = await call(session, "CreateCheckoutSession authorize only", "CreateCheckoutSession", [{ ...REQUEST, reference: fresh("order"), authorizeOnly: true }, fresh("key"), null]);
      context.expect(hold.folder, [
        answered(hold),
        same("Stripe was asked for a manual capture", pick(requestsTo(session, "POST", SESSIONS)[0]?.form, "payment_intent_data", "capture_method"), "manual"),
      ], { critical: true });
      session.stripe.payCheckoutSession(API_KEY, idOf(hold), "pm_card_visa");
      const held = await call(session, "GetCheckoutSession of the paid hold", "GetCheckoutSession", [idOf(hold)]);
      context.expect(held.folder, [same("the paid hold reads authorized", pick(held.value, "status"), "authorized")]);
      const noCustomer = await call(session, "CreateCheckoutSession saving a card without a customer", "CreateCheckoutSession", [{ ...REQUEST, reference: fresh("order"), savePaymentMethod: true }, fresh("key"), null]);
      context.expect(noCustomer.folder, [same("saving a card with no customer is a PaymentError", pick(thrown(noCustomer), 0), "PaymentError"), same("Stripe was not asked again", requestsTo(session, "POST", SESSIONS).length, 1)]);
      const unknown = await call(session, "GetCheckoutSession of an unknown id", "GetCheckoutSession", ["cs_test_doesnotexist"]);
      context.expect(unknown.folder, [same("an unknown session is not found", pick(thrown(unknown), 0), "PaymentNotFoundError")]);
    });
  },
};

export const checkoutJourneys = { "hosted-session": hostedSession, "hosted-options": hostedOptions };
