import Stripe from "stripe";
import { WebhookVerificationError } from "@antelopejs/interface-payment";
import type {
  PaymentEvent,
  PaymentEventType,
  WebhookRequest,
} from "@antelopejs/interface-payment";

import { GetAccount } from "./accounts";
import { IsStripeId } from "../fields";
import { MarkSubscriptionCharge } from "./subscription-marker";
import { DispatchSubscriptionEvent } from "../subscriptions/events";
import { ToDispute, ToEpochMillis, ToPayment, ToRefund } from "./mapping";

const SIGNATURE_HEADER = "stripe-signature";

const PAYMENT_EVENTS = {
  "payment_intent.amount_capturable_updated": "payment.authorized",
  "payment_intent.canceled": "payment.canceled",
  "payment_intent.payment_failed": "payment.failed",
  "payment_intent.processing": "payment.pending",
  "payment_intent.succeeded": "payment.succeeded",
} satisfies Partial<Record<Stripe.Event.Type, PaymentEventType>>;

const REFUND_EVENTS = {
  "refund.created": "refund.succeeded",
  "refund.failed": "refund.failed",
  "refund.updated": "refund.succeeded",
} satisfies Partial<Record<Stripe.Event.Type, PaymentEventType>>;

const DISPUTE_EVENTS = {
  "charge.dispute.created": "dispute.opened",
} satisfies Partial<Record<Stripe.Event.Type, PaymentEventType>>;

/**
 * Whether `table` maps the event's type, read with `in` so that inherited keys
 * count exactly as a truthy `table[event.type]` did.
 */
function isEventIn<T extends object>(
  table: T,
  event: Stripe.Event,
): event is Extract<Stripe.Event, { type: keyof T }> {
  return event.type in table;
}

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

async function withRefundedTotal(
  client: Stripe,
  intent: Stripe.PaymentIntent,
): Promise<Stripe.PaymentIntent> {
  if (!IsStripeId(intent.latest_charge)) {
    return intent;
  }
  const charge = await client.charges.retrieve(intent.latest_charge);
  return { ...intent, latest_charge: charge };
}

async function buildEvent(
  client: Stripe,
  event: Stripe.Event,
): Promise<PaymentEvent | undefined> {
  const base = { id: event.id, createdAt: ToEpochMillis(event.created) };

  if (isEventIn(PAYMENT_EVENTS, event)) {
    const paymentType = PAYMENT_EVENTS[event.type];
    const intent = await withRefundedTotal(client, event.data.object);
    return {
      ...base,
      type: paymentType,
      payment: await MarkSubscriptionCharge(client, ToPayment(intent)),
    };
  }

  if (isEventIn(REFUND_EVENTS, event)) {
    const refund = ToRefund(event.data.object);
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

  if (isEventIn(DISPUTE_EVENTS, event)) {
    return {
      ...base,
      type: DISPUTE_EVENTS[event.type],
      dispute: ToDispute(event.data.object),
    };
  }

  return undefined;
}

async function verifiedEvent(
  client: Stripe,
  payload: Buffer,
  signature: string,
  webhookSecret: string,
): Promise<Stripe.Event> {
  try {
    return await client.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );
  } catch (error) {
    throw new WebhookVerificationError(
      error instanceof Error ? error.message : "The signature did not verify",
    );
  }
}

export async function VerifyWebhook(
  request: WebhookRequest,
  provider?: string,
): Promise<PaymentEvent | undefined> {
  const { client, webhookSecret } = GetAccount(provider);
  const signature = readSignature(request.headers);
  const event = await verifiedEvent(
    client,
    Buffer.from(request.body),
    signature,
    webhookSecret,
  );
  await DispatchSubscriptionEvent(client, event);
  return buildEvent(client, event);
}
