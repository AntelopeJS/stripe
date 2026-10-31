---
covers:
  - src/implementations/payment/customers.ts
docs:
  - README.md
  - docs/2.payments.md
journeys:
  - customer-lifecycle
  - saved-card
---

# Customers

An application module keeps customers and their saved cards, and charges a saved card without the payer.

## Sub-features

- `customer-lifecycle`: a customer keeps its email, name and metadata at Stripe, is found again, is not found after `DeleteCustomer`, and an unknown or deleted customer is `CustomerNotFoundError`.
- `saved-card`: a payment with `savePaymentMethod` asks Stripe to keep the card for off-session use on the customer, `ListPaymentMethods` returns it with its brand and last digits, an `offSession` charge succeeds on it, `DetachPaymentMethod` empties the list; saving without a customer or off-session is a `PaymentError` before Stripe is called.

## How to get to it (user POV)

- A module that calls `CreateCustomer`, `ListPaymentMethods` and `CreatePayment` with `offSession`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" customers
```

## Gotchas

- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
