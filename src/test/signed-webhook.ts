import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import {
  VerifyWebhook,
  type WebhookRequest,
} from "@antelopejs/interface-payment";

const SECOND_MS = 1000;
const signer = new Stripe("sk_test_unused_for_signing_only");

export function SignedWebhook(
  type: string,
  object: unknown,
  secret: string,
): WebhookRequest {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    created: Math.floor(Date.now() / SECOND_MS),
    type,
    data: { object },
  });
  return {
    body: Buffer.from(payload),
    headers: {
      "stripe-signature": signer.webhooks.generateTestHeaderString({
        payload,
        secret,
      }),
    },
  };
}

export function DeliverWebhook(type: string, object: unknown) {
  return VerifyWebhook(
    SignedWebhook(type, object, process.env.STRIPE_TEST_WEBHOOK_SECRET ?? ""),
  );
}
