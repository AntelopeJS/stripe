import Stripe from "stripe";
import { PaymentError, type Payment } from "@antelopejs/interface-payment";
import {
  type CancellationTiming,
  InvalidSubscriptionRequestError,
  InvalidSubscriptionStateError,
  type Subscription,
  SubscriptionError,
  SubscriptionNotFoundError,
  SubscriptionPaymentError,
  type SubscriptionRequest,
  ValidateSubscriptionRequest,
} from "@antelopejs/interface-subscriptions";

import { SubscriptionProduct } from "./product";
import { GetAccount } from "../payment/accounts";
import { IsOwnSubscription, ToSubscription } from "./mapping";
import { ToPayment, WriteMetadata } from "../payment/mapping";
import {
  IsAnyMissing,
  IsMissing,
  TranslateSubscriptionError,
  TranslatingSubscription,
} from "./errors";

export const EXPAND_LATEST_PAYMENT = ["latest_invoice.payments"];
const EXPAND_LISTED = ["data.latest_invoice.payments"];
const MILLIS_PER_SECOND = 1000;
const LIST_LIMIT = 10_000;
const MISSING = "resource_missing";
const CANCELLATION_MARK = "antelopejs-idempotency-key:";

function seconds(millis: number): number {
  return Math.floor(millis / MILLIS_PER_SECOND);
}

function clientFor(provider: string | undefined): Stripe {
  try {
    return GetAccount(provider).client;
  } catch (error) {
    if (!(error instanceof PaymentError)) throw error;
    throw new SubscriptionError(error.message);
  }
}

function createParams(
  request: SubscriptionRequest,
  product: string,
): Stripe.SubscriptionCreateParams {
  const params: Stripe.SubscriptionCreateParams = {
    customer: request.customer,
    default_payment_method: request.paymentMethod,
    items: [
      {
        price_data: {
          currency: request.amount.currency.toLowerCase(),
          product,
          unit_amount: request.amount.value,
          recurring: {
            interval: request.interval,
            interval_count: request.intervalCount ?? 1,
          },
        },
      },
    ],
    payment_behavior: "error_if_incomplete",
    off_session: true,
    metadata: WriteMetadata(request.reference, request.metadata),
    expand: EXPAND_LATEST_PAYMENT,
  };
  if (request.description) params.description = request.description;
  if (request.trialEnd !== undefined) {
    params.trial_end = seconds(request.trialEnd);
  }
  if (request.billingAnchor !== undefined) {
    params.billing_cycle_anchor = seconds(request.billingAnchor);
    params.proration_behavior = "none";
  }
  return params;
}

async function declinedPayment(
  client: Stripe,
  error: unknown,
): Promise<Payment | undefined> {
  if (!(error instanceof Stripe.errors.StripeCardError) || !error.charge) {
    return undefined;
  }
  const charge = await client.charges.retrieve(error.charge);
  const intent =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!intent) return undefined;
  return ToPayment(
    await client.paymentIntents.retrieve(intent, { expand: ["latest_charge"] }),
  );
}

export async function CreateSubscription(
  request: SubscriptionRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<Subscription> {
  ValidateSubscriptionRequest(request, Date.now());
  const client = clientFor(provider);
  const product = await TranslatingSubscription(request.customer, () =>
    SubscriptionProduct(client),
  );
  try {
    const created = await client.subscriptions.create(
      createParams(request, product),
      { idempotencyKey },
    );
    return ToSubscription(created);
  } catch (error) {
    const declined = await declinedPayment(client, error);
    if (declined) {
      throw new SubscriptionPaymentError(
        declined,
        (error as Stripe.errors.StripeError).code,
      );
    }
    throw TranslateSubscriptionError(error, request.customer);
  }
}

async function ownSubscription(
  client: Stripe,
  id: string,
): Promise<Stripe.Subscription> {
  const subscription = await TranslatingSubscription(id, () =>
    client.subscriptions.retrieve(id, { expand: EXPAND_LATEST_PAYMENT }),
  );
  if (!IsOwnSubscription(subscription.metadata)) {
    throw new SubscriptionNotFoundError(id);
  }
  return subscription;
}

export async function GetSubscription(
  id: string,
  provider?: string,
): Promise<Subscription> {
  return ToSubscription(await ownSubscription(clientFor(provider), id));
}

export async function ListSubscriptions(
  customer: string,
  provider?: string,
): Promise<Subscription[]> {
  const client = clientFor(provider);
  try {
    const listed = await client.subscriptions
      .list({ customer, status: "all", expand: EXPAND_LISTED })
      .autoPagingToArray({ limit: LIST_LIMIT });
    return listed
      .filter((subscription) => IsOwnSubscription(subscription.metadata))
      .map((subscription) => ToSubscription(subscription));
  } catch (error) {
    if (IsAnyMissing(error)) return [];
    throw TranslateSubscriptionError(error, customer);
  }
}

type Cancellation = (
  client: Stripe,
  id: string,
  idempotencyKey: string,
) => Promise<Stripe.Subscription>;

const CANCELLATIONS: Record<CancellationTiming, Cancellation> = {
  now: (client, id, idempotencyKey) =>
    client.subscriptions.cancel(
      id,
      {
        expand: EXPAND_LATEST_PAYMENT,
        cancellation_details: { comment: cancellationMark(idempotencyKey) },
      },
      { idempotencyKey },
    ),
  period_end: (client, id, idempotencyKey) =>
    client.subscriptions.update(
      id,
      { cancel_at_period_end: true, expand: EXPAND_LATEST_PAYMENT },
      { idempotencyKey },
    ),
};

function cancellationMark(idempotencyKey: string): string {
  return `${CANCELLATION_MARK}${idempotencyKey}`;
}

async function replayedOrMissing(
  client: Stripe,
  id: string,
  idempotencyKey: string,
): Promise<Subscription | Error> {
  const existing = await client.subscriptions
    .retrieve(id, { expand: EXPAND_LATEST_PAYMENT })
    .catch(() => null);
  const isReplay =
    existing?.cancellation_details?.comment ===
    cancellationMark(idempotencyKey);
  if (existing && isReplay) return ToSubscription(existing);
  if (existing?.status === "canceled") {
    return new InvalidSubscriptionStateError(
      `Subscription ${id} has ended`,
      "canceled",
    );
  }
  return new SubscriptionNotFoundError(id, MISSING);
}

export async function CancelSubscription(
  id: string,
  idempotencyKey: string,
  timing: CancellationTiming,
  provider?: string,
): Promise<Subscription> {
  const cancel = CANCELLATIONS[timing];
  if (!cancel) {
    throw new InvalidSubscriptionRequestError(
      `Unknown cancellation timing: ${timing}`,
    );
  }
  const client = clientFor(provider);
  await ownSubscription(client, id);
  try {
    return ToSubscription(await cancel(client, id, idempotencyKey));
  } catch (error) {
    if (!IsMissing(error)) throw TranslateSubscriptionError(error, id);
    const replayed = await replayedOrMissing(client, id, idempotencyKey);
    if (replayed instanceof Error) throw replayed;
    return replayed;
  }
}

export async function UpdateSubscriptionPaymentMethod(
  id: string,
  paymentMethod: string,
  idempotencyKey: string,
  provider?: string,
): Promise<Subscription> {
  const client = clientFor(provider);
  await ownSubscription(client, id);
  return TranslatingSubscription(id, async () =>
    ToSubscription(
      await client.subscriptions.update(
        id,
        {
          default_payment_method: paymentMethod,
          expand: EXPAND_LATEST_PAYMENT,
        },
        { idempotencyKey },
      ),
    ),
  );
}
