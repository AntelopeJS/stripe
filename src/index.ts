import { Controller, HTTPResult, Parameter, Post, RawBody } from '@ajs/api/beta';
import { internal as internalv1 } from '@ajs.local/stripe/beta';
import Stripe from 'stripe';
import { GetClient } from '@ajs/redis/beta';
import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';

interface Config extends Stripe.StripeConfig {
  endpoint?: string;
  apiKey: string;
  webhookSecret: string;
}

type RedisPaymentIntentChanges = {
  messageId: string;
  paymentIntent: Stripe.PaymentIntent;
};

let client: Stripe;
let stripeConfig: Config;
let redisClient: RedisClientType;
let redisClientSubscriber: RedisClientType | undefined;
// Track processed message IDs to avoid duplicates
const processedMessageIds = new Set<string>();

export function construct(config: Config): void {
  stripeConfig = config;
  const strippedConfig = { ...config } as any;
  delete strippedConfig.endpoint;
  delete strippedConfig.apiKey;
  delete strippedConfig.webhookSecret;
  client = new Stripe(stripeConfig.apiKey, strippedConfig as Stripe.StripeConfig);

  makeStripeController(stripeConfig.endpoint || 'stripe');
}

export function destroy(): void {}

export async function start(): Promise<void> {
  internalv1.SetClient(client);

  // Initialize Redis client
  redisClient = await GetClient();

  // Initialize Redis client for subscriber
  redisClientSubscriber = redisClient.duplicate();
  await redisClientSubscriber.connect();

  // Subscribe to payment intent changes events from other cluster instances
  await redisClientSubscriber.subscribe('stripe:payment_intent:changes', (message) => {
    try {
      const data = JSON.parse(message) as RedisPaymentIntentChanges;
      // Only process if we haven't seen this message ID before
      if (!processedMessageIds.has(data.messageId)) {
        const paymentIntent = data.paymentIntent;
        internalv1.intentChanges.emit(paymentIntent, { local: false });
      }
    } catch (error) {
      console.error('Failed to process payment intent change from Redis:', error);
    }
  });
}

export async function stop(): Promise<void> {
  void internalv1.UnsetClient();

  // Clean up Redis subscription
  if (redisClientSubscriber) {
    await redisClientSubscriber.unsubscribe('stripe:payment_intent:changes');
    await redisClientSubscriber.disconnect();
    redisClientSubscriber = undefined;
  }
}

const makeStripeController = (path: string) => {
  abstract class StripeController extends Controller(path) {
    @Post()
    async webhook(@RawBody() body: Buffer, @Parameter('stripe-signature', 'header') signature: string) {
      const event = await client.webhooks
        .constructEventAsync(body, signature, stripeConfig.webhookSecret)
        .catch(() => Promise.reject(new HTTPResult(403, 'Unauthorized')));

      const object = event.data.object as Stripe.PaymentIntent | Stripe.Source | Stripe.Charge;

      // Monitor payment_intent.succeeded & payment_intent.payment_failed events.
      if (object.object === 'payment_intent') {
        internalv1.intentChanges.emit(object, { local: true });
        // Emit to Redis for other cluster instances
        if (redisClient) {
          const messageId = uuidv4();
          processedMessageIds.add(messageId);
          // Limit the set size to prevent memory leaks
          if (processedMessageIds.size > 1000) {
            const iterator = processedMessageIds.values();
            const firstValue = iterator.next();
            if (firstValue.value) {
              processedMessageIds.delete(firstValue.value);
            }
          }

          await redisClient.publish(
            'stripe:payment_intent:changes',
            JSON.stringify({
              messageId,
              paymentIntent: object,
            }),
          );
        }
      }

      // Monitor `source.chargeable` events.
      if (object.object === 'source' && object.status === 'chargeable' && object.metadata?.paymentIntentId) {
        const paymentIntentId = object.metadata.paymentIntentId;
        const paymentIntent = await client.paymentIntents.retrieve(paymentIntentId);

        if (
          paymentIntent.status === 'canceled' ||
          paymentIntent.status === 'succeeded' ||
          paymentIntent.metadata.charge
        ) {
          return;
        }

        const charge = await client.charges.create(
          {
            source: object.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            metadata: {
              paymentIntentId: paymentIntent.id,
            },
          },
          {
            idempotencyKey: paymentIntent.metadata.payload ?? paymentIntentId,
          },
        );
        await client.paymentIntents.update(paymentIntentId, {
          metadata: {
            charge: charge.id,
          },
        });
      }
    }
  }
  return StripeController;
};
