import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, answered, call, fresh, idOf, pay, pick, requestsTo, same, thrown, withSession } from "./session.ts";

const HALF = { value: 1000, currency: "EUR" };

const holdCapture: Journey = {
  title: "an authorize-only payment is a hold that a capture, in part or whole, settles once; a second capture and the capture of a payment already taken are state errors",
  entryPoint: "`CreatePayment` with `authorizeOnly`, `CapturePayment` and `GetPayment` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const held = await pay(session, "CreatePayment authorize only", "pm_card_visa", { request: { authorizeOnly: true } });
      context.expect(held.folder, [
        answered(held),
        same("the hold reads authorized with nothing captured", [pick(held.value, "status"), pick(held.value, "amountCaptured", "value")], ["authorized", 0]),
        same("Stripe was asked for a manual capture", requestsTo(session, "POST", "/v1/payment_intents")[0]?.form.capture_method, "manual"),
      ], { critical: true });
      const id = idOf(held);
      const key = fresh("key");
      const captured = await call(session, "CapturePayment in part", "CapturePayment", [id, key, HALF, null]);
      const sent = requestsTo(session, "POST", `/v1/payment_intents/${id}/capture`)[0];
      context.expect(captured.folder, [
        answered(captured),
        same("Stripe received a capture of 1000 under the caller's key", [sent?.form.amount_to_capture, sent?.idempotencyKey ?? null], ["1000", key]),
        same("the payment is succeeded with 1000 captured", [pick(captured.value, "status"), pick(captured.value, "amountCaptured", "value")], ["succeeded", 1000]),
        same("Stripe itself holds 1000 received", pick(session.stripe.object(API_KEY, id), "amount_received"), 1000),
      ]);
      const again = await call(session, "CapturePayment again", "CapturePayment", [id, fresh("key"), null, null]);
      context.expect(again.folder, [same("capturing a payment already captured is a state error", pick(thrown(again), 0), "InvalidPaymentStateError")]);
      const taken = await pay(session, "CreatePayment captured by itself", "pm_card_visa");
      const refused = await call(session, "CapturePayment of a succeeded payment", "CapturePayment", [idOf(taken), fresh("key"), null, null]);
      context.expect(refused.folder, [same("a payment that needs no capture is a state error", pick(thrown(refused), 0), "InvalidPaymentStateError")]);
    });
  },
};

const holdCancel: Journey = {
  title: "an authorized hold can be cancelled and then reads canceled; a payment already taken cannot be cancelled",
  entryPoint: "`CancelPayment` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const held = await pay(session, "CreatePayment authorize only", "pm_card_visa", { request: { authorizeOnly: true } });
      const id = idOf(held);
      const key = fresh("key");
      const voided = await call(session, "CancelPayment", "CancelPayment", [id, key, null]);
      context.expect(voided.folder, [
        answered(voided),
        same("Stripe received one cancel under the caller's key", [requestsTo(session, "POST", `/v1/payment_intents/${id}/cancel`).length, requestsTo(session, "POST", `/v1/payment_intents/${id}/cancel`)[0]?.idempotencyKey ?? null], [1, key]),
        same("the payment reads canceled and Stripe holds it as canceled", [pick(voided.value, "status"), pick(session.stripe.object(API_KEY, id), "status")], ["canceled", "canceled"]),
      ], { critical: true });
      const taken = await pay(session, "CreatePayment captured by itself", "pm_card_visa");
      const refused = await call(session, "CancelPayment of a succeeded payment", "CancelPayment", [idOf(taken), fresh("key"), null]);
      context.expect(refused.folder, [same("cancelling a payment already taken is a state error", pick(thrown(refused), 0), "InvalidPaymentStateError")]);
    });
  },
};

export const holdJourneys = { "hold-capture": holdCapture, "hold-cancel": holdCancel };
