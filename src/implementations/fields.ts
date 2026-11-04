function isKeyOf<T extends object>(table: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(table, key);
}

/**
 * Reads `table[key]` for an own key of the table, and returns `undefined` for
 * any other key, inherited `Object.prototype` members included.
 */
export function Lookup<T extends object>(
  table: T,
  key: PropertyKey,
): T[keyof T] | undefined {
  return isKeyOf(table, key) ? table[key] : undefined;
}

/**
 * Whether an expandable Stripe field holds the bare identifier rather than the
 * expanded object.
 */
export function IsStripeId(
  field: string | { id?: string } | null | undefined,
): field is string {
  return typeof field === "string";
}

/**
 * The expanded object of an expandable Stripe field, or `undefined` when the
 * field holds only an identifier or nothing.
 */
export function Expanded<T extends object>(
  field: string | T | null,
): T | undefined {
  return field && !IsStripeId(field) ? field : undefined;
}
