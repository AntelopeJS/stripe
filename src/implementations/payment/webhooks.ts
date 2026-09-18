import Stripe from "stripe";
import { WebhookVerificationError } from "@antelopejs/interface-payment";
import type {
  PaymentEvent,
  PaymentEventType,
  WebhookRequest,
} from "@antelopejs/interface-payment";

import { GetAccount } from "./accounts";
import { ToDispute, ToEpochMillis, ToPayment, ToRefund } from "./mapping";

const SIGNATURE_HEADER = "stripe-signature";

const PAYMENT_EVENTS: Record<string, PaymentEventType> = {
  "payment_intent.amount_capturable_updated": "payment.authorized",
  "payment_intent.canceled": "payment.canceled",
  "payment_intent.payment_failed": "payment.failed",
  "payment_intent.processing": "payment.pending",
  "payment_intent.succeeded": "payment.succeeded",
};

const REFUND_EVENTS: Record<string, PaymentEventType> = {
  "refund.failed": "refund.failed",
  "refund.updated": "refund.succeeded",
};

const DISPUTE_EVENTS: Record<string, PaymentEventType> = {
  "charge.dispute.created": "dispute.opened",
};

function readSignature(headers: WebhookRequest["headers"]): string {
  const raw = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === SIGNATURE_HEADER,
  )?.[1];
  const signature = Array.isArray(raw) ? raw[0] : raw;
  if (!signature) {
    throw new WebhookVerificationError(
      "The delivery carried no stripe-signature header",
    );
  }
  return signature;
}

/**
 * Stripe signs the raw bytes, so a verified body is authentic data and the
 * event is built from it. That is the signed half of the interface's rule about
 * where an event's fields may come from; a provider established by re-fetching
 * instead would have to read every field back from the record.
 */
/**
 * A webhook body carries `latest_charge` as a bare id, and the refunded total
 * lives on the charge. Left alone, a `payment_intent.succeeded` for an intent
 * that already has refunds would report `amountRefunded` as zero — a wrong
 * value, not an unknown one. One read settles it.
 */
async function withRefundedTotal(
  client: Stripe,
  intent: Stripe.PaymentIntent,
): Promise<Stripe.PaymentIntent> {
  if (typeof intent.latest_charge !== "string") {
    return intent;
  }
  const charge = await client.charges
    .retrieve(intent.latest_charge)
    .catch(() => undefined);
  return charge ? { ...intent, latest_charge: charge } : intent;
}

async function buildEvent(
  client: Stripe,
  event: Stripe.Event,
): Promise<PaymentEvent | undefined> {
  const base = { id: event.id, createdAt: ToEpochMillis(event.created) };

  const paymentType = PAYMENT_EVENTS[event.type];
  if (paymentType) {
    const intent = await withRefundedTotal(
      client,
      event.data.object as Stripe.PaymentIntent,
    );
    return { ...base, type: paymentType, payment: ToPayment(intent) };
  }

  if (REFUND_EVENTS[event.type]) {
    const refund = ToRefund(event.data.object as Stripe.Refund);
    if (refund.status === "pending") {
      return undefined;
    }
    return {
      ...base,
      type:
        refund.status === "succeeded" ? "refund.succeeded" : "refund.failed",
      refund,
    };
  }

  const disputeType = DISPUTE_EVENTS[event.type];
  if (disputeType) {
    return {
      ...base,
      type: disputeType,
      dispute: ToDispute(event.data.object as Stripe.Dispute),
    };
  }

  return undefined;
}

export async function VerifyWebhook(
  request: WebhookRequest,
  provider?: string,
): Promise<PaymentEvent | undefined> {
  const { client, webhookSecret } = GetAccount(provider);
  const signature = readSignature(request.headers);
  const event = await client.webhooks
    .constructEventAsync(Buffer.from(request.body), signature, webhookSecret)
    .catch((error: unknown) => {
      throw new WebhookVerificationError(
        error instanceof Error ? error.message : "The signature did not verify",
      );
    });
  return buildEvent(client, event);
}
