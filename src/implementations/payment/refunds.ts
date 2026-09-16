import type { Refund, RefundRequest } from "@antelopejs/interface-payment";

import { Translating } from "./errors";
import { GetAccount } from "./accounts";
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

export async function refundPayment(
  request: RefundRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<Refund> {
  const { client } = GetAccount(provider);
  return Translating(request.payment, REFUND_ENTITY, async () =>
    ToRefund(
      await client.refunds.create(
        {
          payment_intent: request.payment,
          metadata: WriteMetadata("", request.metadata),
          ...(request.amount ? { amount: request.amount.value } : {}),
          ...(request.reason === "duplicate" ||
          request.reason === "fraudulent" ||
          request.reason === "requested_by_customer"
            ? { reason: request.reason }
            : {}),
        },
        { idempotencyKey },
      ),
    ),
  );
}

export async function getRefund(
  id: string,
  provider?: string,
): Promise<Refund> {
  const { client } = GetAccount(provider);
  return Translating(id, { entity: "refund" }, async () =>
    ToRefund(await client.refunds.retrieve(id)),
  );
}
