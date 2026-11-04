# `@antelopejs/stripe`

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/stripe"><img data-illustration alt="npm" src="https://img.shields.io/npm/v/@antelopejs/stripe?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img data-illustration alt="License" src="https://img.shields.io/npm/l/@antelopejs/stripe?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/g4pFt6eXqu"><img data-illustration src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="./docs/1.configuration.md"><img data-illustration src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The AntelopeJS Stripe provider implements portable payments and Stripe-native subscriptions with the official [`stripe`](https://github.com/stripe/stripe-node) SDK. It also implements the Stripe-specific API of `@antelopejs/interface-stripe`, with payment watchers and optional Redis fan-out.

Part of [AntelopeJS](https://github.com/AntelopeJS/antelopejs), the TypeScript framework where modules depend on contracts and the application chooses the provider. Built by the team behind [AntelopeJS DMS](https://github.com/AntelopeJS/dms).

## Choose an interface

| Consumer dependency                   | Use it for                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@antelopejs/interface-payment`       | Hosted checkout, direct payments, capture, refunds, customers, saved methods and normalized webhooks.     |
| `@antelopejs/interface-subscriptions` | Recurring billing scheduled by Stripe. This is the recommended subscription implementation for Stripe.    |
| `@antelopejs/interface-stripe`        | Stripe SDK integrations and payment watchers. See the [Stripe-specific guide](./docs/5.legacy-stripe.md). |

The generic `payment-subscriptions` scheduler is an alternative to Stripe-native subscriptions. Run one of the two, never both. The [subscriptions guide](./docs/4.subscriptions.md#choose-the-generic-scheduler-explicitly) shows how to switch.

## Install and configure

Add the provider to the project and the payment interface to the consumer module:

```bash
ajs project modules add @antelopejs/stripe
ajs project modules install
pnpm add @antelopejs/interface-payment
```

The [configuration guide](./docs/1.configuration.md) has a complete package-source example with environment overrides, several accounts, and the optional API and Redis modules.

## Portable checkout

Call this function from a consumer module that runs in AntelopeJS with this provider configured. The amount is an integer in minor units, so `2500 EUR` means €25.00. Persist one idempotency key per logical checkout attempt, and reuse it only to retry that attempt.

```typescript [checkout.ts] docs-check
import { CreateCheckoutSession } from "@antelopejs/interface-payment";

export async function checkoutOrder42() {
  const session = await CreateCheckoutSession(
    {
      reference: "order-42",
      amount: { value: 2500, currency: "EUR" },
      description: "Order 42",
      successUrl: "https://shop.example/orders/42/return",
      cancelUrl: "https://shop.example/orders/42/cancel",
    },
    "order-42:checkout:attempt-1",
  );
  return { sessionId: session.id, redirectUrl: session.redirectUrl };
}
```

Store the session ID and redirect the payer to `redirectUrl`. A browser return does not prove the payment. Read `GetCheckoutSession` when the payer returns, and fulfill the order from verified, deduplicated [webhook events](./docs/3.webhooks.md).

## Documentation

- [Configuration and multiple accounts](./docs/1.configuration.md)
- [Payments and retry safety](./docs/2.payments.md)
- [Webhook routes, signatures and event types](./docs/3.webhooks.md)
- [Stripe-native subscriptions and generic fallback](./docs/4.subscriptions.md)
- [Stripe-specific SDK access and watchers](./docs/5.legacy-stripe.md)
- [Agent skill: integrating Stripe checkout](./skills/integrating-stripe-checkout/SKILL.md)

## Compatibility

<!-- antelopejs-docs-compat:start -->

| Package                               | Supported         | Tested with |
| ------------------------------------- | ----------------- | ----------- |
| `@antelopejs/interface-api`           | `>=0.0.15 <1.0.0` | `0.0.15`    |
| `@antelopejs/interface-core`          | `>=0.4.0 <1.0.0`  | `0.4.0`     |
| `@antelopejs/interface-payment`       | `>=0.2.0 <0.3.0`  | `0.2.0`     |
| `@antelopejs/interface-redis`         | `>=0.0.9 <1.0.0`  | `0.0.9`     |
| `@antelopejs/interface-stripe`        | `>=0.0.6 <0.1.0`  | `0.0.6`     |
| `@antelopejs/interface-subscriptions` | `>=0.1.0 <0.2.0`  | `0.1.0`     |

<!-- antelopejs-docs-compat:end -->

The table lists the interface ranges from `package.json`. `.nvmrc` sets the Node.js version for development, and `dependencies` in `package.json` sets the `stripe` SDK range.

## Contributing and verification

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Run the local checks with pnpm:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm knip
```

`pnpm test` builds, then runs `ajs module test .` on four offline files: `dist/test/provider-regressions.test.js`, `dist/test/webhook-events.test.js`, `dist/test/interface-stripe.test.js`, and `dist/test/redis-relay.test.js`. They use a mocked Stripe transport, signed fixtures, and a mock Redis, not a real Stripe account.

`pnpm test:stripe` builds, then runs `ANTELOPE_STRIPE_TEST_MODE=live ajs module test .`. It needs a local `STRIPE_KEY` that starts with `sk_test_`. It refuses to run when `CI` is set, and it can create test-mode resources in your Stripe account. Run it before a release. A green offline run does not prove that the live Stripe API accepts the calls.

## License

[Apache-2.0](./LICENSE)
