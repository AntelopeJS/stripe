---
covers:
docs:
  - README.md
  - docs/2.payments.md
journeys:
  - module-dev
  - pay-through-stripe
---

# Smoke

The fixed journey every verdict runs: load the module as `local`, charge one test card and read the payment back.

## Sub-features

- `module-dev` is the pack's journey: the project answers, the consumer loads the payment, subscriptions and Stripe interfaces, Ctrl+C exits 130.
- `pay-through-stripe`: one `CreatePayment` reaches the stand-in and the payment reads `succeeded`.

## How to get to it (user POV)

- A project with `@antelopejs/stripe` and a module that imports `@antelopejs/interface-payment`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" smoke
```

## Gotchas

- The smoke feature covers no glob, so it never marks a file as mapped.
- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
