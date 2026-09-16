import Stripe from "stripe";
import { PaymentError } from "@antelopejs/interface-payment";
import type {
  Amount,
  CardDetails,
  Dispute,
  Payment,
  PaymentFailure,
  PaymentFailureCode,
  PaymentMethod,
  PaymentMethodType,
  PaymentStatus,
  Refund,
  RefundStatus,
} from "@antelopejs/interface-payment";

/** Metadata key the caller's own reference is round-tripped through. */
const REFERENCE_KEY = "antelope_reference";

const MILLIS_PER_SECOND = 1000;

const STATUS_BY_INTENT_STATUS: Record<string, PaymentStatus> = {
  canceled: "canceled",
  processing: "pending",
  requires_action: "requires_action",
  requires_capture: "authorized",
  requires_confirmation: "pending",
  requires_payment_method: "pending",
  succeeded: "succeeded",
};

const FAILURE_BY_DECLINE_CODE: Record<string, PaymentFailureCode> = {
  authentication_required: "authentication_failed",
  expired_card: "expired_card",
  incorrect_cvc: "incorrect_details",
  incorrect_number: "incorrect_details",
  insufficient_funds: "insufficient_funds",
  invalid_expiry_month: "incorrect_details",
  invalid_expiry_year: "incorrect_details",
};

const FAILURE_BY_CODE: Record<string, PaymentFailureCode> = {
  card_declined: "declined",
  expired_card: "expired_card",
  incorrect_cvc: "incorrect_details",
  incorrect_number: "incorrect_details",
  payment_intent_authentication_failure: "authentication_failed",
  processing_error: "processing_error",
};

const REFUND_STATUS_BY_STRIPE: Record<string, RefundStatus> = {
  canceled: "failed",
  failed: "failed",
  pending: "pending",
  requires_action: "pending",
  succeeded: "succeeded",
};

const METHOD_TYPE_BY_STRIPE: Record<string, PaymentMethodType> = {
  card: "card",
  link: "wallet",
  paypal: "wallet",
  sepa_debit: "bank_account",
  us_bank_account: "bank_account",
};

function ToMinorUnits(value: number, currency: string): Amount {
  return { value, currency: currency.toUpperCase() };
}

export function ToEpochMillis(seconds: number): number {
  return seconds * MILLIS_PER_SECOND;
}

function expanded<T extends object>(field: string | T | null): T | undefined {
  return field && typeof field !== "string" ? field : undefined;
}

/**
 * Splits the caller's metadata from the reference this module hides in it.
 */
function ReadMetadata(metadata: Stripe.Metadata | null): {
  reference: string;
  metadata: Record<string, string>;
} {
  const entries = Object.entries(metadata ?? {});
  const own = entries.filter(([field]) => field !== REFERENCE_KEY);
  return {
    reference: metadata?.[REFERENCE_KEY] ?? "",
    metadata: Object.fromEntries(own),
  };
}

export function WriteMetadata(
  reference: string,
  metadata?: Record<string, string>,
): Stripe.MetadataParam {
  return { ...metadata, [REFERENCE_KEY]: reference };
}

/**
 * A declined intent sits at `requires_payment_method` so the payer can retry,
 * which is indistinguishable from a fresh unconfirmed one by status alone. The
 * presence of a recorded error is the discriminator.
 */
export function ToPaymentStatus(intent: Stripe.PaymentIntent): PaymentStatus {
  if (
    intent.status === "requires_payment_method" &&
    intent.last_payment_error
  ) {
    return "failed";
  }
  return STATUS_BY_INTENT_STATUS[intent.status] ?? "pending";
}

function ToFailure(
  error: Stripe.PaymentIntent.LastPaymentError | undefined,
): PaymentFailure | undefined {
  if (!error) {
    return undefined;
  }
  const code =
    FAILURE_BY_DECLINE_CODE[error.decline_code ?? ""] ??
    FAILURE_BY_CODE[error.code ?? ""] ??
    "declined";
  return {
    code,
    message: error.message ?? "The payment was declined",
    providerCode: error.decline_code ?? error.code,
  };
}

