import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, EUR, answered, call, fresh, idOf, pay, pick, requestsTo, same, text, thrown, withSession } from "./session.ts";

const INTENTS = "/v1/payment_intents";
const RETURN_URL = "https://merchant.invalid/return";

const payApproved: Journey = {
  title: "a test card becomes one confirmed PaymentIntent with the amount, currency, reference and idempotency key, reads back as succeeded, and Stripe holds the same amount",
  entryPoint: "`CreatePayment` and `GetPayment` through core against the stand-in for api.stripe.com",
  async run(context) {
    await withSession(context, async (session) => {
      const reference = fresh("order");
      const key = fresh("key");
      const created = await pay(session, "CreatePayment", "pm_card_visa", { request: { reference }, key });
      const sent = requestsTo(session, "POST", INTENTS);
      context.expect(created.folder, [
        answered(created),
        same("the payment is succeeded for the amount, with the reference echoed", [pick(created.value, "status"), pick(created.value, "amount"), pick(created.value, "amountCaptured"), pick(created.value, "reference")], ["succeeded", EUR, EUR, reference]),
        same("Stripe received one request", sent.length, 1),
        same("it asks to confirm 2500 eur on the test card", [sent[0]?.form.amount, sent[0]?.form.currency, sent[0]?.form.confirm, sent[0]?.form.payment_method], ["2500", "eur", "true", "pm_card_visa"]),
        same("it keeps the reference in the metadata and carries the caller's idempotency key", [pick(sent[0]?.form, "metadata", "antelope_reference"), sent[0]?.idempotencyKey ?? null], [reference, key]),
        same("it was sent with the account's secret key", sent[0]?.key, API_KEY),
      ], { critical: true });
      const read = await call(session, "GetPayment", "GetPayment", [idOf(created)]);
      const held = session.stripe.object(API_KEY, idOf(created));
      context.expect(read.folder, [
        answered(read),
        same("reading it back gives the same payment, nothing refunded", [pick(read.value, "status"), pick(read.value, "amountCaptured"), pick(read.value, "amountRefunded")], ["succeeded", EUR, { value: 0, currency: "EUR" }]),
        same("Stripe itself holds it as succeeded for 2500 received", [pick(held, "status"), pick(held, "amount_received")], ["succeeded", 2500]),
      ]);
    });
  },
};

const payDeclined: Journey = {
  title: "a declined card is a failed payment with Stripe's decline reason, not a thrown error; unknown, too small and unknown-method payments are refused with their own errors",
  entryPoint: "`CreatePayment` with Stripe's decline test cards, then `GetPayment`",
  async run(context) {
    await withSession(context, async (session) => {
      const funds = await pay(session, "CreatePayment insufficient funds", "pm_card_chargeDeclinedInsufficientFunds");
      context.expect(funds.folder, [
        answered(funds),
        same("the payment is failed with the insufficient-funds reason and Stripe's decline code", [pick(funds.value, "status"), pick(funds.value, "failure", "code"), pick(funds.value, "failure", "providerCode")], ["failed", "insufficient_funds", "insufficient_funds"]),
      ], { critical: true });
      const generic = await pay(session, "CreatePayment generic decline", "pm_card_chargeDeclined");
      context.expect(generic.folder, [same("a generic decline is a declined failure", [pick(generic.value, "status"), pick(generic.value, "failure", "code"), pick(generic.value, "failure", "providerCode")], ["failed", "declined", "generic_decline"])]);
      const read = await call(session, "GetPayment of the declined payment", "GetPayment", [idOf(funds)]);
      context.expect(read.folder, [same("reading it later still says failed with the same reason", [pick(read.value, "status"), pick(read.value, "failure", "code")], ["failed", "insufficient_funds"])]);
      const unknown = await call(session, "GetPayment of an unknown id", "GetPayment", ["pi_doesnotexist"]);
      context.expect(unknown.folder, [same("an unknown payment is a PaymentNotFoundError", pick(thrown(unknown), 0), "PaymentNotFoundError")]);
      const tiny = await pay(session, "CreatePayment below the minimum", "pm_card_visa", { request: { amount: { value: 20, currency: "EUR" } } });
      context.expect(tiny.folder, [same("an amount Stripe refuses as too small is a state error", pick(thrown(tiny), 0), "InvalidPaymentStateError")]);
      const noMethod = await pay(session, "CreatePayment with an unknown method", "pm_nope");
      context.expect(noMethod.folder, [same("an unknown payment method is refused", noMethod.ok, false)]);
    });
  },
};

