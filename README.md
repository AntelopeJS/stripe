# @antelopejs/stripe

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/stripe"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/stripe?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/stripe?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://interfaces.antelopejs.com/docs/stripe/introduction"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The AntelopeJS payment module: it serves the Stripe interface with the official [`stripe`](https://github.com/stripe/stripe-node) SDK, receives Stripe webhooks, and shares payment intent updates between instances through Redis.

## Interfaces

| Interface                                                                        | Documentation                                                        |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@antelopejs/interface-stripe`](https://github.com/AntelopeJS/interface-stripe) | [Stripe](https://interfaces.antelopejs.com/docs/stripe/introduction) |

The module also needs a module for each of these interfaces:

- [`@antelopejs/interface-api`](https://interfaces.antelopejs.com/docs/api/introduction), for the webhook route, served by [`@antelopejs/api`](https://github.com/AntelopeJS/api).
- [`@antelopejs/interface-redis`](https://interfaces.antelopejs.com/docs/redis/introduction), to broadcast payment intent changes, served by [`@antelopejs/redis`](https://github.com/AntelopeJS/redis). The module waits for a Redis client before it starts.

## Install

```bash
ajs project modules add @antelopejs/stripe
ajs project modules install
```

`ajs project modules install` adds the API and Redis modules when the project has none yet.

## Configuration

```typescript [antelope.config.ts]
import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "my-project",
  modules: {
    stripe: {
      source: {
        type: "package",
        package: "@antelopejs/stripe",
        version: "^1.0.2",
      },
      config: {
        apiKey: "sk_test_...",
        webhookSecret: "whsec_...",
        endpoint: "stripe",
        maxNetworkRetries: 2,
      },
    },
  },
  envOverrides: {
    STRIPE_SECRET_KEY: "modules.stripe.config.apiKey",
    STRIPE_WEBHOOK_SECRET: "modules.stripe.config.webhookSecret",
  },
});
```

| Key             | Description                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`        | Stripe secret key.                                                                                                                          |
| `webhookSecret` | Signing secret of the webhook endpoint, used to verify each event.                                                                          |
| `endpoint`      | Path of the webhook route. Defaults to `stripe`, which serves `POST /stripe`.                                                               |
| any other key   | Passed to the SDK as [`StripeConfig`](https://github.com/stripe/stripe-node#configuration) (`apiVersion`, `maxNetworkRetries`, `timeout`…). |

`ajs project modules add` writes placeholder values for `apiKey` and `webhookSecret`: replace them before starting the project.

Point a Stripe webhook endpoint at `<public API origin>/<endpoint>` and subscribe it to the `payment_intent.*` events your modules watch. Requests whose `stripe-signature` header does not verify get a `403`.

## Quick start

In the module that takes payments, add the interface:

```bash
pnpm add @antelopejs/interface-stripe
```

```typescript
import { InitializePayment, WatchPayment } from "@antelopejs/interface-stripe";

const intent = await InitializePayment("order-42", {
  amount: 2500,
  currency: "eur",
  payment_method_types: ["card"],
});

WatchPayment(intent.id, (id, paymentIntent, context) => {
  console.log(id, paymentIntent.status, context.local);
});
```

Send `intent.client_secret` to the browser to confirm the payment with Stripe.js. The watcher runs on every instance when the webhook reports a change; `context.local` is `true` on the instance that received the webhook.

## Compatibility

| Package                        | Supported range  |
| ------------------------------ | ---------------- |
| `@antelopejs/interface-stripe` | `>=0.0.4 <1.0.0` |
| `@antelopejs/interface-api`    | `>=0.0.5 <1.0.0` |
| `@antelopejs/interface-redis`  | `>=0.0.6 <1.0.0` |
| `@antelopejs/interface-core`   | `>=0.0.5 <1.0.0` |

The module is developed against `@antelopejs/core` `^1.13.4` on Node.js 24, with `stripe` `^18.5.0`.

## Contributing

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm knip
```

The module has no automated tests yet: `pnpm test` only prints a message. Read the [contribution guidelines](CONTRIBUTING.md) before opening a pull request.

## License

[Apache-2.0](LICENSE)
