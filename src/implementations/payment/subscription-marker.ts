import Stripe from "stripe";
import type { Payment } from "@antelopejs/interface-payment";
import { SUBSCRIPTION_METADATA_KEY } from "@antelopejs/interface-subscriptions";

import { SubscriptionOfPayment } from "../subscriptions/events";

export async function MarkSubscriptionCharge(
  client: Stripe,
  payment: Payment,
): Promise<Payment> {
  const subscription = await SubscriptionOfPayment(client, payment.id).catch(
    () => undefined,
  );
  if (!subscription) return payment;
  return {
    ...payment,
    metadata: {
      ...payment.metadata,
      [SUBSCRIPTION_METADATA_KEY]: subscription,
    },
  };
}
