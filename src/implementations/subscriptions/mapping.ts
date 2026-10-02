import Stripe from "stripe";
import type {
  Subscription,
  SubscriptionInterval,
  SubscriptionStatus,
} from "@antelopejs/interface-subscriptions";

import { ReadMetadata, ToEpochMillis } from "../payment/mapping";

const STATUS_BY_STRIPE: Record<Stripe.Subscription.Status, SubscriptionStatus> =
  {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    unpaid: "past_due",
    incomplete: "past_due",
    paused: "past_due",
    canceled: "canceled",
    incomplete_expired: "canceled",
  };

const PAYMENT_FAILED = "payment_failed";

function firstItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem {
  const item = subscription.items.data[0];
  if (!item) {
    throw new Error(`Subscription ${subscription.id} has no item`);
  }
  return item;
}

function idOf(field: string | { id: string } | null): string | undefined {
  if (field === null) return undefined;
  return typeof field === "string" ? field : field.id;
}

function LatestInvoicePayment(
  invoice: Stripe.Invoice | null,
): string | undefined {
  const payment = invoice?.payments?.data.find(
    (entry) => entry.payment.type === "payment_intent",
  );
  return payment ? idOf(payment.payment.payment_intent ?? null) : undefined;
}

function latestInvoice(
  subscription: Stripe.Subscription,
): Stripe.Invoice | null {
  const invoice = subscription.latest_invoice;
  return invoice && typeof invoice !== "string" ? invoice : null;
}

function ending(
  subscription: Stripe.Subscription,
): Pick<Subscription, "endedAt" | "endReason"> {
  const endedAt =
    subscription.ended_at ?? subscription.canceled_at ?? subscription.created;
  const isPaymentFailure =
    subscription.cancellation_details?.reason === PAYMENT_FAILED;
  return {
    endedAt: ToEpochMillis(endedAt),
    endReason: isPaymentFailure ? "payment_failed" : "requested",
  };
}

export function ToSubscription(
  subscription: Stripe.Subscription,
  latestPayment = LatestInvoicePayment(latestInvoice(subscription)),
): Subscription {
  const item = firstItem(subscription);
  const status = STATUS_BY_STRIPE[subscription.status];
  const { reference, metadata } = ReadMetadata(subscription.metadata);
  const result: Subscription = {
    id: subscription.id,
    reference,
    customer: idOf(subscription.customer) ?? "",
    paymentMethod: idOf(subscription.default_payment_method) ?? "",
    amount: {
      value: item.price.unit_amount ?? 0,
      currency: item.price.currency.toUpperCase(),
    },
    interval: (item.price.recurring?.interval ??
      "month") as SubscriptionInterval,
    intervalCount: item.price.recurring?.interval_count ?? 1,
    status,
    currentPeriodStart: ToEpochMillis(item.current_period_start),
    currentPeriodEnd: ToEpochMillis(item.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    createdAt: ToEpochMillis(subscription.created),
    vendorData: Object.freeze({
      status: subscription.status,
      collectionMethod: subscription.collection_method,
    }),
  };
  if (subscription.trial_end !== null) {
    result.trialEnd = ToEpochMillis(subscription.trial_end);
  }
  if (status === "canceled") Object.assign(result, ending(subscription));
  if (latestPayment) result.latestPayment = latestPayment;
  if (Object.keys(metadata).length > 0) result.metadata = metadata;
  return result;
}
