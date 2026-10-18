import Stripe from "stripe";

const PRODUCT_ID = "antelopejs_subscriptions";
const PRODUCT_NAME = "AntelopeJS subscriptions";
const ALREADY_EXISTS = "resource_already_exists";

const products = new WeakMap<Stripe, Promise<string>>();

async function create(client: Stripe): Promise<string> {
  try {
    await client.products.create({ id: PRODUCT_ID, name: PRODUCT_NAME });
  } catch (error) {
    const isPresent =
      error instanceof Stripe.errors.StripeError &&
      error.code === ALREADY_EXISTS;
    if (!isPresent) throw error;
  }
  return PRODUCT_ID;
}

export function SubscriptionProduct(client: Stripe): Promise<string> {
  const known = products.get(client);
  if (known) return known;
  const pending = create(client).catch((error: unknown) => {
    products.delete(client);
    throw error;
  });
  products.set(client, pending);
  return pending;
}
