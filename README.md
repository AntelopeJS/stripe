# @antelopejs/stripe

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/stripe"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/stripe?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/stripe?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="./docs/1.configuration.md"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The AntelopeJS Stripe provider implements portable payments and Stripe-native subscriptions with the official [`stripe`](https://github.com/stripe/stripe-node) SDK. It also preserves the existing Stripe-specific API, including payment watchers and optional Redis fan-out.

## Choose an interface

| Consumer dependency                   | Use it for                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@antelopejs/interface-payment`       | Hosted checkout, direct payments, capture, refunds, customers, saved methods and normalized webhooks.            |
| `@antelopejs/interface-subscriptions` | Recurring billing scheduled by Stripe. This is the recommended subscription implementation for Stripe.           |
| `@antelopejs/interface-stripe`        | Existing Stripe SDK integrations and payment watchers. See the [legacy Stripe guide](./docs/5.legacy-stripe.md). |

Portable payments and Stripe-native subscriptions are available from `@antelopejs/stripe` 1.1.0 with the portable interfaces from 0.0.2. The generic `payment-subscriptions` scheduler is an explicit alternative, not a second scheduler to enable alongside Stripe-native subscriptions.

## Install and configure

Add the provider to the project and the payment interface to the consumer module:

```bash
ajs project modules add @antelopejs/stripe
ajs project modules install
pnpm add @antelopejs/interface-payment
```

The [configuration guide](./docs/1.configuration.md) provides a complete package-source example with environment overrides, multiple accounts and optional API/Redis dependencies.

## Portable checkout

Call this function from a consumer module running in AntelopeJS with this provider configured. The amount is an integer in minor units: `2500 EUR` means €25.00. Persist one idempotency key per logical checkout attempt and reuse it only for retries of that attempt.

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

Store the session ID and redirect the payer to `redirectUrl`. A browser return is not proof of payment: read `GetCheckoutSession` on return and fulfill from verified, deduplicated [webhook events](./docs/3.webhooks.md).

## Documentation

- [Configuration and multiple accounts](./docs/1.configuration.md)
- [Payments and retry safety](./docs/2.payments.md)
- [Webhook routes, signatures and event types](./docs/3.webhooks.md)
- [Stripe-native subscriptions and generic fallback](./docs/4.subscriptions.md)
- [Legacy Stripe SDK and watchers](./docs/5.legacy-stripe.md)
- [Agent skill: integrating Stripe checkout](./skills/integrating-stripe-checkout/SKILL.md)

## Compatibility

<!-- docs-compat: ./package.json#dependencies -->

| Package                               | Range            |
| ------------------------------------- | ---------------- |
| `@antelopejs/interface-core`          | `>=0.2.4 <1.0.0` |
| `@antelopejs/interface-stripe`        | `>=0.0.6 <0.1.0` |
| `@antelopejs/interface-payment`       | `>=0.1.0 <0.2.0` |
| `@antelopejs/interface-subscriptions` | `>=0.1.0 <0.2.0` |

<!-- docs-compat: ./package.json#optionalDependencies -->

| Package                       | Range             |
| ----------------------------- | ----------------- |
| `@antelopejs/interface-api`   | `>=0.0.15 <1.0.0` |
| `@antelopejs/interface-redis` | `>=0.0.9 <1.0.0`  |

These are the manifest's interface requirements. Development targets `@antelopejs/core` 1.16.0 on Node.js 24 and uses `stripe` `^18.5.0`.

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

`pnpm test` builds, then runs `ajs module test .` with the explicit offline files `dist/test/provider-regressions.test.js`, `dist/test/webhook-events.test.js` and `dist/test/interface-stripe.test.js`. It uses mocked Stripe transport and signed fixtures, not a real Stripe account.

`pnpm test:stripe` builds, then runs `ANTELOPE_STRIPE_TEST_MODE=live ajs module test .`. It requires a locally supplied `STRIPE_KEY` beginning with `sk_test_`, refuses CI and can create test-mode Stripe resources. Run it explicitly before release; offline success is not live verification.

## License

[Apache-2.0](./LICENSE)
