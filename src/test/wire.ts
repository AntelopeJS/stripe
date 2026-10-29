/** A value as the Stripe API writes it in a JSON body; `undefined` fields are dropped on the way. */
export type WireValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | WireValue[]
  | WireObject;

/** A JSON object in a Stripe API body. */
export interface WireObject {
  [field: string]: WireValue;
}
