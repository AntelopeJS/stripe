import Stripe from "stripe";
import assert from "node:assert/strict";
import {
  CapturePayment,
  CreatePayment,
  GetPayment,
  InvalidPaymentStateError,
  PaymentError,
  PaymentNotFoundError,
  RefundPayment,
} from "@antelopejs/interface-payment";

import { TranslateError } from "../implementations/payment/errors";

const EUR = "EUR";
const CHARGE_VALUE = 2500;
const TEST_METHOD = "pm_card_visa";
const REFUND_CONTEXT = { entity: "refund" as const, uncodedIsState: true };
const SUITE_TIMEOUT = 60_000;

function key(): string {
  return `antelope-errors-${Math.random().toString(36).slice(2)}`;
}

function stripeError(
  Kind: new (raw: Stripe.StripeRawError) => Stripe.errors.StripeError,
  raw: Partial<Stripe.StripeRawError>,
): Stripe.errors.StripeError {
  return new Kind({ message: "boom", ...raw } as Stripe.StripeRawError);
}

describe("[stripe] translating provider errors", () => {
  it("does not report an outage as a permanent refusal", () => {
    const outages = [
      stripeError(Stripe.errors.StripeAuthenticationError, {
        type: "authentication_error",
      }),
      stripeError(Stripe.errors.StripeAPIError, { type: "api_error" }),
      stripeError(Stripe.errors.StripeRateLimitError, {
        type: "rate_limit_error",
      }),
    ];

    for (const outage of outages) {
      const translated = TranslateError(outage, "pi_x", REFUND_CONTEXT);
      assert.ok(
        translated instanceof PaymentError,
        `${outage.constructor.name} must stay in the interface vocabulary`,
      );
      assert.equal(
        translated instanceof InvalidPaymentStateError,
        false,
        `${outage.constructor.name} is retryable and must not read as a refusal`,
      );
    }
  });

  it("still reports an uncoded invalid request as a state problem", () => {
    const rejected = stripeError(Stripe.errors.StripeInvalidRequestError, {
      type: "invalid_request_error",
    });

    assert.ok(
      TranslateError(rejected, "pi_x", REFUND_CONTEXT) instanceof
        InvalidPaymentStateError,
    );
  });

  it("reports an identifier the provider cannot parse as not found", () => {
    const missing = stripeError(Stripe.errors.StripeInvalidRequestError, {
      type: "invalid_request_error",
      code: "resource_missing",
    });

    assert.ok(
      TranslateError(missing, "pi_x", { entity: "payment" }) instanceof
        PaymentNotFoundError,
    );
  });

  it("leaves a non-Stripe failure alone", () => {
    const failure = new TypeError("something else entirely");
    assert.equal(TranslateError(failure, "pi_x", REFUND_CONTEXT), failure);
  });
});

describe("[stripe] rejections the contract names", function () {
  this.timeout(SUITE_TIMEOUT);

  async function captured(): Promise<string> {
    const payment = await CreatePayment(
      {
        amount: { value: CHARGE_VALUE, currency: EUR },
        reference: key(),
        paymentMethod: TEST_METHOD,
        offSession: true,
      },
      key(),
    );
    assert.equal(payment.status, "succeeded");
    return payment.id;
  }

  it("reports an over-capture as a state problem, not a generic error", async () => {
    const authorized = await CreatePayment(
      {
        amount: { value: CHARGE_VALUE, currency: EUR },
        reference: key(),
        paymentMethod: TEST_METHOD,
        offSession: true,
        authorizeOnly: true,
      },
      key(),
    );
    assert.equal(authorized.status, "authorized");

    await assert.rejects(
      () =>
        CapturePayment(authorized.id, key(), {
          value: CHARGE_VALUE * 2,
          currency: EUR,
        }),
      InvalidPaymentStateError,
      "capturing more than was authorized is a state problem",
    );
  });

  it("refuses savePaymentMethod without a customer, before reaching Stripe", async () => {
    await assert.rejects(
      () =>
        CreatePayment(
          {
            amount: { value: CHARGE_VALUE, currency: EUR },
            reference: key(),
            paymentMethod: TEST_METHOD,
            savePaymentMethod: true,
            returnUrl: "https://merchant.invalid/return",
          },
          key(),
        ),
      (error: unknown) =>
        error instanceof PaymentError &&
        /requires a customer/.test(error.message),
    );
  });

  it("refuses savePaymentMethod combined with offSession", async () => {
    await assert.rejects(
      () =>
        CreatePayment(
          {
            amount: { value: CHARGE_VALUE, currency: EUR },
            reference: key(),
            paymentMethod: TEST_METHOD,
            customer: "cus_irrelevant",
            offSession: true,
            savePaymentMethod: true,
          },
          key(),
        ),
      (error: unknown) =>
        error instanceof PaymentError && /offSession/.test(error.message),
    );
  });

  it("reports an unconfigured provider selector in the interface vocabulary", async () => {
    await assert.rejects(
      () => GetPayment("pi_irrelevant", "no-such-account"),
      (error: unknown) =>
        error instanceof PaymentError && /no-such-account/.test(error.message),
      "a misspelled account name must not escape as a bare Error",
    );
  });

  it("preserves a refund reason Stripe has no field for", async () => {
    const payment = await captured();
    const refund = await RefundPayment(
      { payment, amount: { value: 100, currency: EUR }, reason: "other" },
      key(),
    );

    assert.equal(refund.metadata?.antelope_refund_reason, "other");
  });
});
