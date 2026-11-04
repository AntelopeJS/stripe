---
covers:
  - src/implementations/payment/checkout.ts
docs:
  - README.md
  - docs/2.payments.md
journeys:
  - hosted-session
  - hosted-options
---

# Checkout

An application module sends the payer to a Stripe Checkout page with `CreateCheckoutSession` and reads the outcome with `GetCheckoutSession`.

## Sub-features

- `hosted-session`: the page is requested as a one-time payment for the amount, product named after the description, return URLs, locale and the reference on the session and on its payment, reads `pending` until the payer pays it, then carries the payment Stripe produced and its status; a replay of the key returns the same page.
- `hosted-options`: an `authorizeOnly` session asks for a manual capture and reads `authorized` once paid; saving the card without a customer is a `PaymentError`; an unknown session is `PaymentNotFoundError`.

## How to get to it (user POV)

- A module that calls `CreateCheckoutSession(request, idempotencyKey)` and redirects the payer to `redirectUrl`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" checkout
```

## Gotchas

- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
