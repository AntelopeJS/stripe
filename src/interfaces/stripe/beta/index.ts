import Stripe from 'stripe';
import { EventProxy } from '@ajs/core/beta';

/**
 * Context information for payment intent change events
 * @property {boolean} local - Indicates if the event was triggered locally or received from another cluster instance
 */
export interface IntentChangeContext {
  local: boolean;
}
/**
 * @internal
 */
export namespace internal {
  export let client: Promise<Stripe>;
  export let SetClient: (client: Stripe) => void;
  export const UnsetClient = () => (client = new Promise((resolve) => (SetClient = resolve)));
  void UnsetClient();

  export const intentChanges = new EventProxy<(intent: Stripe.PaymentIntent, context: IntentChangeContext) => void>();
}

/**
 * Returns the Stripe client instance
 * @returns {Promise<Stripe>} A promise that resolves to the Stripe client
 */
export function GetClient(): Promise<Stripe> {
  return internal.client;
}

/**
 * Initializes a new payment intent
 * @param {string} id - The unique identifier for the payment
 * @param {Stripe.PaymentIntentCreateParams} params - Parameters for creating the payment intent
 * @param {Stripe.RequestOptions} [options] - Optional request options
 * @returns {Promise<Stripe.PaymentIntent>} The created payment intent
 * @example
 * // Initialize a payment intent for $25.00 USD
 * const paymentIntent = await InitializePayment('order_123', {
 *   amount: 2500,
 *   currency: 'usd',
 *   payment_method_types: ['card']
 * });
 */
export async function InitializePayment(
  id: string,
  params: Stripe.PaymentIntentCreateParams,
  options?: Stripe.RequestOptions,
) {
  const client = await GetClient();
  params.metadata = params.metadata || {};
  params.metadata.payload = id;
  return await client.paymentIntents.create(params, options);
}

/**
 * Internal interface for tracking watched payment intents
 */
interface WatchedIntent {
  resolve: (intent: Stripe.PaymentIntent) => void;
  reject: (error: unknown) => void;
}
const watchedIntents = new Map<string, WatchedIntent>();
const watchedIntentPromises = new Map<string, Promise<Stripe.PaymentIntent>>();

/**
 * Waits for a payment intent to reach a final state (succeeded or canceled)
 * @param {string} paymentIntentId - The ID of the payment intent to wait for
 * @returns {Promise<Stripe.PaymentIntent>} A promise that resolves when the payment succeeds or rejects when canceled
 * @example
 * // Wait for a payment to complete
 * try {
 *   const completedIntent = await WaitForPayment('pi_123456789');
 *   console.log('Payment successful!', completedIntent.id);
 * } catch (error) {
 *   console.error('Payment was canceled:', error);
 * }
 */
export async function WaitForPayment(paymentIntentId: string) {
  const client = await GetClient();
  const paymentIntent = await client.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status === 'succeeded') {
    return paymentIntent;
  } else if (paymentIntent.status === 'canceled') {
    throw paymentIntent.cancellation_reason;
  }

  if (watchedIntentPromises.has(paymentIntentId)) {
    return await watchedIntentPromises.get(paymentIntentId)!;
  }
  const promise = new Promise<Stripe.PaymentIntent>((resolve, reject) =>
    watchedIntents.set(paymentIntentId, { resolve, reject }),
  );
  watchedIntentPromises.set(paymentIntentId, promise);
  return await promise;
}

/**
 * Completes a payment using a chargeable source
 * @param {string} paymentIntentId - The ID of the payment intent to complete
 * @param {Stripe.Source} source - The source to use for the charge
 * @throws {Error} If the source is not in a chargeable state
 * @example
 * // Complete a payment with a source
 * try {
 *   await CompletePayment('pi_123456789', source);
 *   console.log('Payment completed successfully');
 * } catch (error) {
 *   console.error('Failed to complete payment:', error.message);
 * }
 */
export async function CompletePayment(paymentIntentId: string, source: Stripe.Source) {
  if (source.status !== 'chargeable') {
    throw new Error('Source is not in chargeable state');
  }

  const client = await GetClient();
  const paymentIntent = await client.paymentIntents.retrieve(paymentIntentId);

  const charge = await client.charges.create(
    {
      source: source.id,
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

/**
 * Callback type for payment intent watchers
 * @callback IntentWatcher
 * @param {any} id - The ID from the payment intent's metadata.payload
 * @param {Stripe.PaymentIntent} intent - The payment intent object
 * @param {IntentChangeContext} context - The context of the intent change
 */
type PaymentPayloadId = string | undefined;
type IntentWatcher = (id: PaymentPayloadId, intent: Stripe.PaymentIntent, context: IntentChangeContext) => void;
const watchersAll = new Map<IntentWatcher, boolean>();
const watchersIntent = new Map<string, Set<IntentWatcher>>();
internal.intentChanges.register((intent, context) => {
  for (const [watcher, requireLocal] of watchersAll.entries()) {
    if (!requireLocal || context.local) {
      watcher(intent.metadata.payload, intent, context);
    }
  }
  if (watchersIntent.has(intent.id)) {
    for (const watcher of watchersIntent.get(intent.id)!) {
      watcher(intent.metadata.payload, intent, context);
    }
  }
  if (intent.status === 'succeeded' || intent.status === 'canceled') {
    if (watchedIntents.has(intent.id)) {
      const watch = watchedIntents.get(intent.id)!;
      if (intent.status === 'succeeded') {
        watch.resolve(intent);
      } else {
        watch.reject(intent.cancellation_reason);
      }
    }
    watchedIntents.delete(intent.id);
    watchedIntentPromises.delete(intent.id);
    watchersIntent.delete(intent.id);
  }
});

/**
 * Watch all payment intents for changes
 * @param {IntentWatcher} callback - Function to call when any payment intent changes
 * @param {boolean} [onlyLocal=false] - If true, only respond to local events, not cluster-wide events
 * @example
 * // Watch all payment intents and log their status changes
 * WatchAllPayments((id, intent, context) => {
 *   console.log(`Payment ${id} status changed to ${intent.status}`);
 *   console.log(`Event originated ${context.local ? 'locally' : 'from another cluster instance'}`);
 * });
 */
export function WatchAllPayments(callback: IntentWatcher, onlyLocal?: boolean) {
  watchersAll.set(callback, !!onlyLocal);
}

/**
 * Watch a specific payment intent for changes
 * @param {string} paymentIntentId - The ID of the payment intent to watch
 * @param {IntentWatcher} callback - Function to call when the payment intent changes
 * @example
 * // Watch a specific payment intent
 * WatchPayment('pi_123456789', (id, intent, context) => {
 *   if (intent.status === 'succeeded') {
 *     console.log(`Payment ${id} completed successfully!`);
 *   } else if (intent.status === 'canceled') {
 *     console.log(`Payment ${id} was canceled: ${intent.cancellation_reason}`);
 *   } else {
 *     console.log(`Payment ${id} status: ${intent.status}`);
 *   }
 * });
 */
export function WatchPayment(paymentIntentId: string, callback: IntentWatcher) {
  if (!watchersIntent.has(paymentIntentId)) {
    watchersIntent.set(paymentIntentId, new Set());
  }
  watchersIntent.get(paymentIntentId)!.add(callback);
}
