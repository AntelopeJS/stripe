import Stripe from "stripe";
import { PaymentError } from "@antelopejs/interface-payment";
import type {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentStatus,
} from "@antelopejs/interface-payment";

import { Translating } from "./errors";
import { GetAccount } from "./accounts";
import { Expanded, IsStripeId, Lookup } from "../fields";
import { ToEpochMillis, ToPaymentStatus, WriteMetadata } from "./mapping";

const SESSION_ENTITY = { entity: "checkout session" as const };
const OPEN = "open";
const EXPAND_INTENT = ["payment_intent"];

/** Checkout parameters including `managed_payments`, which Stripe 18's types predate. */
interface StandardCheckoutParams extends Stripe.Checkout.SessionCreateParams {
  managed_payments: { enabled: false };
}

const STATUS_BY_SESSION_STATUS = {
  complete: "succeeded",
  expired: "canceled",
  [OPEN]: "pending",
} satisfies Record<Stripe.Checkout.Session.Status, PaymentStatus>;

function lineItem(
  request: CheckoutSessionRequest,
): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: 1,
    price_data: {
      currency: request.amount.currency.toLowerCase(),
      unit_amount: request.amount.value,
      product_data: { name: request.description ?? request.reference },
    },
  };
}

/**
 * While the session is open the payer can still retry, so the session's own
 * status wins: a first card that declined leaves the intent at
 * `requires_payment_method` with an error recorded, which reads as the terminal
 * `failed` and would have a backend abandon an order the payer is still paying.
 * Once the session is no longer open, the intent is the better answer — it
 * distinguishes `authorized` and `failed`, which the session status cannot.
 */
function toSession(session: Stripe.Checkout.Session): CheckoutSession {
  const intent = Expanded(session.payment_intent);
  const paymentId = IsStripeId(session.payment_intent)
    ? session.payment_intent
    : intent?.id;
  const result: CheckoutSession = {
    id: session.id,
    redirectUrl: session.url ?? "",
    status:
      intent && session.status !== OPEN
        ? ToPaymentStatus(intent)
        : (Lookup(STATUS_BY_SESSION_STATUS, session.status ?? OPEN) ??
          "pending"),
  };
  if (paymentId) result.payment = paymentId;
  if (session.expires_at) result.expiresAt = ToEpochMillis(session.expires_at);
  return result;
}

export async function CreateCheckoutSession(
  request: CheckoutSessionRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<CheckoutSession> {
  if (request.savePaymentMethod && !request.customer) {
    throw new PaymentError("savePaymentMethod requires a customer");
  }
  const { client } = GetAccount(provider);
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
    { metadata: WriteMetadata(request.reference, request.metadata) };
  if (request.authorizeOnly) paymentIntentData.capture_method = "manual";
  if (request.savePaymentMethod) {
    paymentIntentData.setup_future_usage = "off_session";
  }
  const params: StandardCheckoutParams = {
    mode: "payment",
    managed_payments: { enabled: false },
    line_items: [lineItem(request)],
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    metadata: WriteMetadata(request.reference, request.metadata),
    payment_intent_data: paymentIntentData,
  };
  if (request.customer) params.customer = request.customer;
  if (request.locale) params.locale = request.locale;
  return Translating("", SESSION_ENTITY, async () =>
    toSession(
      await client.checkout.sessions.create(params, { idempotencyKey }),
    ),
  );
}

export async function GetCheckoutSession(
  id: string,
  provider?: string,
): Promise<CheckoutSession> {
  const { client } = GetAccount(provider);
  return Translating(id, SESSION_ENTITY, async () =>
    toSession(
      await client.checkout.sessions.retrieve(id, { expand: EXPAND_INTENT }),
    ),
  );
}
