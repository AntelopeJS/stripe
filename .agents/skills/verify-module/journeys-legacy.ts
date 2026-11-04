import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, answered, callLegacy, fresh, idOf, pick, requestsTo, same, withSession } from "./session.ts";

const legacyInitialize: Journey = {
  title: "the legacy Stripe interface creates a PaymentIntent through the module's client and tags it with the caller's payload id",
  entryPoint: "`InitializePayment` of `@antelopejs/interface-stripe` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const payload = fresh("order");
      const created = await callLegacy(session, "InitializePayment", "InitializePayment", [payload, { amount: 2500, currency: "eur", payment_method_types: ["card"] }]);
      const sent = requestsTo(session, "POST", "/v1/payment_intents")[0];
      context.expect(created.folder, [
        answered(created),
        same("the answer is Stripe's PaymentIntent for the amount", [pick(created.value, "object"), pick(created.value, "amount"), pick(created.value, "currency")], ["payment_intent", 2500, "eur"]),
        same("the request went out under the default account's key with the payload id in the metadata", [sent?.key, pick(sent?.form, "metadata", "payload"), sent?.form.amount], [API_KEY, payload, "2500"]),
        same("Stripe holds the PaymentIntent with that payload", pick(session.stripe.object(API_KEY, idOf(created)), "metadata", "payload"), payload),
      ]);
    });
  },
};

export const legacyJourneys = { "legacy-initialize": legacyInitialize };
