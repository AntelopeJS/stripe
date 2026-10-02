import Stripe from "stripe";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { GetPayment, VerifyWebhook } from "@antelopejs/interface-payment";
import {
  CancelSubscription,
  CreateSubscription,
  GetSubscription,
  ListSubscriptions,
  SUBSCRIPTION_METADATA_KEY,
  type Subscription,
  type SubscriptionEvent,
  SubscriptionEvents,
  SubscriptionPaymentError,
  UpdateSubscriptionPaymentMethod,
} from "@antelopejs/interface-subscriptions";

const SUITE_TIMEOUT = 600_000;
const CLOCK_READY_TIMEOUT = 180_000;
const CLOCK_POLL = 2_000;
const SECOND_MS = 1000;
const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;
const AFTER_RENEWAL_S = 2 * HOUR_S;
const TRIAL_DAYS = 7;
const SUCCEEDING_CARD = "pm_card_visa";
const FAILING_CARD = "pm_card_chargeCustomerFail";
const AMOUNT = { value: 1900, currency: "EUR" };
const REFUSED_STATUSES: readonly string[] = ["failed", "canceled"];

const client = new Stripe(process.env.STRIPE_KEY ?? "");
const signer = new Stripe("sk_test_unused_for_signing_only");
const clocks: string[] = [];

interface ClockPayer {
  clock: string;
  now: number;
  customer: string;
  paymentMethod: string;
}

function key(): string {
  return `stripe-clock-${randomUUID()}`;
}

async function attach(customer: string, card: string): Promise<string> {
  return (await client.paymentMethods.attach(card, { customer })).id;
}

async function clockPayer(card = SUCCEEDING_CARD): Promise<ClockPayer> {
  const now = Math.floor(Date.now() / SECOND_MS);
  const clock = await client.testHelpers.testClocks.create({
    frozen_time: now,
  });
  clocks.push(clock.id);
  const customer = await client.customers.create({ test_clock: clock.id });
  return {
    clock: clock.id,
    now,
    customer: customer.id,
    paymentMethod: await attach(customer.id, card),
  };
}

async function advance(clock: string, to: number): Promise<void> {
  await client.testHelpers.testClocks.advance(clock, { frozen_time: to });
  const deadline = Date.now() + CLOCK_READY_TIMEOUT;
  let status = "advancing";
  while (status !== "ready" && Date.now() < deadline) {
    await delay(CLOCK_POLL);
    status = (await client.testHelpers.testClocks.retrieve(clock)).status;
  }
  assert.equal(status, "ready", `test clock ${clock} never finished advancing`);
}

function subscribe(
  payer: ClockPayer,
  overrides: Record<string, unknown> = {},
): Promise<Subscription> {
  return CreateSubscription(
    {
      reference: `clock-${randomUUID()}`,
      customer: payer.customer,
      paymentMethod: payer.paymentMethod,
      amount: AMOUNT,
      interval: "month",
      ...overrides,
    },
    key(),
  );
}

function pastPeriodEnd(subscription: Subscription): number {
  return subscription.currentPeriodEnd / SECOND_MS + AFTER_RENEWAL_S;
}

async function deliverAndCollect(
  type: string,
  object: unknown,
): Promise<SubscriptionEvent[]> {
  const collected: SubscriptionEvent[] = [];
  const handler = `stripe-clock-${randomUUID()}`;
  SubscriptionEvents.register(handler, (event) => void collected.push(event));
  try {
    const payload = JSON.stringify({
      id: `evt_${randomUUID().replace(/-/g, "")}`,
      object: "event",
      created: Math.floor(Date.now() / SECOND_MS),
      type,
      data: { object },
    });
    await VerifyWebhook({
      body: Buffer.from(payload),
      headers: {
        "stripe-signature": signer.webhooks.generateTestHeaderString({
          payload,
          secret: process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "",
        }),
      },
    });
  } finally {
    SubscriptionEvents.unregister(handler);
  }
  return collected;
}

after(async () => {
  await Promise.all(
    clocks.map((clock) =>
      client.testHelpers.testClocks.del(clock).catch(() => undefined),
    ),
  );
});

