---
covers:
  - src/implementations/payment/payments.ts
  - src/implementations/payment/mapping.ts
  - src/implementations/payment/errors.ts
  - src/implementations/payment/index.ts
  - src/implementations/payment/subscription-marker.ts
  - src/implementations/fields.ts
docs:
  - README.md
  - docs/2.payments.md
journeys:
  - pay-approved
  - pay-declined
  - pay-idempotent
  - pay-3ds
---

# Payments

An application module charges a Stripe test or saved payment method with `CreatePayment` and reads the payment back with `GetPayment`.

## Sub-features

- `pay-approved`: a payment method becomes one confirmed PaymentIntent with the amount in minor units, a lowercase currency, the reference in `antelope_reference` metadata and the caller's idempotency key, under the account's secret key; it reads `succeeded` and Stripe holds the same amount. This is the containment journey of the Format door.
- `pay-declined`: a declined card is a `failed` payment carrying the decline reason and Stripe's decline code, also on a later `GetPayment`; an unknown id is `PaymentNotFoundError`, an amount below Stripe's minimum `InvalidPaymentStateError`, an unknown method an error.
- `pay-idempotent`: the same key returns the first payment and Stripe answers the second request as a replay; the same key with other parameters is a `PaymentError`; a new key is a new payment.
- `pay-3ds`: a card that needs authentication is `requires_action` with Stripe's redirect, the return URL goes to Stripe and a later read keeps the redirect; the payer's outcome ends it `succeeded` or `failed`; an off-session attempt on that card is a failed payment.

## How to get to it (user POV)

- A module that imports `@antelopejs/interface-payment` and calls `CreatePayment(request, idempotencyKey, provider?)` with a Stripe PaymentMethod id.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" payments
```

## Gotchas

- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
