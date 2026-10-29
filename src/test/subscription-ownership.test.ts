import Stripe from "stripe";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { GetPayment } from "@antelopejs/interface-payment";
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

import { DeliverWebhook as deliver } from "./signed-webhook";
import { IsStripeId } from "../implementations/fields";

const SUITE_TIMEOUT = 120_000;
const HANDLER = "stripe-subscription-ownership";

const client = new Stripe(process.env.STRIPE_KEY ?? "");
const received: SubscriptionEvent[] = [];
let foreign: Stripe.Subscription;
let product: string;
let method: string;

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
    const { customer } = foreign;
    assert.ok(IsStripeId(customer), "the subscription names its customer");
    assert.deepEqual(await ListSubscriptions(customer), []);
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
    const { latest_invoice } = foreign;
    assert.ok(IsStripeId(latest_invoice), "the subscription has an invoice");
    const invoice = await client.invoices.retrieve(latest_invoice);

    await deliver("customer.subscription.created", foreign);
    await deliver("invoice.paid", invoice);

    assert.deepEqual(
      received.filter((event) => event.subscription.id === foreign.id),
      [],
    );
  });

  it("leave their charges unmarked", async () => {
    const { latest_invoice } = foreign;
    assert.ok(IsStripeId(latest_invoice), "the subscription has an invoice");
    const payments = await client.invoicePayments.list({
      invoice: latest_invoice,
    });
    const intent = payments.data[0].payment.payment_intent;
    assert.ok(IsStripeId(intent), "the invoice was paid by a payment intent");

    const payment = await GetPayment(intent);

    assert.equal(payment.metadata?.[SUBSCRIPTION_METADATA_KEY], undefined);
  });
});
