import Stripe from "stripe";
import assert from "node:assert/strict";
import {
  PAYMENT_EVENT_TYPES,
  type PaymentEvent,
  VerifyWebhook,
  WebhookVerificationError,
} from "@antelopejs/interface-payment";

const SECRET = process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "";
const EPOCH_MILLIS_FLOOR = Date.UTC(2020, 0, 1);
const CREATED_SECONDS = 1_760_000_000;
const CREATED_MILLIS = CREATED_SECONDS * 1000;
const AMOUNT = 2500;
const CAPTURED = 1000;
const REFUNDED = 700;

const signer = new Stripe("sk_test_unused_for_signing_only", {
  apiVersion: undefined as unknown as Stripe.LatestApiVersion,
});

function deliver(
  type: string,
  object: unknown,
): Promise<PaymentEvent | undefined> {
  const payload = JSON.stringify({
    id: `evt_${type.replace(/\W/g, "_")}`,
    object: "event",
    created: CREATED_SECONDS,
    type,
    data: { object },
  });
  const signature = signer.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
  });
  return VerifyWebhook({
    body: Buffer.from(payload),
    headers: { "stripe-signature": signature },
  });
}

function intent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "pi_webhook",
    object: "payment_intent",
    amount: AMOUNT,
    amount_received: 0,
    currency: "eur",
    created: CREATED_SECONDS,
    status: "succeeded",
    metadata: { antelope_reference: "order-99", tier: "gold" },
    latest_charge: "ch_webhook",
    ...overrides,
  };
}

describe("[stripe] webhook event normalisation", () => {
  before(function () {
    if (!SECRET) this.skip();
  });

  it("normalises a succeeded intent, in minor units and epoch milliseconds", async () => {
    const event = await deliver(
      "payment_intent.succeeded",
      intent({ amount_received: AMOUNT }),
    );

    assert.ok(event, "a modelled delivery must produce an event");
    assert.equal(event.type, "payment.succeeded");
    assert.ok(PAYMENT_EVENT_TYPES.includes(event.type));
    assert.equal(event.createdAt, CREATED_MILLIS);
    assert.ok(event.createdAt > EPOCH_MILLIS_FLOOR);
    assert.ok(event.payment, "a payment event must carry the payment");
    assert.equal(event.payment.id, "pi_webhook");
    assert.equal(event.payment.status, "succeeded");
    assert.equal(event.payment.amount.currency, "EUR");
    assert.equal(event.payment.amount.value, AMOUNT);
    assert.equal(event.payment.amountCaptured.value, AMOUNT);
    assert.equal(event.payment.createdAt, CREATED_MILLIS);
    assert.equal(event.payment.reference, "order-99");
    assert.deepEqual(event.payment.metadata, { tier: "gold" });
    assert.equal(event.refund, undefined);
    assert.equal(event.dispute, undefined);
  });

  it("reports a held authorization as authorized, not succeeded", async () => {
    const event = await deliver(
      "payment_intent.amount_capturable_updated",
      intent({ status: "requires_capture", amount_capturable: AMOUNT }),
    );

    assert.equal(event?.type, "payment.authorized");
    assert.equal(event?.payment?.status, "authorized");
    assert.equal(event?.payment?.amountCaptured.value, 0);
  });

  it("carries the decline reason on a failed intent", async () => {
    const event = await deliver(
      "payment_intent.payment_failed",
      intent({
        status: "requires_payment_method",
        last_payment_error: {
          code: "card_declined",
          decline_code: "insufficient_funds",
          message: "Your card has insufficient funds.",
        },
      }),
    );

    assert.equal(event?.type, "payment.failed");
    assert.equal(event?.payment?.status, "failed");
    assert.equal(event?.payment?.failure?.code, "insufficient_funds");
    assert.equal(event?.payment?.failure?.providerCode, "insufficient_funds");
    assert.ok(event?.payment?.failure?.message);
  });

  it("reports a canceled intent", async () => {
    const event = await deliver(
      "payment_intent.canceled",
      intent({ status: "canceled" }),
    );

    assert.equal(event?.type, "payment.canceled");
    assert.equal(event?.payment?.status, "canceled");
    assert.equal(event?.payment?.failure, undefined);
  });
});

