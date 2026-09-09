/**
 * Unipile's RFC 7807 error envelope, mapped to a union keyed on `type`.
 *
 * The operational values are the ones in docs/specs/unipile-rooms-and-booking.md
 * §1.2. `detail` is dropped on purpose: Unipile's own string can name our
 * account, and a visitor must never see it. Callers that need a sentence for
 * the screen use `visitorLine`, which is ours.
 */

export const UNIPILE_ERROR_TYPES = [
  "errors/disconnected_account",
  "errors/expired_credentials",
  "errors/insufficient_privileges",
  "errors/account_restricted",
  "errors/resource_not_found",
  "errors/too_many_requests",
  "errors/no_client_session",
  "errors/network_down",
  "errors/service_unavailable",
  "errors/request_timeout",
] as const;

export type UnipileErrorType = (typeof UNIPILE_ERROR_TYPES)[number];

export type UnipileErrorKind = UnipileErrorType | "unknown";

/**
 * `status` is the status Unipile ACTUALLY returned, not the canonical one for
 * the type.
 *
 * This union used to pin a status per type, and the pinning was wrong: the
 * same `type` appears under more than one status. Unipile's own calendar page
 * lists `errors/insufficient_privileges` under 401 and then shows it in a 403
 * example body. A mapper that rewrites 403 to 401 sends an operator to
 * re-pair a device when the truth is a missing subscription, so the observed
 * status is kept and the type is what a caller branches on.
 */
export interface UnipileError {
  type: UnipileErrorKind;
  status: number;
}

/**
 * The three that mean a person has to go and fix something in a dashboard.
 * Keyed on type rather than on status for the reason above — the scope trap
 * arrives as either 401 or 403, and it needs the same alert either way.
 */
export const OPERATOR_ALERT_TYPES = new Set<UnipileErrorKind>([
  "errors/disconnected_account",
  "errors/expired_credentials",
  "errors/insufficient_privileges",
]);

const KNOWN = new Set<string>(UNIPILE_ERROR_TYPES);

const VISITOR_UNREACHABLE = "Unipile could not be reached.";
const VISITOR_UNAVAILABLE = "This service is not available right now.";
const VISITOR_NOT_CONNECTED = "That account is not connected.";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function typeFromStatus(status: number): UnipileError {
  if (status === 404) return { type: "errors/resource_not_found", status: 404 };
  if (status === 429) return { type: "errors/too_many_requests", status: 429 };
  if (status === 503) return { type: "errors/service_unavailable", status: 503 };
  if (status === 504) return { type: "errors/request_timeout", status: 504 };
  if (status === 403) return { type: "errors/account_restricted", status: 403 };
  return { type: "unknown", status };
}

/**
 * Reads a Unipile error body. Unknown or missing `type` values become
 * `unknown` rather than being guessed into an operational case. `detail`,
 * `title` and `instance` are not kept.
 */
export function parseUnipileError(status: number, body: unknown): UnipileError {
  const record = asRecord(body);
  const rawType = record && typeof record.type === "string" ? record.type : null;
  if (rawType && KNOWN.has(rawType)) {
    return { type: rawType as UnipileErrorType, status };
  }
  return typeFromStatus(status);
}

/**
 * One sentence a visitor can read. It is ours, never Unipile's `detail`.
 */
export function visitorLine(error: UnipileError): string {
  switch (error.type) {
    case "errors/resource_not_found":
      return VISITOR_NOT_CONNECTED;
    case "errors/no_client_session":
    case "errors/network_down":
    case "errors/service_unavailable":
    case "errors/request_timeout":
    case "errors/too_many_requests":
      return VISITOR_UNREACHABLE;
    default:
      return VISITOR_UNAVAILABLE;
  }
}