const payIdempotent: Journey = {
  title: "replaying a payment with the same idempotency key returns the same payment and charges once; the same key with other parameters is refused; a new key is a new payment",
  entryPoint: "`CreatePayment` twice with one key, then with the same key and another amount, then with a new key",
  async run(context) {
    await withSession(context, async (session) => {
      const key = fresh("key");
      const request = { amount: EUR, reference: fresh("order"), paymentMethod: "pm_card_visa" };
      const first = await call(session, "CreatePayment", "CreatePayment", [request, key, null]);
      const replay = await call(session, "CreatePayment replayed", "CreatePayment", [request, key, null]);
      context.expect(replay.folder, [
        answered(first),
        answered(replay),
        same("the replay returns the first payment", idOf(replay), idOf(first)),
        same("Stripe answered the second request as a replay", requestsTo(session, "POST", INTENTS).map((entry) => entry.replayed), [false, true]),
      ], { critical: true });
      const changed = await call(session, "CreatePayment with the same key and another amount", "CreatePayment", [{ ...request, amount: { value: 3000, currency: "EUR" } }, key, null]);
      context.expect(changed.folder, [
        same("the key cannot be reused with other parameters", pick(thrown(changed), 0), "PaymentError"),
        same("the refusal is Stripe's idempotency error", text(pick(thrown(changed), 1)).includes("Keys for idempotent requests"), true),
      ]);
      const other = await call(session, "CreatePayment under a new key", "CreatePayment", [request, fresh("key"), null]);
      context.expect(other.folder, [answered(other), same("a new key makes a new payment", idOf(other) === idOf(first), false)]);
    });
  },
};

const pay3ds: Journey = {
  title: "a card that needs 3-D Secure is requires_action with Stripe's redirect, keeps it on later reads, and ends by the payer's outcome; an off-session attempt on it is a failed payment",
  entryPoint: "`CreatePayment` with the authentication-required test card and a return URL, the payer completing the challenge at the stand-in",
  async run(context) {
    await withSession(context, async (session) => {
      const challenged = await pay(session, "CreatePayment challenged", "pm_card_authenticationRequired", { request: { returnUrl: RETURN_URL } });
      const sent = requestsTo(session, "POST", INTENTS)[0];
      context.expect(challenged.folder, [
        answered(challenged),
        same("the payment needs action and carries Stripe's redirect", [pick(challenged.value, "status"), text(pick(challenged.value, "redirectUrl")).startsWith("https://hooks.stripe.com/")], ["requires_action", true]),
        same("the return URL went to Stripe and automatic payment methods were left out", [sent?.form.return_url, sent?.form.automatic_payment_methods ?? null], [RETURN_URL, null]),
      ], { critical: true });
      const id = idOf(challenged);
      const waiting = await call(session, "GetPayment while the payer is away", "GetPayment", [id]);
      context.expect(waiting.folder, [same("a read still shows the redirect", [pick(waiting.value, "status"), text(pick(waiting.value, "redirectUrl")).startsWith("https://hooks.stripe.com/")], ["requires_action", true])]);
      session.stripe.completeAuthentication(API_KEY, id, true);
      const done = await call(session, "GetPayment after the payer authenticated", "GetPayment", [id]);
      context.expect(done.folder, [same("the payer's success makes it succeeded", pick(done.value, "status"), "succeeded")]);
      const abandoned = await pay(session, "CreatePayment challenged again", "pm_card_authenticationRequired", { request: { returnUrl: RETURN_URL } });
      session.stripe.completeAuthentication(API_KEY, idOf(abandoned), false);
      const failed = await call(session, "GetPayment after the payer failed authentication", "GetPayment", [idOf(abandoned)]);
      context.expect(failed.folder, [same("the payer's failure makes it failed with the authentication reason", [pick(failed.value, "status"), pick(failed.value, "failure", "code")], ["failed", "authentication_failed"])]);
      const customer = await call(session, "CreateCustomer", "CreateCustomer", [{ email: `${fresh("e")}@merchant.invalid` }, fresh("key"), null]);
      const background = await pay(session, "CreatePayment off-session on the authentication-required card", "pm_card_authenticationRequired", { request: { offSession: true, customer: idOf(customer) } });
      context.expect(background.folder, [same("a payer-absent charge that needs authentication is a failed payment", [pick(background.value, "status"), pick(background.value, "failure", "code")], ["failed", "authentication_failed"])]);
    });
  },
};

const payThroughStripe: Journey = {
  title: "one payment through core reaches the stand-in for Stripe with the secret key and reads back succeeded",
  entryPoint: "`CreatePayment` and `GetPayment` through core against the stand-in",
  async run(context) {
    await withSession(context, async (session) => {
      const created = await pay(session, "CreatePayment", "pm_card_visa");
      context.expect(created.folder, [answered(created), same("Stripe accepted the request", requestsTo(session, "POST", INTENTS).map((entry) => entry.status), [200])], { critical: true });
      const read = await call(session, "GetPayment", "GetPayment", [idOf(created)]);
      context.expect(read.folder, [same("the payment reads succeeded", pick(read.value, "status"), "succeeded")]);
    });
  },
};

export const paymentJourneys = { "pay-approved": payApproved, "pay-declined": payDeclined, "pay-idempotent": payIdempotent, "pay-3ds": pay3ds, "pay-through-stripe": payThroughStripe };
