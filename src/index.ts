import { Controller, HTTPResult, Parameter, Post, RawBody } from '@ajs/api/beta';
import { internal as internalv1 } from '@ajs.local/stripe/beta';
import Stripe from 'stripe';
import { GetClient } from '@ajs/redis/beta';
import { v4 as uuidv4 } from 'uuid';

type RedisClient = Awaited<ReturnType<typeof GetClient>>;

interface Config extends Stripe.StripeConfig {
  endpoint?: string;
  apiKey: string;
  webhookSecret: string;
}

type RedisPaymentIntentChanges = {
  messageId: string;
  paymentIntent: Stripe.PaymentIntent;
};

const PAYMENT_INTENT_CHANGES_CHANNEL = 'stripe:payment_intent:changes';
const PROCESSED_MESSAGE_IDS_LIMIT = 1000;

let client: Stripe;
let stripeConfig: Config;
let redisClient: RedisClient;
let redisClientSubscriber: RedisClient | undefined;
const processedMessageIds = new Set<string>();

export function construct(config: Config): void {
  stripeConfig = config;
  const strippedConfig = { ...config };
  Reflect.deleteProperty(strippedConfig, 'endpoint');
  Reflect.deleteProperty(strippedConfig, 'apiKey');
  Reflect.deleteProperty(strippedConfig, 'webhookSecret');
  client = new Stripe(stripeConfig.apiKey, strippedConfig);

  makeStripeController(stripeConfig.endpoint || 'stripe');
}

export function destroy(): void {}

export async function start(): Promise<void> {
  internalv1.SetClient(client);

  redisClient = await GetClient();

  redisClientSubscriber = redisClient.duplicate();
  redisClientSubscriber.on('message', handlePaymentIntentChangesMessage);
  await redisClientSubscriber.subscribe(PAYMENT_INTENT_CHANGES_CHANNEL);
}

export async function stop(): Promise<void> {
  void internalv1.UnsetClient();

  if (redisClientSubscriber) {
    redisClientSubscriber.removeListener('message', handlePaymentIntentChangesMessage);
    await redisClientSubscriber.unsubscribe(PAYMENT_INTENT_CHANGES_CHANNEL);
    await redisClientSubscriber.quit();
    redisClientSubscriber = undefined;
  }
}

function handlePaymentIntentChangesMessage(_channel: string, message: string): void {
  try {
    const data = JSON.parse(message) as RedisPaymentIntentChanges;
    if (processedMessageIds.has(data.messageId)) {
      return;
    }

    internalv1.intentChanges.emit(data.paymentIntent, { local: false });
  } catch (error) {
    reportRedisMessageProcessingError(error);
  }
}

function reportRedisMessageProcessingError(error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to process payment intent change from Redis: ${reason}\n`);
}

const makeStripeController = (path: string) => {
  abstract class StripeController extends Controller(path) {
    @Post()
    async webhook(@RawBody() body: Buffer, @Parameter('stripe-signature', 'header') signature: string) {
      const event = await client.webhooks
        .constructEventAsync(body, signature, stripeConfig.webhookSecret)
        .catch(() => Promise.reject(new HTTPResult(403, 'Unauthorized')));

      const object = event.data.object as Stripe.PaymentIntent | Stripe.Source | Stripe.Charge;

      if (object.object === 'payment_intent') {
        internalv1.intentChanges.emit(object, { local: true });
        if (redisClient) {
          const messageId = uuidv4();
          processedMessageIds.add(messageId);
          if (processedMessageIds.size > PROCESSED_MESSAGE_IDS_LIMIT) {
            const iterator = processedMessageIds.values();
            const firstValue = iterator.next();
            if (firstValue.value) {
              processedMessageIds.delete(firstValue.value);
            }
          }

          await redisClient.publish(
            PAYMENT_INTENT_CHANGES_CHANNEL,
            JSON.stringify({
              messageId,
              paymentIntent: object,
            }),
          );
        }
      }

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
