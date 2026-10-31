---
covers:
  - src/implementations/payment/refunds.ts
docs:
  - README.md
  - docs/2.payments.md
journeys:
  - refund-flow
  - refund-refused
---

# Refunds

An application module refunds all or part of a payment with `RefundPayment` and reads it with `GetRefund`.

## Sub-features

- `refund-flow`: a partial refund succeeds at once with the payment, amount, native reason and caller's key sent to Stripe, shows in the payment's refunded amount and in Stripe's charge, and reads back; a refund above what is left and a refund after a full refund are `InvalidPaymentStateError`, and a refund with no amount returns what is left.
- `refund-refused`: a payment with no captured charge is `InvalidPaymentStateError`, an unknown payment and an unknown refund are `PaymentNotFoundError`.

## How to get to it (user POV)

- A module that calls `RefundPayment({ payment, amount?, reason? }, idempotencyKey)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" refunds
```

## Gotchas

- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
