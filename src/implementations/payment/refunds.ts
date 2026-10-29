import type Stripe from "stripe";
import type {
  Refund,
  RefundReason,
  RefundRequest,
} from "@antelopejs/interface-payment";

import { Translating } from "./errors";
import { GetAccount } from "./accounts";
import { Lookup } from "../fields";
import { ToRefund, WriteMetadata } from "./mapping";

/**
 * Stripe leaves the refund endpoint's amount rejections uncoded ("Refund amount
 * is greater than charge amount"), so an uncoded rejection here is a state
 * problem rather than a malformed call.
 */
const REFUND_ENTITY = {
  entity: "refund" as const,
  uncodedIsState: true,
};

/** Stripe accepts three reasons; the contract has a fourth. */
const STRIPE_REASONS = {
  duplicate: "duplicate",
  fraudulent: "fraudulent",
  requested_by_customer: "requested_by_customer",
} satisfies Partial<Record<RefundReason, Stripe.RefundCreateParams.Reason>>;

/** The reason metadata key, for a reason Stripe has no field for. */
const REASON_KEY = "antelope_refund_reason";

function toReason(reason: RefundReason | undefined): Stripe.RefundCreateParams {
  if (!reason) {
    return {};
  }
  const native = Lookup(STRIPE_REASONS, reason);
  return native ? { reason: native } : {};
}

function reasonMetadata(
  reason: RefundReason | undefined,
): Record<string, string> {
  return reason && !Lookup(STRIPE_REASONS, reason)
    ? { [REASON_KEY]: reason }
    : {};
}

function refundParams(request: RefundRequest): Stripe.RefundCreateParams {
  const params: Stripe.RefundCreateParams = {
    payment_intent: request.payment,
    metadata: WriteMetadata("", {
      ...request.metadata,
      ...reasonMetadata(request.reason),
    }),
  };
  if (request.amount) params.amount = request.amount.value;
  return { ...params, ...toReason(request.reason) };
}

export async function RefundPayment(
  request: RefundRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<Refund> {
  const { client } = GetAccount(provider);
  return Translating(request.payment, REFUND_ENTITY, async () =>
    ToRefund(
      await client.refunds.create(refundParams(request), { idempotencyKey }),
    ),
  );
}

export async function GetRefund(
  id: string,
  provider?: string,
): Promise<Refund> {
  const { client } = GetAccount(provider);
  return Translating(id, { entity: "refund" }, async () =>
    ToRefund(await client.refunds.retrieve(id)),
  );
}