describe("[stripe] subscriptions on a test clock", function () {
  this.timeout(SUITE_TIMEOUT);

  it("renews at the period end, with a charge marked as the subscription's", async () => {
    const payer = await clockPayer();
    const created = await subscribe(payer);

    await advance(payer.clock, pastPeriodEnd(created));
    const renewed = await GetSubscription(created.id);

    assert.equal(renewed.status, "active");
    assert.equal(renewed.currentPeriodStart, created.currentPeriodEnd);
    assert.notEqual(renewed.latestPayment, created.latestPayment);
    const payment = await GetPayment(renewed.latestPayment!);
    assert.equal(payment.status, "succeeded");
    assert.equal(payment.metadata?.[SUBSCRIPTION_METADATA_KEY], created.id);
  });

  it("charges the first period when the trial ends", async () => {
    const payer = await clockPayer();
    const trialEnd = (payer.now + TRIAL_DAYS * DAY_S) * SECOND_MS;
    const created = await subscribe(payer, { trialEnd });
    assert.equal(created.status, "trialing");

    await advance(payer.clock, trialEnd / SECOND_MS + AFTER_RENEWAL_S);
    const paid = await GetSubscription(created.id);

    assert.equal(paid.status, "active");
    assert.equal(paid.currentPeriodStart, trialEnd);
    assert.ok(paid.latestPayment, "the first period was charged");
  });

  it("goes past_due when the method it is switched to stops paying", async () => {
    const payer = await clockPayer();
    const created = await subscribe(payer);
    const failing = await attach(payer.customer, FAILING_CARD);
    await UpdateSubscriptionPaymentMethod(created.id, failing, key());

    await advance(payer.clock, pastPeriodEnd(created));
    const failed = await GetSubscription(created.id);

    assert.equal(failed.status, "past_due");
    assert.equal(failed.currentPeriodStart, created.currentPeriodEnd);

    const invoice = await client.invoices.retrieve(
      (await client.subscriptions.retrieve(created.id))
        .latest_invoice as string,
    );
    const [event] = await deliverAndCollect("invoice.payment_failed", invoice);
    assert.equal(event?.type, "subscription.payment_failed");
    assert.equal(event?.subscription.id, created.id);
    assert.equal(event?.subscription.status, "past_due");
    assert.equal(event?.payment, failed.latestPayment);
  });

  it("ends at the period end when cancelled for then, without charging", async () => {
    const payer = await clockPayer();
    const created = await subscribe(payer);
    await CancelSubscription(created.id, key(), "period_end");

    await advance(payer.clock, pastPeriodEnd(created));
    const ended = await GetSubscription(created.id);

    assert.equal(ended.status, "canceled");
    assert.equal(ended.endReason, "requested");
    assert.equal(ended.endedAt, created.currentPeriodEnd);
    assert.equal(ended.latestPayment, created.latestPayment);
  });
});

describe("[stripe] a declined first period", function () {
  this.timeout(SUITE_TIMEOUT);

  it("is refused with the voided payment and the decline code, and replays the same", async () => {
    const payer = await clockPayer(FAILING_CARD);
    const request = {
      reference: `declined-${randomUUID()}`,
      customer: payer.customer,
      paymentMethod: payer.paymentMethod,
      amount: AMOUNT,
      interval: "month" as const,
    };
    const idempotencyKey = key();
    const refuse = () =>
      CreateSubscription(request, idempotencyKey).then(
        () => assert.fail("a declined first period must not create anything"),
        (error: unknown) => error,
      );

    const first = await refuse();
    assert.ok(first instanceof SubscriptionPaymentError, String(first));
    assert.ok(REFUSED_STATUSES.includes(first.payment.status));
    assert.equal(first.providerCode, "card_declined");
    assert.equal(
      (await GetPayment(first.payment.id)).status,
      first.payment.status,
    );
    assert.deepEqual(await ListSubscriptions(payer.customer), []);

    const replay = await refuse();
    assert.ok(replay instanceof SubscriptionPaymentError);
    assert.equal(
      replay.payment.id,
      first.payment.id,
      "a replay charges nothing",
    );
  });
});
