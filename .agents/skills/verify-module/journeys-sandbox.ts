import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, answered, pay, requestsTo, same, withSession } from "./session.ts";

const requestContract: Journey = {
  title: "a request to Stripe is a form-encoded POST under the account's secret key as a bearer token",
  entryPoint: "`CreatePayment` through core against the stand-in",
  async run(context) {
    await withSession(context, async (session) => {
      const created = await pay(session, "CreatePayment", "pm_card_visa");
      const sent = requestsTo(session, "POST", "/v1/payment_intents")[0];
      context.expect(created.folder, [
        answered(created),
        same("the stand-in, which refuses any other key, accepted the request under the configured key", [sent?.key, sent?.status], [API_KEY, 200]),
      ]);
    });
  },
};

const sandboxLive: Journey = {
  title: "the module against Stripe's own test mode",
  entryPoint: "`CreatePayment` against api.stripe.com with an sk_test_ key",
  run(context) {
    return Promise.resolve(
      context.notVerified("no journey reaches Stripe's test mode: it needs the operator's sk_test_ key and the module hard-codes no sandbox endpoint; the module's own `pnpm test:stripe` runs live with STRIPE_KEY"),
    );
  },
};

export const sandboxJourneys = { "request-contract": requestContract, "sandbox-live": sandboxLive };
