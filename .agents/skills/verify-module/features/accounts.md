---
covers:
  - src/implementations/payment/accounts.ts
docs:
  - README.md
  - docs/1.configuration.md
  - docs/5.legacy-stripe.md
journeys:
  - account-selection
  - bad-key
  - legacy-initialize
---

# Accounts

An operator configures several Stripe accounts, and a call picks one with the trailing `provider` argument. The legacy `@antelopejs/interface-stripe` client the module sets at start is the default account's.

## Sub-features

- `account-selection`: a call naming `secondary` runs under that account's key on its own objects, the default account does not see them, and an account that is not configured is a `PaymentError` that sends nothing.
- `bad-key`: a secret key Stripe refuses with 401 is a `PaymentError`.
- `legacy-initialize`: the legacy `@antelopejs/interface-stripe` `InitializePayment` creates a PaymentIntent through the module's default client, under the default account's key, and tags it with the caller's payload id.

## How to get to it (user POV)

- An operator who adds `accounts: { secondary: { apiKey, webhookSecret } }` to the module config.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" accounts
```

## Gotchas

- `WaitForPayment`, the payment watchers and the Redis relay need the API and Redis modules and a webhook delivery; no journey drives them, and the module's `redis-relay` and `interface-stripe` suites cover them.
- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
