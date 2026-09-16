import { CustomerNotFoundError } from "@antelopejs/interface-payment";
import type {
  Customer,
  CustomerRequest,
  PaymentMethod,
} from "@antelopejs/interface-payment";

import { Translating } from "./errors";
import { GetAccount } from "./accounts";
import { ToPaymentMethod } from "./mapping";

const CUSTOMER_ENTITY = { entity: "customer" as const };
const METHOD_ENTITY = { entity: "payment method" as const };
const LISTED_METHOD_TYPES = ["card", "sepa_debit", "paypal", "link"] as const;

function toCustomer(customer: import("stripe").Stripe.Customer): Customer {
  return {
    id: customer.id,
    ...(customer.email ? { email: customer.email } : {}),
    ...(customer.name ? { name: customer.name } : {}),
    ...(customer.metadata && Object.keys(customer.metadata).length > 0
      ? { metadata: customer.metadata }
      : {}),
  };
}

export async function createCustomer(
  request: CustomerRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<Customer> {
  const { client } = GetAccount(provider);
  return Translating("", CUSTOMER_ENTITY, async () =>
    toCustomer(
      await client.customers.create(
        {
          ...(request.email ? { email: request.email } : {}),
          ...(request.name ? { name: request.name } : {}),
          ...(request.metadata ? { metadata: request.metadata } : {}),
        },
        { idempotencyKey },
      ),
    ),
  );
}

/**
 * A deleted Stripe customer is still retrievable, as an object whose only
 * meaningful field is `deleted: true`. The contract says a deleted customer is
 * gone, so that shape is reported as missing.
 */
export async function getCustomer(
  id: string,
  provider?: string,
): Promise<Customer> {
  const { client } = GetAccount(provider);
  return Translating(id, CUSTOMER_ENTITY, async () => {
    const customer = await client.customers.retrieve(id);
    if (customer.deleted) {
      throw new CustomerNotFoundError(id);
    }
    return toCustomer(customer);
  });
}

export async function deleteCustomer(
  id: string,
  idempotencyKey: string,
  provider?: string,
): Promise<void> {
  const { client } = GetAccount(provider);
  await Translating(id, CUSTOMER_ENTITY, () =>
    client.customers.del(id, { idempotencyKey }),
  );
}

export async function listPaymentMethods(
  customer: string,
  provider?: string,
): Promise<PaymentMethod[]> {
  const { client } = GetAccount(provider);
  return Translating(customer, CUSTOMER_ENTITY, async () => {
    const pages = await Promise.all(
      LISTED_METHOD_TYPES.map((type) =>
        client.paymentMethods.list({ customer, type }),
      ),
    );
    return pages
      .flatMap((page) => page.data)
      .sort((first, second) => second.created - first.created)
      .map(ToPaymentMethod);
  });
}

export async function detachPaymentMethod(
  id: string,
  idempotencyKey: string,
  provider?: string,
): Promise<void> {
  const { client } = GetAccount(provider);
  await Translating(id, METHOD_ENTITY, () =>
    client.paymentMethods.detach(id, {}, { idempotencyKey }),
  );
}
