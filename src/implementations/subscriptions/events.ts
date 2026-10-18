import Stripe from "stripe";
import type {
  SubscriptionEvent,
  SubscriptionEventHandler,
  SubscriptionEventType,
} from "@antelopejs/interface-subscriptions";

import { ToEpochMillis } from "../payment/mapping";
import { EXPAND_LATEST_PAYMENT } from "./subscriptions";
import { IsOwnSubscription, ToSubscription } from "./mapping";

const handlers = new Map<string, SubscriptionEventHandler>();
const NO_CHARGE = 0;

export function RegisterHandler(
  id: string,
  handler: SubscriptionEventHandler,
): void {
  handlers.set(id, handler);
}

export function UnregisterHandler(id: string): void {
  handlers.delete(id);
}

type Builder = (
  client: Stripe,
  event: Stripe.Event,
) => Promise<SubscriptionEvent | undefined>;

interface Identified {
  id?: string;
}

function idOf(field: string | Identified): string {
  return typeof field === "string" ? field : (field.id ?? "");
}

async function PaymentOfInvoice(
  client: Stripe,
  invoice: string | Stripe.Invoice | null | undefined,
): Promise<string | undefined> {
  if (!invoice) return undefined;
  const payments = await client.invoicePayments.list({
    invoice: idOf(invoice),
  });
  const intent = payments.data.find(
    (entry) => entry.payment.type === "payment_intent",
  )?.payment.payment_intent;
  return intent ? idOf(intent) : undefined;
}

function fromSubscription(type: SubscriptionEventType): Builder {
  return async (client, event) => {
    const subscription = event.data.object as Stripe.Subscription;
    if (!IsOwnSubscription(subscription.metadata)) return undefined;
    const payment = await PaymentOfInvoice(client, subscription.latest_invoice);
    return {
      id: event.id,
      type,
      createdAt: ToEpochMillis(event.created),
      subscription: ToSubscription(subscription, payment),
    };
  };
}

function subscriptionOf(invoice: Stripe.Invoice): string | undefined {
  const details = invoice.parent?.subscription_details;
  if (!details || !IsOwnSubscription(details.metadata)) return undefined;
  return idOf(details.subscription);
}

function fromInvoice(type: SubscriptionEventType): Builder {
  return async (client, event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const subscription = subscriptionOf(invoice);
    const isFreePeriod =
      type === "subscription.payment_succeeded" &&
      invoice.amount_paid === NO_CHARGE;
    if (!subscription || isFreePeriod) return undefined;
    const payment = await PaymentOfInvoice(client, invoice.id);
    const current = await client.subscriptions.retrieve(subscription, {
      expand: EXPAND_LATEST_PAYMENT,
    });
    const built: SubscriptionEvent = {
      id: event.id,
      type,
      createdAt: ToEpochMillis(event.created),
      subscription: ToSubscription(current),
    };
    if (payment) built.payment = payment;
    return built;
  };
}

const BUILDERS: Record<string, Builder> = {
  "customer.subscription.created": fromSubscription("subscription.created"),
  "customer.subscription.deleted": fromSubscription("subscription.canceled"),
  "invoice.paid": fromInvoice("subscription.payment_succeeded"),
  "invoice.payment_failed": fromInvoice("subscription.payment_failed"),
};

export async function DispatchSubscriptionEvent(
  client: Stripe,
  event: Stripe.Event,
): Promise<void> {
  const build = BUILDERS[event.type];
  if (!build) return;
  const built = await build(client, event);
  if (!built) return;
  await Promise.all(
    [...handlers.values()].map(async (handler) => handler(built)),
  );
}

export async function SubscriptionOfPayment(
  client: Stripe,
  paymentIntent: string,
): Promise<string | undefined> {
  const payments = await client.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntent },
    expand: ["data.invoice"],
  });
  const invoice = payments.data[0]?.invoice;
  const isReadable =
    invoice !== undefined && typeof invoice !== "string" && !invoice.deleted;
  return isReadable ? subscriptionOf(invoice as Stripe.Invoice) : undefined;
}
