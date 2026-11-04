---
covers:
  - src/index.ts
docs:
  - README.md
  - docs/1.configuration.md
journeys:
  - request-contract
  - sandbox-live
---

# Sandbox

What only Stripe's real test mode can show: that the requests the Stripe client builds are accepted by api.stripe.com.

## Sub-features

- `request-contract`: a payment request reaches the stand-in, which refuses any key but the configured secret key, and is accepted: the one leg of the contract a stand-in can check.
- `sandbox-live`: always NOT VERIFIED. No journey reaches Stripe's test mode: it needs the operator's `sk_test_` key. A verdict that requires this feature therefore reads NOT VERIFIED, never PASS. The smoke feature leaves it out so a diff that touches no client code is judged on the stand-in journeys.

## How to get to it (user POV)

- An operator who runs the module with a test-mode key.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" sandbox
```

## Gotchas

- The stand-in journeys stand for Stripe's documented answers, not for its live behaviour; where the API reference is silent the stand-in chose, and a live run (`pnpm test:stripe`) is where those choices are checked.
