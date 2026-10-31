---
covers:
  - src/implementations/payment/payments.ts
docs:
  - README.md
  - docs/2.payments.md
journeys:
  - hold-capture
  - hold-cancel
---

# Holds

An application module authorizes first and settles later: `CapturePayment` or `CancelPayment` on a payment created with `authorizeOnly`.

## Sub-features

- `hold-capture`: an `authorizeOnly` payment reads `authorized` and was asked of Stripe with a manual capture; a partial capture reaches Stripe as `amount_to_capture` under the caller's key and the payment ends `succeeded` with that amount; capturing twice or a payment already taken is `InvalidPaymentStateError`.
- `hold-cancel`: cancelling a hold sends one cancel and the payment reads `canceled` at Stripe too; cancelling a payment already taken is `InvalidPaymentStateError`.

## How to get to it (user POV)

- A module that calls `CapturePayment(id, idempotencyKey, amount?)` or `CancelPayment(id, idempotencyKey)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" holds
```

## Gotchas

- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
