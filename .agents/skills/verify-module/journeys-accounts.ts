import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, SECONDARY_KEY, answered, call, fresh, idOf, pay, pick, requestsTo, same, thrown, withSession } from "./session.ts";

const accountSelection: Journey = {
  title: "the trailing provider argument selects a configured account with its own key and its own objects, and an account that is not configured is refused without a request",
  entryPoint: "`CreateCustomer`, `GetCustomer` and `CreatePayment` with and without a provider, through core",
  async run(context) {
    await withSession(context, async (session) => {
      const own = await call(session, "CreateCustomer on the secondary account", "CreateCustomer", [{ email: `${fresh("sec")}@merchant.invalid` }, fresh("key"), "secondary"]);
      context.expect(own.folder, [
        answered(own),
        same("the request went out under the secondary account's key", requestsTo(session, "POST", "/v1/customers").map((entry) => entry.key), [SECONDARY_KEY]),
        same("only the secondary account holds the customer", [session.stripe.object(SECONDARY_KEY, idOf(own)) !== null, session.stripe.object(API_KEY, idOf(own)) !== null], [true, false]),
      ], { critical: true });
      const readOn = await call(session, "GetCustomer on the secondary account", "GetCustomer", [idOf(own), "secondary"]);
      const readOff = await call(session, "GetCustomer on the default account", "GetCustomer", [idOf(own), null]);
      context.expect(readOff.folder, [
        same("the secondary account finds it", pick(readOn.value, "id"), idOf(own)),
        same("the default account does not", pick(thrown(readOff), 0), "CustomerNotFoundError"),
      ]);
      const paid = await pay(session, "CreatePayment on the secondary account", "pm_card_visa", { provider: "secondary" });
      context.expect(paid.folder, [answered(paid), same("the payment lives on the secondary account only", [session.stripe.object(SECONDARY_KEY, idOf(paid)) !== null, session.stripe.object(API_KEY, idOf(paid)) !== null], [true, false])]);
      const before = requestsTo(session, "POST", "/v1/payment_intents").length;
      const unknown = await pay(session, "CreatePayment on an unknown account", "pm_card_visa", { provider: "nobody" });
      context.expect(unknown.folder, [
        same("an account that is not configured is a PaymentError", pick(thrown(unknown), 0), "PaymentError"),
        same("no request went out for it", requestsTo(session, "POST", "/v1/payment_intents").length, before),
      ]);
    });
  },
};

const badKey: Journey = {
  title: "a secret key Stripe refuses is a PaymentError rather than a payment, and nothing is created",
  entryPoint: "`CreatePayment` through core with a module configured with a wrong secret key",
  async run(context) {
    await withSession(
      context,
      async (session) => {
        const refused = await pay(session, "CreatePayment with a wrong key", "pm_card_visa");
        context.expect(refused.folder, [
          same("the call is a PaymentError", pick(thrown(refused), 0), "PaymentError"),
          same("Stripe answered 401", requestsTo(session, "POST", "/v1/payment_intents").map((entry) => entry.status), [401]),
        ]);
      },
      { apiKey: "sk_test_wrongKeyWrongKey" },
    );
  },
};

export const accountJourneys = { "account-selection": accountSelection, "bad-key": badKey };
