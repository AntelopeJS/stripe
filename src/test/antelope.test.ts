import { defineConfig } from "@antelopejs/interface-core/config";

const TEST_METHOD = "pm_card_visa";
const TEST_METHOD_DECLINED = "pm_card_chargeDeclined";
const TEST_CURRENCY = "EUR";

/**
 * The signing secret the module is configured with for tests.
 *
 * The shared conformance suite only ever exercises the path where verification
 * must fail, because it has no endpoint to receive a genuine delivery at.
 * `webhook-events.test.ts` uses this secret with Stripe's own
 * `generateTestHeaderString` to sign real payloads, which is how the success
 * path — and the event normalisation behind it — gets covered at all.
 */
const TEST_WEBHOOK_SECRET = "whsec_conformance_suite_never_signs_with_this";

function requireApiKey(): string {
  const key = process.env.STRIPE_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_KEY must be set to a Stripe test-mode secret key (sk_test_...) to run the conformance suite",
    );
  }
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_KEY is not a test-mode key; refusing to run the conformance suite against live Stripe",
    );
  }
  return key;
}

export default defineConfig({
  name: "stripe-test",
  cacheFolder: ".antelope/cache",
  modules: {
    local: { source: { type: "local", path: "." } },
  },
  test: {
    folder: "dist/test",
    setup() {
      process.env.ANTELOPE_PAYMENT_TEST_METHOD = TEST_METHOD;
      process.env.ANTELOPE_PAYMENT_TEST_METHOD_DECLINED = TEST_METHOD_DECLINED;
      process.env.ANTELOPE_PAYMENT_TEST_CURRENCY = TEST_CURRENCY;
      process.env.STRIPE_TEST_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
      return {
        modules: {
          local: {
            config: {
              apiKey: requireApiKey(),
              webhookSecret: TEST_WEBHOOK_SECRET,
            },
          },
        },
      };
    },
  },
});
