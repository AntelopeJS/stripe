import Stripe from "stripe";
import { PaymentError } from "@antelopejs/interface-payment";

export interface Account {
  client: Stripe;
  webhookSecret: string;
}

const accounts = new Map<string, Account>();
const DEFAULT_ACCOUNT = "";

export function RegisterAccount(
  name: string | undefined,
  client: Stripe,
  webhookSecret: string,
): void {
  accounts.set(name ?? DEFAULT_ACCOUNT, { client, webhookSecret });
}

export function ClearAccounts(): void {
  accounts.clear();
}

/**
 * Resolves the configured account a call should use.
 *
 * @param provider - Account name from the interface's trailing selector
 * @throws Error if the module was not configured with that account
 */
export function GetAccount(provider?: string): Account {
  const account = accounts.get(provider ?? DEFAULT_ACCOUNT);
  if (!account) {
    throw new PaymentError(
      provider
        ? `No Stripe account configured under "${provider}"`
        : "The Stripe module has no default account configured",
    );
  }
  return account;
}
