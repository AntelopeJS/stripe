import Stripe from 'stripe';
/**
 * Context information for payment intent change events
 * @property {boolean} local - Indicates if the event was triggered locally or received from another cluster instance
 */
export interface IntentChangeContext {
    local: boolean;
}
/**
 * Returns the Stripe client instance
 * @returns {Promise<Stripe>} A promise that resolves to the Stripe client
 */
export declare function GetClient(): Promise<Stripe>;
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
export declare function InitializePayment(id: string, params: Stripe.PaymentIntentCreateParams, options?: Stripe.RequestOptions): Promise<Stripe.Response<Stripe.PaymentIntent>>;
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
export declare function WaitForPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent>;
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
export declare function CompletePayment(paymentIntentId: string, source: Stripe.Source): Promise<void>;
/**
 * Callback type for payment intent watchers
 * @callback IntentWatcher
 * @param {any} id - The ID from the payment intent's metadata.payload
 * @param {Stripe.PaymentIntent} intent - The payment intent object
 * @param {IntentChangeContext} context - The context of the intent change
 */
type PaymentPayloadId = string | undefined;
type IntentWatcher = (id: PaymentPayloadId, intent: Stripe.PaymentIntent, context: IntentChangeContext) => void;
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
export declare function WatchAllPayments(callback: IntentWatcher, onlyLocal?: boolean): void;
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
export declare function WatchPayment(paymentIntentId: string, callback: IntentWatcher): void;
export {};
