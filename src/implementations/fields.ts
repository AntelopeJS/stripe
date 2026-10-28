function isKeyOf<T extends object>(table: T, key: PropertyKey): key is keyof T {
  return key in table;
}

/**
 * Reads `table[key]` the way plain indexing does, inherited keys included, and
 * returns `undefined` for a key the table does not have.
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
export function IsStripeId<T>(field: string | T): field is string {
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
