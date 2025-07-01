![Stripe](.github/social-card.png)

# @antelopejs/stripe

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/core"><img alt="NPM version" src="https://img.shields.io/npm/v/@antelopejs/core.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/AntelopeJS/antelopejs/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/core.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/C2G8QW63"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://discord.gg/C2G8QW63"><img src="https://img.shields.io/badge/Docs-18181B?logo=Antelope.JS&style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

An extensive Stripe payment processing module that implements the Stripe interface for AntelopeJS.

## Installation

```bash
ajs project modules add @antelopejs/stripe
```

## Interfaces

This module implements the Stripe interface that provides comprehensive payment processing capabilities. The interface is installed separately to maintain modularity and minimize dependencies.

| Name          | Install command                         |                                                                 |
| ------------- | --------------------------------------- | --------------------------------------------------------------- |
| Stripe        | `ajs module imports add stripe`         | [Documentation](https://github.com/AntelopeJS/interface-stripe) |


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
