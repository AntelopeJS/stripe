import Stripe from "stripe";
import { PaymentError } from "@antelopejs/interface-payment";
import type {
  CheckoutSession,
  CheckoutSessionRequest,
  PaymentStatus,
} from "@antelopejs/interface-payment";

import { Translating } from "./errors";
import { GetAccount } from "./accounts";
import { ToEpochMillis, ToPaymentStatus, WriteMetadata } from "./mapping";

const SESSION_ENTITY = { entity: "checkout session" as const };
const OPEN = "open";
const EXPAND_INTENT = ["payment_intent"];

const STATUS_BY_SESSION_STATUS: Record<string, PaymentStatus> = {
  complete: "succeeded",
  expired: "canceled",
  [OPEN]: "pending",
};

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
  const intent =
    session.payment_intent && typeof session.payment_intent !== "string"
      ? session.payment_intent
      : undefined;
  const paymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : intent?.id;
  return {
    id: session.id,
    redirectUrl: session.url ?? "",
    status:
      intent && session.status !== OPEN
        ? ToPaymentStatus(intent)
        : (STATUS_BY_SESSION_STATUS[session.status ?? OPEN] ?? "pending"),
    ...(paymentId ? { payment: paymentId } : {}),
    ...(session.expires_at
      ? { expiresAt: ToEpochMillis(session.expires_at) }
      : {}),
  };
}

export async function createCheckoutSession(
  request: CheckoutSessionRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<CheckoutSession> {
  if (request.savePaymentMethod && !request.customer) {
    throw new PaymentError("savePaymentMethod requires a customer");
  }
  const { client } = GetAccount(provider);
  return Translating("", SESSION_ENTITY, async () =>
    toSession(
      await client.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [lineItem(request)],
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          metadata: WriteMetadata(request.reference, request.metadata),
          payment_intent_data: {
            metadata: WriteMetadata(request.reference, request.metadata),
            ...(request.authorizeOnly
              ? { capture_method: "manual" as const }
              : {}),
            ...(request.savePaymentMethod
              ? { setup_future_usage: "off_session" as const }
              : {}),
          },
          ...(request.customer ? { customer: request.customer } : {}),
          ...(request.locale
            ? {
                locale:
                  request.locale as Stripe.Checkout.SessionCreateParams.Locale,
              }
            : {}),
        },
        { idempotencyKey },
      ),
    ),
  );
}

export async function getCheckoutSession(
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
