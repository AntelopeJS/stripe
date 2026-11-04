import type { VerifyConfig } from "@antelopejs/tooling-configs/verify";

import { accountJourneys } from "./journeys-accounts.ts";
import { checkoutJourneys } from "./journeys-checkout.ts";
import { customerJourneys } from "./journeys-customers.ts";
import { holdJourneys } from "./journeys-holds.ts";
import { legacyJourneys } from "./journeys-legacy.ts";
import { paymentJourneys } from "./journeys-payments.ts";
import { refundJourneys } from "./journeys-refunds.ts";
import { sandboxJourneys } from "./journeys-sandbox.ts";
import { sessionConfig } from "./session.ts";
import { subscriptionJourneys } from "./journeys-subscriptions.ts";
import { webhookJourneys } from "./journeys-webhooks.ts";

const config: VerifyConfig = {
  doors: {
    data: null,
    format: {
      globs: ["src/implementations/payment/mapping.ts", "src/implementations/payment/refunds.ts", "src/implementations/payment/payments.ts"],
      funnels: ["src/implementations/payment/mapping.ts"],
      containments: ["payments/pay-approved"],
      why: "the caller's reference is stored in the PaymentIntent's metadata under `antelope_reference` and a refund reason Stripe has no field for under `antelope_refund_reason`: payments created by this release are read by the next one",
    },
    contract: {
      globs: ["package.json", "src/index.ts"],
      funnels: [],
      containments: [],
      why: "the config keys (`apiKey`, `webhookSecret`, `accounts`, `endpoint` and the Stripe client options), `antelopeJs.implements` and the interface ranges",
    },
    outbound: {
      globs: ["src/index.ts"],
      funnels: ["src/index.ts"],
      containments: [],
      why: "every payment, refund and customer call leaves through the Stripe client built here with the merchant's secret key: its host, key and idempotency key decide whose money moves",
    },
    exposure: {
      globs: ["src/implementations/payment/webhooks.ts"],
      funnels: ["src/implementations/payment/webhooks.ts"],
      containments: [],
      why: "the signature check on the raw body is what makes a webhook delivery trusted before a consumer acts on a payment event",
    },
    publish: {
      globs: ["package.json", ".release-it.json", "changelogen.config.json", ".github/workflows/release.yml"],
      funnels: [],
      containments: [],
      why: "the package name and release workflow claim @antelopejs/stripe on npm",
    },
  },
  moduleConfig() {
    return sessionConfig(9);
  },
  journeys: {
    ...paymentJourneys,
    ...holdJourneys,
    ...refundJourneys,
    ...customerJourneys,
    ...checkoutJourneys,
    ...webhookJourneys,
    ...accountJourneys,
    ...subscriptionJourneys,
    ...legacyJourneys,
    ...sandboxJourneys,
  },
};

export default config;
