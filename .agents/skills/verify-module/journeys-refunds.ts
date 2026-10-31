import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, answered, call, fresh, idOf, pay, pick, requestsTo, same, text, thrown, withSession } from "./session.ts";

const refundFlow: Journey = {
  title: "a refund of part of a payment succeeds at once, shows in the payment's refunded amount and in Stripe's charge, can be read again, and more than is left or a second full refund is refused",
  entryPoint: "`RefundPayment`, `GetRefund` and `GetPayment` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const paid = await pay(session, "CreatePayment", "pm_card_visa");
      const id = idOf(paid);
      const key = fresh("key");
      const refund = await call(session, "RefundPayment of 1000", "RefundPayment", [{ payment: id, amount: { value: 1000, currency: "EUR" }, reason: "requested_by_customer" }, key, null]);
      const sent = requestsTo(session, "POST", "/v1/refunds")[0];
      context.expect(refund.folder, [
        answered(refund),
        same("the refund names its payment and amount and has succeeded", [pick(refund.value, "payment"), pick(refund.value, "amount", "value"), pick(refund.value, "status")], [id, 1000, "succeeded"]),
        same("Stripe received the payment intent, the amount, the native reason and the caller's key", [sent?.form.payment_intent, sent?.form.amount, sent?.form.reason, sent?.idempotencyKey ?? null], [id, "1000", "requested_by_customer", key]),
      ], { critical: true });
      const read = await call(session, "GetRefund", "GetRefund", [idOf(refund)]);
      const payment = await call(session, "GetPayment after the refund", "GetPayment", [id]);
      const charge = session.stripe.object(API_KEY, text(pick(session.stripe.object(API_KEY, id), "latest_charge")));
      context.expect(read.folder, [
        same("the refund reads back the same", [pick(read.value, "id"), pick(read.value, "status")], [idOf(refund), "succeeded"]),
        same("the payment shows 1000 refunded", pick(payment.value, "amountRefunded", "value"), 1000),
        same("Stripe's charge holds 1000 refunded", pick(charge, "amount_refunded"), 1000),
      ]);
      const over = await call(session, "RefundPayment above what is left", "RefundPayment", [{ payment: id, amount: { value: 2000, currency: "EUR" } }, fresh("key"), null]);
      context.expect(over.folder, [same("a refund above what is left is a state error", pick(thrown(over), 0), "InvalidPaymentStateError")]);
      const rest = await call(session, "RefundPayment of the rest", "RefundPayment", [{ payment: id }, fresh("key"), null]);
      context.expect(rest.folder, [answered(rest), same("a refund with no amount returns what is left", pick(rest.value, "amount", "value"), 1500)]);
      const twice = await call(session, "RefundPayment after a full refund", "RefundPayment", [{ payment: id }, fresh("key"), null]);
      context.expect(twice.folder, [same("a payment refunded in full is a state error", pick(thrown(twice), 0), "InvalidPaymentStateError")]);
    });
  },
};

const refundRefused: Journey = {
  title: "refunding a payment that was never taken or does not exist, or reading an unknown refund, is refused with the right error",
  entryPoint: "`RefundPayment` of a hold and of unknown ids, `GetRefund` of an unknown id",
  async run(context) {
    await withSession(context, async (session) => {
      const held = await pay(session, "CreatePayment authorize only", "pm_card_visa", { request: { authorizeOnly: true } });
      const early = await call(session, "RefundPayment of a hold", "RefundPayment", [{ payment: idOf(held) }, fresh("key"), null]);
      context.expect(early.folder, [same("a payment with no captured charge is a state error", pick(thrown(early), 0), "InvalidPaymentStateError")]);
      const unknown = await call(session, "RefundPayment of an unknown payment", "RefundPayment", [{ payment: "pi_doesnotexist" }, fresh("key"), null]);
      context.expect(unknown.folder, [same("an unknown payment is not found", pick(thrown(unknown), 0), "PaymentNotFoundError")]);
      const absent = await call(session, "GetRefund of an unknown id", "GetRefund", ["re_doesnotexist"]);
      context.expect(absent.folder, [same("an unknown refund is not found", pick(thrown(absent), 0), "PaymentNotFoundError")]);
    });
  },
};

export const refundJourneys = { "refund-flow": refundFlow, "refund-refused": refundRefused };
