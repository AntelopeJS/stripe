import type { Journey } from "@antelopejs/tooling-configs/verify";

import { API_KEY, EUR, answered, call, fresh, idOf, pay, pick, requestsTo, same, text, thrown, withSession } from "./session.ts";

const customerLifecycle: Journey = {
  title: "a customer keeps its email, name and metadata, is found again, and is not found once deleted",
  entryPoint: "`CreateCustomer`, `GetCustomer` and `DeleteCustomer` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const email = `${fresh("ada")}@merchant.invalid`;
      const key = fresh("key");
      const created = await call(session, "CreateCustomer", "CreateCustomer", [{ email, name: "Ada Lovelace", metadata: { plan: "gold" } }, key, null]);
      const sent = requestsTo(session, "POST", "/v1/customers")[0];
      context.expect(created.folder, [
        answered(created),
        same("the customer has the email, name and metadata given", [pick(created.value, "email"), pick(created.value, "name"), pick(created.value, "metadata")], [email, "Ada Lovelace", { plan: "gold" }]),
        same("Stripe received them under the caller's key", [sent?.form.email, sent?.form.name, pick(sent?.form, "metadata", "plan"), sent?.idempotencyKey ?? null], [email, "Ada Lovelace", "gold", key]),
      ], { critical: true });
      const id = idOf(created);
      const read = await call(session, "GetCustomer", "GetCustomer", [id]);
      context.expect(read.folder, [same("reading it back returns the same details", [pick(read.value, "id"), pick(read.value, "email")], [id, email]), same("Stripe holds the email", pick(session.stripe.object(API_KEY, id), "email"), email)]);
      const unknown = await call(session, "GetCustomer of an unknown id", "GetCustomer", ["cus_doesnotexist"]);
      context.expect(unknown.folder, [same("an unknown customer is a CustomerNotFoundError", pick(thrown(unknown), 0), "CustomerNotFoundError")]);
      const removed = await call(session, "DeleteCustomer", "DeleteCustomer", [id, fresh("key"), null]);
      context.expect(removed.folder, [answered(removed), same("Stripe received the delete", requestsTo(session, "DELETE", `/v1/customers/${id}`).length, 1)]);
      const gone = await call(session, "GetCustomer after the delete", "GetCustomer", [id]);
      context.expect(gone.folder, [same("a deleted customer is reported as not found", pick(thrown(gone), 0), "CustomerNotFoundError")]);
      const again = await call(session, "DeleteCustomer again", "DeleteCustomer", [id, fresh("key"), null]);
      context.expect(again.folder, [same("deleting it twice is a CustomerNotFoundError", pick(thrown(again), 0), "CustomerNotFoundError")]);
    });
  },
};

const savedCard: Journey = {
  title: "a card saved by a payment is listed on its customer, charged again off-session, and gone once detached; saving without a customer or saving off-session is refused before Stripe is called",
  entryPoint: "`CreatePayment` with `savePaymentMethod`, `ListPaymentMethods`, an `offSession` `CreatePayment` and `DetachPaymentMethod` through core",
  async run(context) {
    await withSession(context, async (session) => {
      const customer = await call(session, "CreateCustomer", "CreateCustomer", [{ email: `${fresh("grace")}@merchant.invalid` }, fresh("key"), null]);
      const customerId = idOf(customer);
      const saving = await pay(session, "CreatePayment saving the card", "pm_card_visa", { request: { customer: customerId, savePaymentMethod: true, returnUrl: "https://merchant.invalid/return" } });
      const method = text(pick(saving.value, "paymentMethod"));
      const savingRequest = requestsTo(session, "POST", "/v1/payment_intents")[0];
      context.expect(saving.folder, [
        answered(saving),
        same("Stripe was asked to keep the card for off-session use on that customer", [savingRequest?.form.setup_future_usage, savingRequest?.form.customer], ["off_session", customerId]),
        same("the payment names the card Stripe stored", method.startsWith("pm_") && method !== "pm_card_visa", true),
      ], { critical: true });
      const listed = await call(session, "ListPaymentMethods", "ListPaymentMethods", [customerId, null]);
      context.expect(listed.folder, [
        answered(listed),
        same("the customer has the one saved card, with its brand and last digits", [pick(listed.value, 0, "id"), pick(listed.value, 0, "type"), pick(listed.value, 0, "card", "brand"), pick(listed.value, 0, "card", "last4"), pick(listed.value, 0, "customer")], [method, "card", "visa", "4242", customerId]),
      ]);
      const charge = await pay(session, "CreatePayment off-session", method, { request: { customer: customerId, offSession: true } });
      const chargeRequest = requestsTo(session, "POST", "/v1/payment_intents")[1];
      context.expect(charge.folder, [
        answered(charge),
        same("the off-session charge succeeds on the saved card", [pick(charge.value, "status"), pick(charge.value, "amount"), pick(charge.value, "paymentMethod")], ["succeeded", EUR, method]),
        same("Stripe was told the payer is absent", [chargeRequest?.form.off_session, chargeRequest?.form.payment_method], ["true", method]),
      ]);
      const detached = await call(session, "DetachPaymentMethod", "DetachPaymentMethod", [method, fresh("key"), null]);
      const after = await call(session, "ListPaymentMethods after the detach", "ListPaymentMethods", [customerId, null]);
      context.expect(after.folder, [answered(detached), same("the customer has no saved card left", after.value, []), same("Stripe holds the card as detached", pick(session.stripe.object(API_KEY, method), "customer") ?? null, null)]);
      const sentBefore = requestsTo(session, "POST", "/v1/payment_intents").length;
      const noCustomer = await pay(session, "CreatePayment saving a card without a customer", "pm_card_visa", { request: { savePaymentMethod: true } });
      const absent = await pay(session, "CreatePayment saving a card off-session", "pm_card_visa", { request: { customer: customerId, savePaymentMethod: true, offSession: true } });
      context.expect(absent.folder, [
        same("saving a card with no customer is a PaymentError", pick(thrown(noCustomer), 0), "PaymentError"),
        same("saving a card off-session is a PaymentError", pick(thrown(absent), 0), "PaymentError"),
        same("Stripe was not called for either", requestsTo(session, "POST", "/v1/payment_intents").length, sentBefore),
      ]);
      const unknown = await call(session, "ListPaymentMethods of an unknown customer", "ListPaymentMethods", ["cus_doesnotexist", null]);
      context.expect(unknown.folder, [same("an unknown customer is a CustomerNotFoundError", pick(thrown(unknown), 0), "CustomerNotFoundError")]);
    });
  },
};

export const customerJourneys = { "customer-lifecycle": customerLifecycle, "saved-card": savedCard };
