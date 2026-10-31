import assert from "node:assert";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { GetClient } from "@antelopejs/interface-redis";
import {
  type IntentChangeContext,
  internal as stripeInternal,
} from "@antelopejs/interface-stripe";

import { SignedPayload } from "./signed-webhook";

const CHANNEL = "stripe:payment_intent:changes";
const SECRET = process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "";
const FOREIGN_SECRET = "whsec_another_account_entirely";
const WAIT_MS = 2000;
const POLL_MS = 10;

interface Relayed {
  intent: Stripe.PaymentIntent;
  context: IntentChangeContext;
}

function intent(id: string): Stripe.Event.Data.Object {
  return {
    id,
    object: "payment_intent",
    status: "succeeded",
    metadata: {},
  };
}

function relay(id: string, secret: string): string {
  return JSON.stringify({
    messageId: randomUUID(),
    ...SignedPayload("payment_intent.succeeded", intent(id), secret),
  });
}

async function waitFor(seen: Relayed[], count: number): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (seen.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function relayedFrom(messages: string[], expected: number) {
  const seen: Relayed[] = [];
  const handler = (
    relayed: Stripe.PaymentIntent,
    context: IntentChangeContext,
  ) => {
    seen.push({ intent: relayed, context });
  };
  stripeInternal.intentChanges.register(handler);
  try {
    const redis = await GetClient();
    for (const message of messages) {
      await redis.publish(CHANNEL, message);
    }
    await waitFor(seen, expected);
  } finally {
    stripeInternal.intentChanges.unregister(handler);
  }
  return seen.map(({ intent: relayed, context }) => ({
    id: relayed?.id,
    local: context.local,
  }));
}

describe("[stripe] payment intent changes over Redis", () => {
  it("relays a change another instance received as a signed webhook", async () => {
    assert.deepStrictEqual(
      await relayedFrom([relay("pi_relayed", SECRET)], 1),
      [{ id: "pi_relayed", local: false }],
    );
  });

  it("drops a message that is not a signed webhook of this account", async () => {
    assert.deepStrictEqual(
      await relayedFrom(
        [
          "{}",
          "null",
          JSON.stringify({
            messageId: randomUUID(),
            paymentIntent: intent("pi_forged"),
          }),
          relay("pi_foreign", FOREIGN_SECRET),
          relay("pi_genuine", SECRET),
        ],
        1,
      ),
      [{ id: "pi_genuine", local: false }],
    );
  });
});