/**
 * The contract requires `redirectUrl` exactly when the status is
 * `requires_action`. Stripe supplies one for every next_action this module can
 * produce, because it always confirms server-side with a return_url; the
 * URL-less `use_stripe_sdk` action only arises from client-side confirmation.
 * If one ever reaches here the contract cannot be honoured, so say so rather
 * than return a payment that quietly breaks the invariant callers branch on.
 */
function redirectUrl(intent: Stripe.PaymentIntent): string {
  const url = intent.next_action?.redirect_to_url?.url;
  if (!url) {
    throw new PaymentError(
      `Payment ${intent.id} needs payer action of type "${intent.next_action?.type ?? "unknown"}", which has no redirect URL and cannot be expressed through this interface`,
    );
  }
  return url;
}

function refundedTotal(intent: Stripe.PaymentIntent): number {
  return expanded<Stripe.Charge>(intent.latest_charge)?.amount_refunded ?? 0;
}

/**
 * Normalises a PaymentIntent, which must have been retrieved with
 * `latest_charge` expanded so the refunded total is readable.
 */
export function ToPayment(intent: Stripe.PaymentIntent): Payment {
  const status = ToPaymentStatus(intent);
  const { reference, metadata } = ReadMetadata(intent.metadata);
  return {
    id: intent.id,
    amount: ToMinorUnits(intent.amount, intent.currency),
    amountCaptured: ToMinorUnits(intent.amount_received, intent.currency),
    amountRefunded: ToMinorUnits(refundedTotal(intent), intent.currency),
    status,
    reference,
    createdAt: ToEpochMillis(intent.created),
    ...(typeof intent.customer === "string"
      ? { customer: intent.customer }
      : {}),
    ...(typeof intent.payment_method === "string"
      ? { paymentMethod: intent.payment_method }
      : {}),
    ...(status === "requires_action"
      ? { redirectUrl: redirectUrl(intent) }
      : {}),
    ...(status === "failed"
      ? { failure: ToFailure(intent.last_payment_error ?? undefined) }
      : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

export function ToRefund(refund: Stripe.Refund): Refund {
  const { metadata } = ReadMetadata(refund.metadata);
  const status =
    REFUND_STATUS_BY_STRIPE[refund.status ?? "pending"] ?? "pending";
  const intent =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : (refund.payment_intent?.id ?? "");
  return {
    id: refund.id,
    payment: intent,
    amount: ToMinorUnits(refund.amount, refund.currency),
    status,
    createdAt: ToEpochMillis(refund.created),
    ...(status === "failed"
      ? {
          failure: {
            code: "processing_error" as PaymentFailureCode,
            message: refund.failure_reason ?? "The refund failed",
            ...(refund.failure_reason
              ? { providerCode: refund.failure_reason }
              : {}),
          },
        }
      : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function toCard(
  card: Stripe.PaymentMethod.Card | undefined,
): CardDetails | undefined {
  if (!card) {
    return undefined;
  }
  return {
    brand: card.brand,
    last4: card.last4,
    expiryMonth: card.exp_month,
    expiryYear: card.exp_year,
  };
}

export function ToPaymentMethod(method: Stripe.PaymentMethod): PaymentMethod {
  const card = toCard(method.card);
  return {
    id: method.id,
    type: METHOD_TYPE_BY_STRIPE[method.type] ?? "other",
    customer: typeof method.customer === "string" ? method.customer : "",
    createdAt: ToEpochMillis(method.created),
    ...(card ? { card } : {}),
  };
}

export function ToDispute(dispute: Stripe.Dispute): Dispute {
  const intent =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? "");
  return {
    id: dispute.id,
    payment: intent,
    amount: ToMinorUnits(dispute.amount, dispute.currency),
    createdAt: ToEpochMillis(dispute.created),
    ...(dispute.reason ? { reason: dispute.reason } : {}),
  };
}
