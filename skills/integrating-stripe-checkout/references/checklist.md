# Checkout completion checklist

Use this checklist while wiring hosted checkout and fulfillment. The provider guides hold the API details; these checks define integration completion.

- The consumer imports `CreateCheckoutSession` from `@antelopejs/interface-payment`, not the provider implementation.
- The amount uses integer minor units and an uppercase currency. The reference identifies the business order without relying on Stripe ID structure.
- A durable checkout attempt stores the idempotency key, returned session ID and account selector. Retry handling follows the [retention and reconciliation rules](../../../docs/2.payments.md#idempotency-and-uncertain-outcomes).
- The browser receives a redirect URL, not an API key. Returning to a success URL does not mark the order paid.
- The portable endpoint receives unmodified raw bytes and the signature header. It uses the endpoint secret for the selected account; the legacy built-in route is not its substitute.
- Endpoint subscriptions include the exact [modeled event types](../../../docs/3.webhooks.md#event-subscriptions) used by the application, including `refund.created`, `refund.updated` and `refund.failed` when refunds are enabled.
- Business effects and event-ID deduplication commit atomically. Out-of-order deliveries trigger reconciliation where necessary.
- Missing/invalid signatures cause no business effects. A genuine unsupported event returns success. Charge enrichment and business-processing failures return an error so Stripe retries instead of recording misleading zero totals or losing work.
- Verification identifies its scope: this provider's default `pnpm test` runs offline fixtures; `pnpm test:stripe` requires a local test-mode key and refuses CI. A test-mode run is not a production charge, and an unrun suite is not a pass.
