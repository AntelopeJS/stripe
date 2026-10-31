import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, SECONDARY_KEY, SECONDARY_WEBHOOK_SECRET, WEBHOOK_SECRET, answered, call, delivery, idOf, pay, pick, same, stripeSignature, text, thrown, withSession } from "./session.ts";

const webhookSignature: Journey = {
  title: "a delivery is accepted only when its Stripe-Signature carries a fresh timestamp and the HMAC-SHA256 of timestamp and raw body under the account's endpoint secret",
  entryPoint: "`VerifyWebhook` through core with deliveries signed the way Stripe signs them",
  async run(context) {
    await withSession(context, async (session) => {
      const paid = await pay(session, "CreatePayment", "pm_card_visa");
      const intent = session.stripe.object(API_KEY, idOf(paid));
      const signed = delivery("payment_intent.succeeded", intent);
      const accepted = await call(session, "VerifyWebhook of a genuine delivery", "VerifyWebhook", [signed, null]);
      context.expect(accepted.folder, [
        answered(accepted),
        same("the delivery becomes a payment.succeeded event for the payment", [pick(accepted.value, "type"), pick(accepted.value, "payment", "id")], ["payment.succeeded", idOf(paid)]),
      ], { critical: true });
      const tampered = await call(session, "VerifyWebhook of an altered body", "VerifyWebhook", [{ ...signed, body: signed.body.replace("payment_intent.succeeded", "payment_intent.canceled") }, null]);
      context.expect(tampered.folder, [same("a body that differs from the signed one is refused", pick(thrown(tampered), 0), "WebhookVerificationError")]);
      const unsigned = await call(session, "VerifyWebhook without a signature", "VerifyWebhook", [{ body: signed.body, headers: {} }, null]);
      context.expect(unsigned.folder, [
        same("a delivery with no signature is refused", pick(thrown(unsigned), 0), "WebhookVerificationError"),
        same("the refusal names the header", text(pick(thrown(unsigned), 1)).includes("stripe-signature"), true),
      ]);
      const stale = await call(session, "VerifyWebhook with an old timestamp", "VerifyWebhook", [{ body: signed.body, headers: { "stripe-signature": stripeSignature(signed.body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600) } }, null]);
      context.expect(stale.folder, [same("a signature older than the tolerance is refused", pick(thrown(stale), 0), "WebhookVerificationError")]);
      const secondaryPaid = await pay(session, "CreatePayment on the secondary account", "pm_card_visa", { provider: "secondary" });
      const foreign = delivery("payment_intent.succeeded", session.stripe.object(SECONDARY_KEY, idOf(secondaryPaid)), SECONDARY_WEBHOOK_SECRET);
      const wrongKey = await call(session, "VerifyWebhook signed under another account's secret", "VerifyWebhook", [foreign, null]);
      context.expect(wrongKey.folder, [same("a delivery signed under another secret is refused", pick(thrown(wrongKey), 0), "WebhookVerificationError")]);
      const secondary = await call(session, "VerifyWebhook on the secondary account", "VerifyWebhook", [foreign, "secondary"]);
      context.expect(secondary.folder, [same("the secondary account accepts a delivery signed under its own secret", pick(secondary.value, "type") ?? pick(thrown(secondary), 1), "payment.succeeded")]);
    });
  },
};

const webhookEvents: Journey = {
  title: "genuine deliveries become the interface's events: a refund as refund.succeeded, a failed payment as payment.failed with the decline reason, a capturable hold as payment.authorized, and an unmapped event is ignored",
  entryPoint: "`VerifyWebhook` through core with signed `refund.created`, `payment_intent.payment_failed`, `amount_capturable_updated` and unmapped deliveries",
  async run(context) {
    await withSession(context, async (session) => {
      const paid = await pay(session, "CreatePayment", "pm_card_visa");
      const refund = await call(session, "RefundPayment", "RefundPayment", [{ payment: idOf(paid), amount: { value: 1000, currency: "EUR" } }, "refund-key-webhook", null]);
      const refunded = await call(session, "VerifyWebhook of refund.created", "VerifyWebhook", [delivery("refund.created", session.stripe.object(API_KEY, idOf(refund))), null]);
      context.expect(refunded.folder, [
        answered(refunded),
        same("a created refund is refund.succeeded with its amount and payment", [pick(refunded.value, "type"), pick(refunded.value, "refund", "amount", "value"), pick(refunded.value, "refund", "payment")], ["refund.succeeded", 1000, idOf(paid)]),
      ], { critical: true });
      const declined = await pay(session, "CreatePayment declined", "pm_card_chargeDeclinedInsufficientFunds");
      const failed = await call(session, "VerifyWebhook of payment_intent.payment_failed", "VerifyWebhook", [delivery("payment_intent.payment_failed", session.stripe.object(API_KEY, idOf(declined))), null]);
      context.expect(failed.folder, [
        answered(failed),
        same("a failed delivery is payment.failed with the insufficient-funds reason", [pick(failed.value, "type"), pick(failed.value, "payment", "failure", "code")], ["payment.failed", "insufficient_funds"]),
      ]);
      const held = await pay(session, "CreatePayment authorize only", "pm_card_visa", { request: { authorizeOnly: true } });
      const authorized = await call(session, "VerifyWebhook of amount_capturable_updated", "VerifyWebhook", [delivery("payment_intent.amount_capturable_updated", session.stripe.object(API_KEY, idOf(held))), null]);
      context.expect(authorized.folder, [same("a capturable hold is payment.authorized", [pick(authorized.value, "type"), pick(authorized.value, "payment", "status")], ["payment.authorized", "authorized"])]);
      const unmapped = await call(session, "VerifyWebhook of an unmapped event", "VerifyWebhook", [delivery("customer.created", { id: "cus_x", object: "customer" }), null]);
      context.expect(unmapped.folder, [answered(unmapped), same("an event type the module does not map yields no event", unmapped.value, null)]);
    });
  },
};

export const webhookJourneys = { "webhook-signature": webhookSignature, "webhook-events": webhookEvents };
