import Stripe from "stripe";
import {
  CustomerNotFoundError,
  type CustomerEntity,
  InvalidPaymentStateError,
  type PaymentEntity,
  PaymentError,
  PaymentNotFoundError,
} from "@antelopejs/interface-payment";

const RESOURCE_MISSING = "resource_missing";

const STATE_CODES = new Set([
  "payment_intent_unexpected_state",
  "charge_already_captured",
  "charge_already_refunded",
  "charge_disputed",
  "payment_intent_incompatible_payment_method",
  "setup_intent_unexpected_state",
]);

export interface ErrorContext {
  /** What a `resource_missing` refers to for the call being made. */
  entity: PaymentEntity | CustomerEntity;
  /**
   * Whether an `invalid_request_error` carrying no code at all is a state
   * problem for this call. Stripe leaves the refund endpoint's amount errors
   * uncoded ("Refund amount is greater than charge amount"), so the calling
   * operation has to say what an uncoded rejection means for it.
   */
  uncodedIsState?: boolean;
}

const CUSTOMER_ENTITIES = new Set<string>(["customer", "payment method"]);

function notFound(id: string, entity: string, code?: string): PaymentError {
  if (CUSTOMER_ENTITIES.has(entity)) {
    return new CustomerNotFoundError(id, entity as CustomerEntity, code);
  }
  return new PaymentNotFoundError(id, entity as PaymentEntity, code);
}

function isState(error: Stripe.errors.StripeError, context: ErrorContext) {
  if (error.code && STATE_CODES.has(error.code)) {
    return true;
  }
  return Boolean(context.uncodedIsState) && !error.code;
}

/**
 * Translates a Stripe error into the interface's error vocabulary.
 *
 * An error that is not one the contract names is rethrown as a {@link PaymentError}
 * carrying Stripe's own code, rather than being forced into a category it does
 * not belong to.
 *
 * @param error - The thrown value, which may not be a Stripe error at all
 * @param id - The identifier the call was made against, for the message
 * @param context - What a missing resource and an uncoded rejection mean here
 */
function TranslateError(
  error: unknown,
  id: string,
  context: ErrorContext,
): unknown {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return error;
  }
  if (error.code === RESOURCE_MISSING) {
    return notFound(id, context.entity, error.code);
  }
  if (isState(error, context)) {
    return new InvalidPaymentStateError(
      error.message ?? "The payment is not in a state that allows this",
      undefined,
      error.code,
    );
  }
  return new PaymentError(
    error.message ?? "Stripe rejected the call",
    error.code,
  );
}

/**
 * Runs a Stripe call, translating any error it raises.
 */
export async function Translating<T>(
  id: string,
  context: ErrorContext,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw TranslateError(error, id, context);
  }
}
