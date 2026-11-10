import Stripe from "stripe";
import type { Payment } from "@antelopejs/interface-payment";
import { SUBSCRIPTION_METADATA_KEY } from "@antelopejs/interface-subscriptions";

import { SubscriptionOfPayment } from "../subscriptions/events";

export function MarkSubscription(
  payment: Payment,
  subscription: string | undefined,
): Payment {
  if (!subscription) return payment;
  return {
    ...payment,
    metadata: {
      ...payment.metadata,
      [SUBSCRIPTION_METADATA_KEY]: subscription,
    },
  };
}

export async function MarkSubscriptionCharge(
  client: Stripe,
  payment: Payment,
): Promise<Payment> {
  return MarkSubscription(
    payment,
    await SubscriptionOfPayment(client, payment.id),
  );
}
