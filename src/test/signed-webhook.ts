import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import {
  VerifyWebhook,
  type WebhookRequest,
} from "@antelopejs/interface-payment";

const SECOND_MS = 1000;
const signer = new Stripe("sk_test_unused_for_signing_only");

/** A Stripe delivery's raw payload and the `stripe-signature` header Stripe would send with it. */
export function SignedPayload(
  type: string,
  object: Stripe.Event.Data.Object,
  secret: string,
) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    created: Math.floor(Date.now() / SECOND_MS),
    type,
    data: { object },
  });
  return {
    payload,
    signature: signer.webhooks.generateTestHeaderString({ payload, secret }),
  };
}

export function SignedWebhook(
  type: string,
  object: Stripe.Event.Data.Object,
  secret: string,
): WebhookRequest {
  const { payload, signature } = SignedPayload(type, object, secret);
  return {
    body: Buffer.from(payload),
    headers: { "stripe-signature": signature },
  };
}

/** A delivery parsed back through Stripe's own verifier, as a typed event. */
export function SignedEvent(
  type: string,
  object: Stripe.Event.Data.Object,
  secret: string,
): Stripe.Event {
  const { payload, signature } = SignedPayload(type, object, secret);
  return signer.webhooks.constructEvent(payload, signature, secret);
}

export function DeliverWebhook(type: string, object: Stripe.Event.Data.Object) {
  return VerifyWebhook(
    SignedWebhook(type, object, process.env.STRIPE_TEST_WEBHOOK_SECRET ?? ""),
  );
}
