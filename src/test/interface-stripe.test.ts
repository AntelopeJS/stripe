import Stripe from "stripe";
import assert from "node:assert/strict";
import {
  GetClient,
  internal as stripeInternal,
} from "@antelopejs/interface-stripe";

const RESOLVE_TIMEOUT = 5_000;
const WATCHED_INTENT = "pi_watch";

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} did not resolve`)),
        RESOLVE_TIMEOUT,
      ),
    ),
  ]);
}

/**
 * Implementing a second interface is additive: these cover what existing
 * consumers of `@antelopejs/interface-stripe` depend on from this module, so a
 * regression shows up here rather than in someone's deployment.
 */
describe("[stripe] the Stripe-native interface still works", () => {
  it("publishes a live client, as it did before", async () => {
    const client = await withTimeout(GetClient(), "GetClient");

    assert.ok(
      client instanceof Stripe,
      "GetClient must resolve a Stripe client",
    );
    assert.equal(typeof client.paymentIntents.create, "function");
  });

  it("starts with neither Redis nor the api module wired", async () => {
    const client = await withTimeout(GetClient(), "GetClient");

    assert.ok(
      client,
      "start() published the client with no Redis module present, so it did not block on one",
    );
  });

  it("still carries intent changes over the shared event proxy", () => {
    const seen: string[] = [];
    const handler = (intent: Stripe.PaymentIntent) => {
      seen.push(intent.id);
    };
    stripeInternal.intentChanges.register(handler);

    try {
      stripeInternal.intentChanges.emit(
        {
          id: WATCHED_INTENT,
          status: "succeeded",
          metadata: { payload: "order-7" },
        } as unknown as Stripe.PaymentIntent,
        { local: true },
      );
    } finally {
      stripeInternal.intentChanges.unregister(handler);
    }

    assert.deepEqual(
      seen,
      [WATCHED_INTENT],
      "the intent-change proxy this module emits on must reach its handlers",
    );
  });
});
