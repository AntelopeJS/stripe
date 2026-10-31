# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys:` the journeys it runs, and `seeded-breaks/<feature>.patch` the break its journeys must catch. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

Stripe is stood in for by `stripe-api.ts`, a stateful HTTP server written from Stripe's API reference rather than from this module: form-encoded requests with nested bracket keys, `Authorization: Bearer <secret key>` with one account per key, `Idempotency-Key` replay and its parameter-mismatch error, Stripe's error envelope (`type`, `code`, `message`, `param`, and the `payment_intent` of a card error), `parameter_unknown` for a parameter an endpoint does not document, expansion by `expand[]`, Stripe's documented test PaymentMethod tokens (`pm_card_visa`, `pm_card_chargeDeclined`, `pm_card_chargeDeclinedInsufficientFunds`, `pm_card_authenticationRequired`), PaymentIntent, charge, refund, customer, payment method, Checkout Session, product and subscription objects. The module's Stripe client is pointed at it through the `host`, `port` and `protocol` options of the Stripe client config. Webhook deliveries are signed in the journeys with Stripe's documented `t=<seconds>,v1=<HMAC-SHA256 of "<seconds>.<payload>">` scheme, independently of the SDK. Each journey reads what the stand-in holds as a second view next to what the module returned. A pass proves the module agrees with this reading of Stripe's documentation and nothing more; `sandbox` is the feature that would reach Stripe's test mode and reads NOT VERIFIED.

| Feature | What the user does | Journeys |
|---|---|---|
| [payments](payments.md) | Charges a payment method and reads the payment back. | pay-approved, pay-declined, pay-idempotent, pay-3ds |
| [holds](holds.md) | Authorizes, then captures or cancels. | hold-capture, hold-cancel |
| [refunds](refunds.md) | Refunds all or part of a payment. | refund-flow, refund-refused |
| [customers](customers.md) | Keeps customers and saved cards, charges a saved card off-session. | customer-lifecycle, saved-card |
| [checkout](checkout.md) | Sends the payer to a Stripe Checkout page. | hosted-session, hosted-options |
| [subscriptions](subscriptions.md) | Starts and cancels a Stripe-native subscription. | subscription-create, subscription-cancel |
| [webhooks](webhooks.md) | Verifies Stripe's signed deliveries. | webhook-signature, webhook-events |
| [accounts](accounts.md) | Selects one of several Stripe accounts, or uses the legacy Stripe client. | account-selection, bad-key, legacy-initialize |
| [sandbox](sandbox.md) | Reaches Stripe's real test mode. Always NOT VERIFIED. | request-contract, sandbox-live |
| [smoke](smoke.md) | The fixed journey every verdict runs. | module-dev, pay-through-stripe |
