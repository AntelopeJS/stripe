---
name: integrating-stripe-checkout
description: Wires portable hosted checkout to the AntelopeJS Stripe provider. Use when adding Stripe checkout and its verified payment webhook to an AntelopeJS project.
---

# Integrate Stripe checkout

Connect hosted checkout and verified fulfillment through `@antelopejs/interface-payment`, keeping Stripe details in the provider configuration.

1. Read [the integration checklist](./references/checklist.md) and inspect the project's module configuration, installed interface versions and HTTP raw-body support. Finish when you identify the consumer module, selected account, callback URLs and durable order/event store.
2. Read [provider configuration](../../docs/1.configuration.md). Add the provider and the consumer's payment-interface dependency using compatible published versions or coordinated source checkouts. Keep credentials in `envOverrides`; finish when both API key and endpoint-specific webhook secret resolve for the chosen account.
3. Adapt the [complete checkout example](../../README.md#portable-checkout). Persist the checkout ID and one idempotency key per business attempt; return the redirect URL. Finish when retries reuse that key and browser returns trigger reads rather than fulfillment.
4. Read [webhook routing and exact events](../../docs/3.webhooks.md), then mount a separate raw-body route calling `VerifyWebhook` with the same account selector. Finish when verified payment events reach durable, deduplicated business processing, unsupported events acknowledge, signature failures reject and processing failures remain retryable.
5. Run the project's available checks and exercise successful, duplicate, invalid-signature and failed-processing deliveries. Report the exact commands and whether validation is offline or Stripe-backed. Finish with evidence and explicit gaps; local fixture success does not establish a live Stripe integration.

If recurring billing enters the task, consult [native subscriptions](../../docs/4.subscriptions.md) before adding a scheduler. Stripe-native billing is recommended; the generic fallback needs an explicit disabled export and must not bill the same subscription concurrently.
