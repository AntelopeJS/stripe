import { RegisterHandler, UnregisterHandler } from "./events";

export * from "./subscriptions";

export const SubscriptionEvents = {
  register: RegisterHandler,
  unregister: UnregisterHandler,
};
