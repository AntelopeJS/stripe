import Stripe from "stripe";
import { mock } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidSubscriptionRequestError,
  SubscriptionError,
  SubscriptionPaymentError,
  type SubscriptionRequest,
} from "@antelopejs/interface-subscriptions";

import { SignedWebhook } from "./signed-webhook";
import { VerifyWebhook } from "../implementations/payment/webhooks";
import { RegisterAccount } from "../implementations/payment/accounts";
import { CreateCheckoutSession } from "../implementations/payment/checkout";
import { CreateSubscription } from "../implementations/subscriptions/subscriptions";

const PROVIDER = "provider-regression-tests";
const SECRET = "provider-regression-signing-secret";
const NOW = Date.UTC(2027, 0, 1);
const SECOND_MS = 1000;
const FUTURE = NOW + 60 * SECOND_MS;
const AMOUNT = 1900;
const REFUNDED = 700;
const REQUEST: SubscriptionRequest = {
  customer: "cus_test",
  paymentMethod: "pm_test",
  reference: "subscription-test",
  amount: { value: AMOUNT, currency: "EUR" },
  interval: "month",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function intent() {
  return {
    id: "pi_test",
    amount: AMOUNT,
    amount_received: AMOUNT,
    currency: "eur",
    created: NOW / SECOND_MS,
    status: "succeeded",
    metadata: {},
    latest_charge: "ch_test",
  };
}

function subscription(params: URLSearchParams) {
  return {
    id: "sub_test",
    customer: "cus_test",
    default_payment_method: "pm_test",
    status: "trialing",
    created: NOW / SECOND_MS,
    trial_end: Number(params.get("trial_end")) || null,
    cancel_at_period_end: false,
    metadata: { antelope_reference: REQUEST.reference },
    latest_invoice: null,
    items: {
      data: [
        {
          current_period_start: NOW / SECOND_MS,
          current_period_end: FUTURE / SECOND_MS,
          price: {
            unit_amount: AMOUNT,
            currency: "eur",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
}

class ProviderFixture {
  chargeUnavailable = false;
  shouldDecline = false;
  declineCode: string | undefined = "insufficient_funds";
  readonly saved = new Map<string, ReturnType<typeof subscription>>();
  readonly client = new Stripe("sk_test_fixture", {
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(
      async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        const routes: Record<string, () => Response> = {
          "/v1/checkout/sessions": () => {
            assert.ok(typeof init?.body === "string");
            const params = new URLSearchParams(init.body);
            if (params.get("managed_payments[enabled]") !== "false") {
              return response(
                {
                  error: {
                    type: "invalid_request_error",
                    message: "Managed Payments requires a product tax code",
                  },
                },
                400,
              );
            }
            return response({
              id: "cs_test",
              url: "https://checkout.stripe.com/test",
              status: "open",
              payment_intent: null,
            });
          },
          "/v1/subscriptions": () => this.create(init),
          "/v1/products": () => response({ id: "prod_test" }),
          "/v1/charges/ch_test": () => this.charge(),
          "/v1/payment_intents/pi_test": () =>
            response({
              ...intent(),
              status: "canceled",
              latest_charge: null,
            }),
          "/v1/invoice_payments": () => response({ data: [] }),
        };
        const route = routes[path];
        assert.ok(route, `Unexpected provider request: ${path}`);
        return route();
      },
    ),
  });

  private charge(): Response {
    if (this.chargeUnavailable) {
      return response(
        { error: { type: "api_error", message: "unavailable" } },
        503,
      );
    }
    return response({
      id: "ch_test",
      amount_refunded: REFUNDED,
      payment_intent: "pi_test",
    });
  }

  private create(init?: RequestInit): Response {
    const key = new Headers(init?.headers).get("idempotency-key") ?? "";
    const previous = this.saved.get(key);
    if (previous) return response(previous);
    assert.ok(typeof init?.body === "string");
    const params = new URLSearchParams(init.body);
    const date = params.get("trial_end") ?? params.get("billing_cycle_anchor");
    if (date && Number(date) * SECOND_MS <= Date.now()) {
      return response(
        {
          error: {
            type: "invalid_request_error",
            message: "Date must be in the future",
          },
        },
        400,
      );
    }
    if (this.shouldDecline) return this.declined();
    const created = subscription(params);
    this.saved.set(key, created);
    return response(created);
  }

  private declined(): Response {
    return response(
      {
        error: {
          type: "card_error",
          code: "card_declined",
          decline_code: this.declineCode,
          message: "Your card was declined",
          charge: "ch_test",
        },
      },
      402,
    );
  }
}

describe("[stripe] provider boundary regressions without credentials", () => {
  let fixture: ProviderFixture;

  beforeEach(() => {
    fixture = new ProviderFixture();
    RegisterAccount(PROVIDER, fixture.client, SECRET);
  });

  afterEach(() => mock.restoreAll());

  function deliver(type: string, object: unknown) {
    return VerifyWebhook(SignedWebhook(type, object, SECRET), PROVIDER);
  }

  it("creates standard checkout when the account defaults to Managed Payments", async () => {
    const session = await CreateCheckoutSession(
      {
        reference: "checkout-test",
        amount: { value: AMOUNT, currency: "EUR" },
        successUrl: "https://merchant.invalid/success",
        cancelUrl: "https://merchant.invalid/cancel",
      },
      "standard-checkout",
      PROVIDER,
    );
    assert.equal(session.id, "cs_test");
    assert.equal(session.status, "pending");
    assert.equal(session.redirectUrl, "https://checkout.stripe.com/test");
  });

  it("reports an immediately successful refund, but not a pending creation", async () => {
    const refund = {
      id: "re_test",
      amount: REFUNDED,
      currency: "eur",
      created: NOW / SECOND_MS,
      payment_intent: "pi_test",
      metadata: {},
    };
    const event = await deliver("refund.created", {
      ...refund,
      status: "succeeded",
    });
    assert.equal(event?.type, "refund.succeeded");
    assert.equal(event?.refund?.payment, "pi_test");
    assert.equal(event?.refund?.amount.value, REFUNDED);
    assert.equal(
      await deliver("refund.created", { ...refund, status: "pending" }),
      undefined,
    );
  });

  it("rejects failed enrichment and reports the refunded total on redelivery", async () => {
    fixture.chargeUnavailable = true;
    await assert.rejects(
      deliver("payment_intent.succeeded", intent()),
      /unavailable/,
    );
    fixture.chargeUnavailable = false;
    const event = await deliver("payment_intent.succeeded", intent());
    assert.equal(event?.payment?.amountRefunded.value, REFUNDED);
    assert.equal(event?.payment?.amountRefunded.currency, "EUR");
  });

  for (const field of ["trialEnd", "billingAnchor"] as const) {
    it(`replays a creation after its ${field}, but rejects a new expired request`, async () => {
      let now = NOW;
      mock.method(Date, "now", () => now);
      const request = { ...REQUEST, [field]: FUTURE };
      const created = await CreateSubscription(request, "original", PROVIDER);
      now = FUTURE + SECOND_MS;
      assert.deepEqual(
        await CreateSubscription(request, "original", PROVIDER),
        created,
      );
      await assert.rejects(
        CreateSubscription(request, "new", PROVIDER),
        InvalidSubscriptionRequestError,
      );
    });
  }

  it("preserves the specific decline code, falling back to the generic code", async () => {
    fixture.shouldDecline = true;
    fixture.chargeUnavailable = true;
    await assert.rejects(
      CreateSubscription(REQUEST, "declined", PROVIDER),
      (error: unknown) => {
        assert.ok(error instanceof SubscriptionError);
        assert.equal(error.message, "unavailable");
        return true;
      },
    );
    fixture.chargeUnavailable = false;
    await assert.rejects(
      CreateSubscription(REQUEST, "declined", PROVIDER),
      (error: unknown) => {
        assert.ok(error instanceof SubscriptionPaymentError);
        assert.equal(error.providerCode, "insufficient_funds");
        assert.equal(error.payment.id, "pi_test");
        return true;
      },
    );
    fixture.declineCode = undefined;
    await assert.rejects(
      CreateSubscription(REQUEST, "generic", PROVIDER),
      (error: unknown) => {
        assert.ok(error instanceof SubscriptionPaymentError);
        assert.equal(error.providerCode, "card_declined");
        return true;
      },
    );
  });
});
