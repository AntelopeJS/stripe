import type { PaymentError } from "@antelopejs/interface-payment";
import type {
  SubscriptionError,
  SubscriptionPaymentError,
} from "@antelopejs/interface-subscriptions";

const PAYMENT_ERROR_NAMES: ReadonlySet<string> = new Set([
  "PaymentError",
  "PaymentNotFoundError",
  "CustomerNotFoundError",
  "WebhookVerificationError",
  "InvalidPaymentStateError",
  "UnsupportedOperationError",
]);

const SUBSCRIPTION_ERROR_NAMES: ReadonlySet<string> = new Set([
  "SubscriptionError",
  "SubscriptionNotFoundError",
  "InvalidSubscriptionRequestError",
  "InvalidSubscriptionStateError",
  "SubscriptionPaymentError",
]);

function hasName(error: Error, names: ReadonlySet<string>): boolean {
  return names.has(error.name);
}

/**
 * Whether `error` is a payment interface error, whichever copy of the
 * interface package built it.
 */
export function IsPaymentError(error: unknown): error is PaymentError {
  return error instanceof Error && hasName(error, PAYMENT_ERROR_NAMES);
}

/**
 * Whether `error` is a subscriptions interface error, whichever copy of the
 * interface package built it.
 */
export function IsSubscriptionError(
  error: unknown,
): error is SubscriptionError {
  return error instanceof Error && hasName(error, SUBSCRIPTION_ERROR_NAMES);
}

/**
 * Whether `error` is the subscriptions interface's refused-payment error.
 */
export function IsSubscriptionPaymentError(
  error: unknown,
): error is SubscriptionPaymentError {
  return error instanceof Error && error.name === "SubscriptionPaymentError";
}

/**
 * Whether `error` carries exactly the given payment error name.
 */
export function HasErrorName(error: Error, name: string): boolean {
  return error.name === name;
}
