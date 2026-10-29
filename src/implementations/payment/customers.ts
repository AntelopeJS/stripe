import type Stripe from "stripe";
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
const METHOD_PAGE_SIZE = 100;

function toCustomer(customer: Stripe.Customer): Customer {
  const result: Customer = { id: customer.id };
  if (customer.email) result.email = customer.email;
  if (customer.name) result.name = customer.name;
  if (customer.metadata && Object.keys(customer.metadata).length > 0) {
    result.metadata = customer.metadata;
  }
  return result;
}

function customerParams(request: CustomerRequest): Stripe.CustomerCreateParams {
  const params: Stripe.CustomerCreateParams = {};
  if (request.email) params.email = request.email;
  if (request.name) params.name = request.name;
  if (request.metadata) params.metadata = request.metadata;
  return params;
}

export async function CreateCustomer(
  request: CustomerRequest,
  idempotencyKey: string,
  provider?: string,
): Promise<Customer> {
  const { client } = GetAccount(provider);
  return Translating("", CUSTOMER_ENTITY, async () =>
    toCustomer(
      await client.customers.create(customerParams(request), {
        idempotencyKey,
      }),
    ),
  );
}

/**
 * A deleted Stripe customer is still retrievable, as an object whose only
 * meaningful field is `deleted: true`. The contract says a deleted customer is
 * gone, so that shape is reported as missing.
 */
export async function GetCustomer(
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

export async function DeleteCustomer(
  id: string,
  idempotencyKey: string,
  provider?: string,
): Promise<void> {
  const { client } = GetAccount(provider);
  await Translating(id, CUSTOMER_ENTITY, () =>
    client.customers.del(id, { idempotencyKey }),
  );
}

export async function ListPaymentMethods(
  customer: string,
  provider?: string,
): Promise<PaymentMethod[]> {
  const { client } = GetAccount(provider);
  return Translating(customer, CUSTOMER_ENTITY, async () => {
    const methods: PaymentMethod[] = [];
    for await (const method of client.paymentMethods.list({
      customer,
      limit: METHOD_PAGE_SIZE,
    })) {
      methods.push(ToPaymentMethod(method));
    }
    return methods.sort((first, second) => second.createdAt - first.createdAt);
  });
}

export async function DetachPaymentMethod(
  id: string,
  idempotencyKey: string,
  provider?: string,
): Promise<void> {
  const { client } = GetAccount(provider);
  await Translating(id, METHOD_ENTITY, () =>
    client.paymentMethods.detach(id, {}, { idempotencyKey }),
  );
}
