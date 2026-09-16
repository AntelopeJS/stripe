import Stripe from "stripe";
import assert from "node:assert/strict";
import {
  CreateCustomer,
  DeleteCustomer,
  ListPaymentMethods,
} from "@antelopejs/interface-payment";

const SUITE_TIMEOUT = 120_000;
/** Stripe's default page size is 10, so this must exceed it to mean anything. */
const SAVED_METHODS = 13;
const TEST_TOKEN = "tok_visa";

function key(): string {
  return `antelope-listing-${Math.random().toString(36).slice(2)}`;
}

describe("[stripe] listing saved payment methods", function () {
  this.timeout(SUITE_TIMEOUT);

  let customer: string | undefined;

  after(async () => {
    if (customer) await DeleteCustomer(customer, key()).catch(() => undefined);
  });

  before(function () {
    if (!process.env.STRIPE_KEY) this.skip();
  });

  it("returns every saved method, not just the provider's first page", async () => {
    const client = new Stripe(process.env.STRIPE_KEY ?? "");

    const created = await CreateCustomer(
      { email: `${key()}@merchant.invalid` },
      key(),
    );
    customer = created.id;

    for (let index = 0; index < SAVED_METHODS; index += 1) {
      const method = await client.paymentMethods.create({
        type: "card",
        card: { token: TEST_TOKEN },
      });
      await client.paymentMethods.attach(method.id, { customer: created.id });
    }

    const listed = await ListPaymentMethods(created.id);

    assert.equal(
      listed.length,
      SAVED_METHODS,
      `expected every saved method; a truncated first page would report 10`,
    );
    assert.equal(new Set(listed.map((entry) => entry.id)).size, SAVED_METHODS);
    for (const entry of listed) {
      assert.equal(entry.customer, created.id);
      assert.equal(entry.type, "card");
      assert.ok(entry.card?.last4);
    }
  });
});
