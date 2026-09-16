import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { GetClient } from "@antelopejs/interface-redis";
import { internal as internalv1 } from "@antelopejs/interface-stripe";
import { internal as paymentInternal } from "@antelopejs/interface-payment";
import {
  GetInterfaceInstances,
  ImplementInterface,
} from "@antelopejs/interface-core";
import {
  Controller,
  HTTPResult,
  Parameter,
  Post,
  RawBody,
} from "@antelopejs/interface-api";

import {
  ClearAccounts,
  RegisterAccount,
} from "./implementations/payment/accounts";

type RedisClient = Awaited<ReturnType<typeof GetClient>>;

interface AccountConfig {
  apiKey: string;
  webhookSecret: string;
}

interface Config extends Stripe.StripeConfig {
  endpoint?: string;
  apiKey: string;
  webhookSecret: string;
  /**
   * Additional Stripe accounts, keyed by the name callers pass as the payment
   * interface's trailing `provider` selector. The top-level apiKey is the
   * default account, used when no selector is given.
   */
  accounts?: Record<string, AccountConfig>;
}

type RedisPaymentIntentChanges = {
  messageId: string;
  paymentIntent: Stripe.PaymentIntent;
};

const PAYMENT_INTENT_CHANGES_CHANNEL = "stripe:payment_intent:changes";
const REDIS_INTERFACE = "@antelopejs/interface-redis";
const API_INTERFACE = "@antelopejs/interface-api";
const PROCESSED_MESSAGE_IDS_LIMIT = 1000;

let client: Stripe;
let stripeConfig: Config;
let redisClient: RedisClient;
let redisClientSubscriber: RedisClient | undefined;
const processedMessageIds = new Set<string>();

function clientOptions(config: Config): Stripe.StripeConfig {
  const options = { ...config };
  Reflect.deleteProperty(options, "endpoint");
  Reflect.deleteProperty(options, "apiKey");
  Reflect.deleteProperty(options, "webhookSecret");
  Reflect.deleteProperty(options, "accounts");
  return options;
}

function registerAccounts(config: Config, options: Stripe.StripeConfig): void {
  RegisterAccount(undefined, client, config.webhookSecret);
  for (const [name, account] of Object.entries(config.accounts ?? {})) {
    RegisterAccount(
      name,
      new Stripe(account.apiKey, options),
      account.webhookSecret,
    );
  }
}

export async function construct(config: Config): Promise<void> {
  stripeConfig = config;
  const options = clientOptions(config);
  client = new Stripe(stripeConfig.apiKey, options);
  registerAccounts(config, options);

  await ImplementInterface(
    paymentInternal,
    await import("./implementations/payment"),
  );

  if (hasInterface(API_INTERFACE)) {
    makeStripeController(stripeConfig.endpoint || "stripe");
    return;
  }
  process.stderr.write(
    `No module implements ${API_INTERFACE}; the built-in Stripe webhook endpoint is not mounted. ` +
      "Consumers of @antelopejs/interface-payment should call VerifyWebhook from their own route.\n",
  );
}

export function destroy(): void {
  ClearAccounts();
}

/**
 * Redis carries payment intent changes between cluster instances. It is optional:
 * a module implementing the generic payment interface must not force every
 * payment consumer to run Redis, and an interface proxy queues rather than
 * throwing when nothing implements it, so an unconditional GetClient() hangs
 * start() forever instead of failing.
 */
function hasInterface(name: string): boolean {
  return GetInterfaceInstances(name).length > 0;
}

export async function start(): Promise<void> {
  internalv1.SetClient(client);

  if (!hasInterface(REDIS_INTERFACE)) {
    return;
  }

  redisClient = await GetClient();

  redisClientSubscriber = redisClient.duplicate();
  redisClientSubscriber.on("message", handlePaymentIntentChangesMessage);
  await redisClientSubscriber.subscribe(PAYMENT_INTENT_CHANGES_CHANNEL);
}

export async function stop(): Promise<void> {
  void internalv1.UnsetClient();

  if (redisClientSubscriber) {
    redisClientSubscriber.removeListener(
      "message",
      handlePaymentIntentChangesMessage,
    );
    await redisClientSubscriber.unsubscribe(PAYMENT_INTENT_CHANGES_CHANNEL);
    await redisClientSubscriber.quit();
    redisClientSubscriber = undefined;
  }
}

function handlePaymentIntentChangesMessage(
  _channel: string,
  message: string,
): void {
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
  process.stderr.write(
    `Failed to process payment intent change from Redis: ${reason}\n`,
  );
}

const makeStripeController = (path: string) => {
  abstract class StripeController extends Controller(path) {
    @Post()
    async webhook(
      @RawBody() body: Buffer,
      @Parameter("stripe-signature", "header") signature: string,
    ) {
      const event = await client.webhooks
        .constructEventAsync(body, signature, stripeConfig.webhookSecret)
        .catch(() => Promise.reject(new HTTPResult(403, "Unauthorized")));

      const object = event.data.object as
        | Stripe.PaymentIntent
        | Stripe.Source
        | Stripe.Charge;

      if (object.object === "payment_intent") {
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

      if (
        object.object === "source" &&
        object.status === "chargeable" &&
        object.metadata?.paymentIntentId
      ) {
        const paymentIntentId = object.metadata.paymentIntentId;
        const paymentIntent =
          await client.paymentIntents.retrieve(paymentIntentId);

        if (
          paymentIntent.status === "canceled" ||
          paymentIntent.status === "succeeded" ||
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