describe("[stripe] webhook refunds, disputes and rejection", () => {
  before(function () {
    if (!SECRET) this.skip();
  });

  it("normalises a settled refund", async () => {
    const event = await deliver("refund.updated", {
      id: "re_webhook",
      object: "refund",
      amount: REFUNDED,
      currency: "eur",
      created: CREATED_SECONDS,
      status: "succeeded",
      payment_intent: "pi_webhook",
      metadata: {},
    });

    assert.equal(event?.type, "refund.succeeded");
    assert.ok(event?.refund);
    assert.equal(event.refund.id, "re_webhook");
    assert.equal(event.refund.payment, "pi_webhook");
    assert.equal(event.refund.amount.value, REFUNDED);
    assert.equal(event.refund.amount.currency, "EUR");
    assert.equal(event.refund.createdAt, CREATED_MILLIS);
    assert.equal(event.payment, undefined);
  });

  it("ignores a refund that has not settled yet", async () => {
    const event = await deliver("refund.updated", {
      id: "re_pending",
      object: "refund",
      amount: REFUNDED,
      currency: "eur",
      created: CREATED_SECONDS,
      status: "pending",
      payment_intent: "pi_webhook",
      metadata: {},
    });

    assert.equal(
      event,
      undefined,
      "a pending refund is not a refund.succeeded or refund.failed",
    );
  });

  it("normalises an opened dispute", async () => {
    const event = await deliver("charge.dispute.created", {
      id: "dp_webhook",
      object: "dispute",
      amount: CAPTURED,
      currency: "eur",
      created: CREATED_SECONDS,
      reason: "fraudulent",
      payment_intent: "pi_webhook",
    });

    assert.equal(event?.type, "dispute.opened");
    assert.equal(event?.dispute?.id, "dp_webhook");
    assert.equal(event?.dispute?.payment, "pi_webhook");
    assert.equal(event?.dispute?.amount.currency, "EUR");
    assert.equal(event?.dispute?.reason, "fraudulent");
    assert.equal(event?.dispute?.createdAt, CREATED_MILLIS);
  });

  it("resolves undefined for a genuine delivery it does not model", async () => {
    const event = await deliver("payout.paid", {
      id: "po_webhook",
      object: "payout",
      amount: AMOUNT,
      currency: "eur",
    });

    assert.equal(
      event,
      undefined,
      "an unmodelled delivery is genuine, not an error",
    );
  });

  it("refuses a payload signed with the wrong secret", async () => {
    const payload = JSON.stringify({
      id: "evt_forged",
      object: "event",
      created: CREATED_SECONDS,
      type: "payment_intent.succeeded",
      data: { object: intent({ amount_received: AMOUNT }) },
    });
    const signature = signer.webhooks.generateTestHeaderString({
      payload,
      secret: `${SECRET}_but_wrong`,
    });

    await assert.rejects(
      () =>
        VerifyWebhook({
          body: Buffer.from(payload),
          headers: { "stripe-signature": signature },
        }),
      WebhookVerificationError,
    );
  });

  it("refuses a body altered after signing", async () => {
    const payload = JSON.stringify({
      id: "evt_tampered",
      object: "event",
      created: CREATED_SECONDS,
      type: "payment_intent.succeeded",
      data: { object: intent({ amount_received: AMOUNT }) },
    });
    const signature = signer.webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
    });

    await assert.rejects(
      () =>
        VerifyWebhook({
          body: Buffer.from(payload.replace(`${AMOUNT}`, "999999")),
          headers: { "stripe-signature": signature },
        }),
      WebhookVerificationError,
      "the signature covers the bytes, so an edited amount must not verify",
    );
  });
});
