/** A webhook delivery one instance verified, relayed raw so that every other instance verifies it again before it trusts the event. */
interface SignedRelay {
  messageId: string;
  payload: string;
  signature: string;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isSignedRelay(value: unknown): value is SignedRelay {
  return (
    typeof value === "object" &&
    value !== null &&
    "messageId" in value &&
    isText(value.messageId) &&
    "payload" in value &&
    isText(value.payload) &&
    "signature" in value &&
    isText(value.signature)
  );
}

/** The message that relays a verified delivery: the body Stripe signed and its `stripe-signature` header. */
export function RelayMessage(
  messageId: string,
  body: Buffer,
  signature: string,
): string {
  const relay: SignedRelay = {
    messageId,
    payload: body.toString("utf8"),
    signature,
  };
  return JSON.stringify(relay);
}

/** The relayed delivery a message carries. Any client of the shared Redis can publish, so anything else is refused. */
export function ReadRelay(message: string): SignedRelay {
  const parsed: unknown = JSON.parse(message);
  if (!isSignedRelay(parsed)) {
    throw new Error("the message is not a relayed webhook delivery");
  }
  return parsed;
}
