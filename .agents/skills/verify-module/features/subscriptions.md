---
covers:
  - src/implementations/subscriptions/errors.ts
  - src/implementations/subscriptions/events.ts
  - src/implementations/subscriptions/index.ts
  - src/implementations/subscriptions/mapping.ts
  - src/implementations/subscriptions/product.ts
  - src/implementations/subscriptions/subscriptions.ts
docs:
  - README.md
  - docs/4.subscriptions.md
journeys:
  - subscription-create
  - subscription-cancel
---

# Subscriptions

An application module starts and ends a Stripe-native subscription through `@antelopejs/interface-subscriptions`.

## Sub-features

- `subscription-create`: a subscription for a saved card charges it once at start, is active with its amount, interval, customer, card and a one-month period, carries the reference and the first payment, is listed on its customer and read back, and Stripe is asked for a recurring price that fails rather than stays incomplete; an unknown id is not found and an invalid request is refused before Stripe is called.
- `subscription-cancel`: cancelling at the period end keeps it active and flagged, cancelling now ends it as requested, cancelling an ended one is `InvalidSubscriptionStateError`, a replay under the same key returns the ended subscription, and another account does not see it.

## How to get to it (user POV)

- A module that imports `@antelopejs/interface-subscriptions` and calls `CreateSubscription` and `CancelSubscription`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" subscriptions
```

## Gotchas

- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
- Subscription events (`SubscriptionEvents`), declined first payments, trials, billing anchors, test clocks and payment-method updates are not driven by a journey; the module's mocha suites cover them against Stripe's test mode.
