import Stripe from "stripe";
import {
  InvalidSubscriptionRequestError,
  InvalidSubscriptionStateError,
  SubscriptionError,
  SubscriptionNotFoundError,
} from "@antelopejs/interface-subscriptions";

const RESOURCE_MISSING = "resource_missing";
const CANCELED_FIELDS = "invalid_canceled_subscription_fields";
const INVALID_REQUEST = "invalid_request_error";

type Translation = (error: Stripe.errors.StripeError, id: string) => Error;

const BY_CODE: Record<string, Translation> = {
  [RESOURCE_MISSING]: (error, id) =>
    new SubscriptionNotFoundError(id, error.code),
  [CANCELED_FIELDS]: (error) =>
    new InvalidSubscriptionStateError(error.message, "canceled", error.code),
};

export function TranslateSubscriptionError(
  error: unknown,
  id: string,
): unknown {
  if (!(error instanceof Stripe.errors.StripeError)) return error;
  const translate = error.code ? BY_CODE[error.code] : undefined;
  if (translate) return translate(error, id);
  if (error.rawType === INVALID_REQUEST) {
    return new InvalidSubscriptionRequestError(error.message, error.code);
  }
  return new SubscriptionError(
    error.message ?? "Stripe rejected the call",
    error.code,
  );
}

export function IsMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeError &&
    error.code === RESOURCE_MISSING
  );
}

export async function TranslatingSubscription<T>(
  id: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw TranslateSubscriptionError(error, id);
  }
}
