import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A receipt proving that a piece of text is an answer THIS server produced.
 *
 * WHY IT EXISTS. When a visitor asks something on a door page and then keeps
 * the conversation, the room should show the exchange they already had rather
 * than send the question back to the model — otherwise they read one answer on
 * the page and a different one in the room, and we pay twice for the privilege.
 *
 * But carrying the answer means the browser hands the text back, and a browser
 * is not a trustworthy narrator. Without a receipt, anyone could POST
 * /api/workspaces with an "agent" message of their choosing, get a real room at
 * a real address on this domain, and share it as evidence that we promised
 * something. An agent message in a room reads as the company speaking. That is
 * a forgery vector, not a rough edge, so the text is signed on the way out and
 * verified on the way back in.
 *
 * THE KEY IS PER PROCESS, and deliberately not an environment variable. The
 * only window that matters is between reading an answer and pressing Keep —
 * seconds. A restart invalidates outstanding receipts, and the consequence is
 * the exact behaviour we had before this file: the room asks the agent again.
 * Degrading into the old path costs a model call and nothing else, which is a
 * far better trade than one more secret to set on a deployment and to leak.
 */
const KEY = randomBytes(32);

/** Long enough that guessing is hopeless, short enough to sit in a JSON event. */
const RECEIPT_CHARS = 32;

export function signAnswer(text: string): string {
  return createHmac("sha256", KEY).update(text, "utf8").digest("hex").slice(0, RECEIPT_CHARS);
}

/**
 * Constant-time, and false for anything malformed rather than throwing —
 * a bad receipt is an ordinary thing to receive, not an exception.
 */
export function verifyAnswer(text: string, receipt: unknown): boolean {
  if (typeof receipt !== "string" || receipt.length !== RECEIPT_CHARS) return false;
  const expected = Buffer.from(signAnswer(text), "utf8");
  const given = Buffer.from(receipt, "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
