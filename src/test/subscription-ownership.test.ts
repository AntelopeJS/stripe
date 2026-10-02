import Stripe from "stripe";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { GetPayment, VerifyWebhook } from "@antelopejs/interface-payment";
import {
  CancelSubscription,
  GetSubscription,
  ListSubscriptions,
  SUBSCRIPTION_METADATA_KEY,
  type SubscriptionEvent,
  SubscriptionEvents,
  SubscriptionNotFoundError,
  UpdateSubscriptionPaymentMethod,
} from "@antelopejs/interface-subscriptions";

const SUITE_TIMEOUT = 120_000;
const SECRET = process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "";
const SECOND_MS = 1000;
const HANDLER = "stripe-subscription-ownership";

const client = new Stripe(process.env.STRIPE_KEY ?? "");
const signer = new Stripe("sk_test_unused_for_signing_only");
const received: SubscriptionEvent[] = [];
let foreign: Stripe.Subscription;
let product: string;
let method: string;

function deliver(type: string, object: unknown) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    created: Math.floor(Date.now() / SECOND_MS),
    type,
    data: { object },
  });
  return VerifyWebhook({
    body: Buffer.from(payload),
    headers: {
      "stripe-signature": signer.webhooks.generateTestHeaderString({
        payload,
        secret: SECRET,
      }),
    },
  });
}

async function createdElsewhere(): Promise<Stripe.Subscription> {
  const customer = await client.customers.create({
    name: "Made in the dashboard",
  });
  method = (
    await client.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    })
  ).id;
  product = (await client.products.create({ name: "Not this module's" })).id;
  return client.subscriptions.create({
    customer: customer.id,
    default_payment_method: method,
    items: [
      {
        price_data: {
          currency: "eur",
          product,
          unit_amount: 1900,
          recurring: { interval: "month" },
        },
      },
    ],
    payment_behavior: "error_if_incomplete",
    off_session: true,
  });
}

describe("[stripe] subscriptions made outside this module", function () {
  this.timeout(SUITE_TIMEOUT);

  before(async () => {
    foreign = await createdElsewhere();
    SubscriptionEvents.register(HANDLER, (event) => void received.push(event));
  });

  after(async () => {
    SubscriptionEvents.unregister(HANDLER);
    await client.subscriptions.cancel(foreign.id).catch(() => undefined);
    await client.products
      .update(product, { active: false })
      .catch(() => undefined);
  });

  it("are not found, listed, cancelled or changed through the interface", async () => {
    await assert.rejects(
      GetSubscription(foreign.id),
      SubscriptionNotFoundError,
    );
    assert.deepEqual(await ListSubscriptions(foreign.customer as string), []);
    await assert.rejects(
      CancelSubscription(foreign.id, `ownership-${randomUUID()}`, "now"),
      SubscriptionNotFoundError,
    );
    await assert.rejects(
      UpdateSubscriptionPaymentMethod(
        foreign.id,
        method,
        `ownership-${randomUUID()}`,
      ),
      SubscriptionNotFoundError,
    );
    assert.equal(
      (await client.subscriptions.retrieve(foreign.id)).status,
      "active",
    );
  });

  it("raise no subscription events", async () => {
    const invoice = await client.invoices.retrieve(
      foreign.latest_invoice as string,
    );

    await deliver("customer.subscription.created", foreign);
    await deliver("invoice.paid", invoice);

    assert.deepEqual(
      received.filter((event) => event.subscription.id === foreign.id),
      [],
    );
  });

  it("leave their charges unmarked", async () => {
    const payments = await client.invoicePayments.list({
      invoice: foreign.latest_invoice as string,
    });
    const intent = payments.data[0].payment.payment_intent as string;

    const payment = await GetPayment(intent);

    assert.equal(payment.metadata?.[SUBSCRIPTION_METADATA_KEY], undefined);
  });
});
