---
covers:
  - src/implementations/payment/webhooks.ts
  - src/relay.ts
docs:
  - README.md
  - docs/3.webhooks.md
journeys:
  - webhook-signature
  - webhook-events
---

# Webhooks

An application route hands Stripe's raw delivery to `VerifyWebhook` and gets a normalised event or a refusal.

## Sub-features

- `webhook-signature`: a delivery signed with Stripe's `t=,v1=` HMAC scheme under the account's endpoint secret becomes an event; an altered body, a missing header, an old timestamp and a signature under another account's secret are `WebhookVerificationError`; the secondary account accepts its own secret.
- `webhook-events`: a created refund is `refund.succeeded`, a failed payment intent `payment.failed` with the decline reason, a capturable hold `payment.authorized`, and an unmapped event type yields no event.

## How to get to it (user POV)

- A consumer route that passes `{ body, headers }` of Stripe's webhook to `VerifyWebhook(request, provider?)`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" webhooks
```

## Gotchas

- The JSON driver cannot carry bytes, so the journeys pass the raw body as a string; the HMAC is the same for the ASCII bodies Stripe sends.
- The Stripe side is `stripe-api.ts`, a stand-in written from Stripe's API reference, so a feature proves agreement with that reading, not with the live service; see [sandbox](sandbox.md).
