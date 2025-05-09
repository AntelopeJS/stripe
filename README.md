![Stripe](.github/social-card.png)

# @antelopejs/stripe

[![npm version](https://img.shields.io/npm/v/@antelopejs/stripe.svg)](https://www.npmjs.com/package/@antelopejs/stripe)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

An extensive Stripe payment processing module that implements the Stripe interface for AntelopeJS.

For detailed documentation on the Stripe interface, please refer to the [docs](https://github.com/AntelopeJS/interface-stripe).

## Installation

```bash
ajs project modules add @antelopejs/stripe
```

## Overview

The AntelopeJS Stripe module provides functionality for handling Stripe payment processing:

- Payment intent creation and management
- Webhook handling for Stripe events
- Payment method retrieval
- Payment monitoring and event watching
- Cluster-aware payment processing with Redis

## Dependencies

This module depends on the following Antelope interfaces:

- [**API Interface**](https://github.com/AntelopeJS/interface-api): Required to handle Stripe webhook events and route them to the appropriate handlers
- [**Redis Interface**](https://github.com/AntelopeJS/interface-redis): Used to enable clustering capabilities, allowing payment intent monitoring and watching to work seamlessly across multiple instances

## Configuration

The Stripe module can be configured with the following options:

```json
{
  "apiKey": "your_stripe_api_key",
  "webhookSecret": "your_stripe_webhook_secret",
  "endpoint": "stripe"
}
```

### Configuration Details

The module requires the following configuration properties:

- `apiKey`: Your Stripe API key for authentication with the Stripe API
- `webhookSecret`: Your Stripe webhook signing secret for verifying webhook events
- `endpoint`: The base endpoint path for Stripe webhook controller (defaults to 'stripe' if not specified)

Additional configuration properties from the Stripe.js library configuration can also be provided.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
