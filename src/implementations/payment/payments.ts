import Stripe from "stripe";
import { PaymentError } from "@antelopejs/interface-payment";
import type {
  Amount,
  Payment,
  PaymentRequest,
} from "@antelopejs/interface-payment";

import { GetAccount } from "./accounts";
import { ToPayment, WriteMetadata } from "./mapping";
import { TranslateError, Translating } from "./errors";

const PAYMENT_ENTITY = { entity: "payment" as const };
const EXPAND_CHARGE = ["latest_charge"];

function assertConsistent(request: PaymentRequest): void {
  if (request.savePaymentMethod && request.offSession) {
    throw new PaymentError(
      "savePaymentMethod cannot be combined with offSession: a mandate can only be taken from a payer who is present",
    );
  }
  if (request.offSession && !request.paymentMethod) {
    throw new PaymentError(
      "An off-session payment needs a saved paymentMethod to charge",
    );
  }
  if (request.savePaymentMethod && !request.customer) {
    throw new PaymentError("savePaymentMethod requires a customer");
  }
}

function buildParams(
  request: PaymentRequest,
): Stripe.PaymentIntentCreateParams {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: request.amount.value,
    currency: request.amount.currency.toLowerCase(),
    metadata: WriteMetadata(request.reference, request.metadata),
    confirm: Boolean(request.paymentMethod),
    ...(request.authorizeOnly ? { capture_method: "manual" as const } : {}),
    ...(request.paymentMethod ? { payment_method: request.paymentMethod } : {}),
    ...(request.customer ? { customer: request.customer } : {}),
    ...(request.description ? { description: request.description } : {}),
    ...(request.offSession ? { off_session: true } : {}),
    ...(request.savePaymentMethod
      ? { setup_future_usage: "off_session" as const }
      : {}),
  };
  if (request.returnUrl) {
    return { ...params, return_url: request.returnUrl };
  }
  return {
    ...params,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  };
}

/**
 * A card decline arrives as a thrown StripeCardError carrying the intent it
 * failed on. The contract reports that as a resolved Payment with status
 * `failed`, so that a synchronous decline and one that arrives later by webhook
 * are handled in the same place.
 */
function declinedPayment(error: unknown): Payment | undefined {
  if (!(error instanceof Stripe.errors.StripeCardError)) {
    return undefined;
  }
  const intent = error.payment_intent;
  return intent ? ToPayment(intent) : undefined;
}

export async function CreatePayment(
  request: PaymentRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<Payment> {
  assertConsistent(request);
  const { client } = GetAccount(provider);
  try {
    const intent = await client.paymentIntents.create(buildParams(request), {
      idempotencyKey,
    });
    return ToPayment(intent);
  } catch (error) {
    const declined = declinedPayment(error);
    if (declined) {
      return declined;
    }
    throw TranslateError(error, request.paymentMethod ?? "", PAYMENT_ENTITY);
  }
}

export async function GetPayment(
  id: string,
  provider?: string,
): Promise<Payment> {
  const { client } = GetAccount(provider);
  return Translating(id, PAYMENT_ENTITY, async () =>
    ToPayment(
      await client.paymentIntents.retrieve(id, { expand: EXPAND_CHARGE }),
    ),
  );
}

export async function CapturePayment(
  id: string,
  idempotencyKey: string,
  amount?: Amount,
  provider?: string,
): Promise<Payment> {
  const { client } = GetAccount(provider);
  return Translating(id, PAYMENT_ENTITY, async () => {
    await client.paymentIntents.capture(
      id,
      amount ? { amount_to_capture: amount.value } : {},
      { idempotencyKey },
    );
    return ToPayment(
      await client.paymentIntents.retrieve(id, { expand: EXPAND_CHARGE }),
    );
  });
}

export async function CancelPayment(
  id: string,
  idempotencyKey: string,
  provider?: string,
): Promise<Payment> {
  const { client } = GetAccount(provider);
  return Translating(id, PAYMENT_ENTITY, async () => {
    await client.paymentIntents.cancel(id, {}, { idempotencyKey });
    return ToPayment(
      await client.paymentIntents.retrieve(id, { expand: EXPAND_CHARGE }),
    );
  });
}
