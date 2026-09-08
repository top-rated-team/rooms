/**
 * The operator record a fork writes on /setup, and the cabinet at /partner
 * edits afterwards. shared/catalogue.ts is the shape the resolver reads;
 * this file is everything around it that the page and the server share:
 * who we are as a host, which of our rows a partner may re-brand, and the
 * public view of a saved config — which never includes a model key.
 *
 * Prices the operator writes on the ladder stay in the browser. They are
 * not a field here, and a body that sends them is ignored rather than stored.
 */

import { resolveCatalogue, type OperatorConfig, type OperatorIdentity, type OperatorService, type ServiceMode } from "./catalogue";
import { DOORS, type DoorDef } from "./doors";
import { PRICES, type PriceTierId } from "./pricing";

export type { OperatorConfig, OperatorIdentity, OperatorService, ServiceMode };

/** Hosts that are this company, not a fork. A white-label site on one of these is still ours. */
export const HOUSE_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "ai.top-rated.team",
  "top-rated.team",
  "www.top-rated.team",
] as const;

/**
 * The ladder rungs an operator may reword. `partner` is not a row — this site
 * publishes no figure for work another company sells — so it is not on the
 * form either.
 */
export const OPERATOR_LADDER_IDS: readonly PriceTierId[] = PRICES.map((row) => row.id);

export interface OperatorDoorOption {
  id: string;
  headline: string;
  /**
   * False when a room that named the operator for this work would be naming
   * someone who is not answerable for it. The form still lists the row so it
   * can be offered as referral or switched off; white-label is refused.
   */
  canWhiteLabel: boolean;
}

export interface OperatorModelPublic {
  /** True when answers should use the key the operator pasted, not the one on the host. */
  useOwnKey: boolean;
  /** True when a key is stored. The key itself is never in this object. */
  hasKey: boolean;
}

/** What GET /api/operator returns, and what the page may render. */
export interface OperatorPublic {
  configured: boolean;
  identity: OperatorIdentity | null;
  services: Record<string, OperatorService>;
  /** Address this deployment answers on, as a URL. Empty before the first save. */
  origin: string;
  model: OperatorModelPublic;
  doors: OperatorDoorOption[];
}

/** What PUT /api/operator accepts. `apiKey` is write-only. */
export interface OperatorWrite {
  identity: OperatorIdentity;
  services?: Record<string, OperatorService>;
  origin: string;
  model: {
    useOwnKey: boolean;
    /** Present only when the operator is pasting or replacing a key. Never read back. */
    apiKey?: string;
  };
}

export class OperatorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorInputError";
  }
}

export function houseLegalName(doors: readonly DoorDef[] = DOORS): string {
  const ours = doors.find((door) => door.tier === "white") ?? doors.find((door) => door.tier !== "grey");
  return ours?.contract.legalName ?? "";
}

export function operatorDoors(doors: readonly DoorDef[] = DOORS): OperatorDoorOption[] {
  const house = houseLegalName(doors);
  return doors
    .filter((door) => house !== "" && door.contract.legalName === house)
    .map((door) => ({
      id: door.id,
      headline: door.headline,
      canWhiteLabel: door.tier === "white",
    }));
}

export function defaultServices(doors: readonly DoorDef[] = DOORS): Record<string, OperatorService> {
  const services: Record<string, OperatorService> = {};
  for (const door of operatorDoors(doors)) {
    services[door.id] = { mode: "named", offered: true };
  }
  return services;
}

export function hostnameOf(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname;
  } catch {
    return trimmed.replace(/:\d+$/, "").split("/")[0] ?? "";
  }
}

/** True of this company's own hosts, including any subdomain of top-rated.team. */
export function isHouseHost(hostOrUrl: string): boolean {
  const host = hostnameOf(hostOrUrl);
  if (!host) return false;
  if ((HOUSE_HOSTS as readonly string[]).includes(host)) return true;
  return host.endsWith(".top-rated.team");
}

export function asOperatorConfig(write: OperatorWrite): OperatorConfig {
  return {
    identity: write.identity,
    services: write.services,
  };
}

function optionalAddress(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new OperatorInputError(`${field} has to be text, or empty.`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requiredName(value: unknown, field: string, emptyMessage: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OperatorInputError(emptyMessage);
  }
  return value.trim();
}

function originUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OperatorInputError(
      "Add the address this deployment answers on, as a full URL. A white-label site belongs on your own domain, not on a top-rated.team address.",
    );
  }
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("not http");
    }
    return url.origin;
  } catch {
    throw new OperatorInputError(
      `“${trimmed}” is not a URL this page can use. Write it as https://your-domain, including the scheme.`,
    );
  }
}

function parseMode(value: unknown, doorId: string): ServiceMode {
  if (value === "named" || value === "white-label") return value;
  throw new OperatorInputError(
    `“${doorId}” has to be offered as referral (named) or white label, not as ${String(value)}.`,
  );
}

function parseServices(value: unknown, doors: readonly DoorDef[]): Record<string, OperatorService> {
  const allowed = new Set(operatorDoors(doors).map((door) => door.id));
  const services = defaultServices(doors);
  if (value == null) return services;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new OperatorInputError("Services have to be a map of door id to offered and mode.");
  }
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(id)) continue;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new OperatorInputError(`The row for “${id}” has to say whether it is offered and how.`);
    }
    const row = entry as { mode?: unknown; offered?: unknown };
    services[id] = {
      mode: parseMode(row.mode, id),
      offered: row.offered !== false,
    };
  }
  return services;
}

function parseIdentity(value: unknown): OperatorIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperatorInputError("Say who you are: display name, legal name, entity, terms URL and contact address.");
  }
  const raw = value as Record<string, unknown>;
  const legalName = requiredName(
    raw.legalName,
    "legalName",
    "Add the registered name of the company that will appear on the contract and the invoice, including the legal form. Without it this page cannot say who a client is buying from.",
  );
  const displayName = requiredName(
    raw.displayName,
    "displayName",
    "Add the trading name that chrome and body copy should use. It can match the registered name.",
  );
  const entity = requiredName(
    raw.entity,
    "entity",
    "Add what kind of body that company is, in a client's words — where it is registered, and what it trades as.",
  );
  return {
    displayName,
    legalName,
    entity,
    termsUrl: optionalAddress(raw.termsUrl, "Terms URL"),
    contact: optionalAddress(raw.contact, "Contact address"),
    ...(typeof raw.contactLabel === "string" && raw.contactLabel.trim()
      ? { contactLabel: raw.contactLabel.trim() }
      : {}),
    ...(typeof raw.invoiceLine === "string" && raw.invoiceLine.trim()
      ? { invoiceLine: raw.invoiceLine.trim() }
      : {}),
  };
}

function parseModel(value: unknown): OperatorWrite["model"] {
  if (value == null) {
    return { useOwnKey: true };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new OperatorInputError("Say whether answers use your own model key or the key already on this deployment.");
  }
  const raw = value as Record<string, unknown>;
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : undefined;
  return {
    useOwnKey: raw.useOwnKey !== false,
    ...(apiKey !== undefined ? { apiKey } : {}),
  };
}

function hasWhiteLabel(services: Record<string, OperatorService>): boolean {
  return Object.values(services).some((service) => service.offered && service.mode === "white-label");
}

/**
 * Parse a PUT body. Fields this page does not store — prices, a key the
 * caller did not mean to send in a log — are dropped rather than kept.
 */
export function parseOperatorWrite(body: unknown, doors: readonly DoorDef[] = DOORS): OperatorWrite {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new OperatorInputError("The body has to be the operator fields this page asks for.");
  }
  const raw = body as Record<string, unknown>;
  const identity = parseIdentity(raw.identity);
  const services = parseServices(raw.services, doors);
  const origin = originUrl(raw.origin);
  const model = parseModel(raw.model);

  if (hasWhiteLabel(services) && isHouseHost(origin)) {
    throw new OperatorInputError(
      "A white-label site on a top-rated.team address would still be ours. Set the address this deployment answers on to your own domain, or offer those rows as referral so our name stays on them.",
    );
  }

  const write: OperatorWrite = { identity, services, origin, model };
  assertOperatorWillNotLie(write, doors);
  return write;
}

/**
 * The rule every other sentence on this site follows: a room that names the
 * operator as answerable has to be naming someone who is. The catalogue
 * resolver is the check; this wraps it so a missing legal name is always
 * rejected, not only when a row is white-label.
 */
export function assertOperatorWillNotLie(write: OperatorWrite, doors: readonly DoorDef[] = DOORS): void {
  if (!write.identity.legalName.trim()) {
    throw new OperatorInputError(
      "Add the registered name of the company that will appear on the contract and the invoice, including the legal form. Without it this page cannot say who a client is buying from.",
    );
  }
  try {
    resolveCatalogue(doors, asOperatorConfig(write));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OperatorInputError(message);
  }
}

const KEYISH = /sk-[a-zA-Z0-9_\-]{8,}/g;

/** Strip model keys from text that might go in a response body or an error. */
export function redactSecrets(text: string, extra: readonly string[] = []): string {
  let redacted = text.replace(KEYISH, "[redacted]");
  for (const secret of extra) {
    const trimmed = secret.trim();
    if (trimmed.length < 4) continue;
    redacted = redacted.split(trimmed).join("[redacted]");
  }
  return redacted;
}

export function publicOperator(
  stored: {
    identity: OperatorIdentity;
    services: Record<string, OperatorService>;
    origin: string;
    model: { useOwnKey: boolean };
    hasKey: boolean;
  } | null,
  doors: readonly DoorDef[] = DOORS,
): OperatorPublic {
  return {
    configured: stored !== null,
    identity: stored?.identity ?? null,
    services: stored?.services ?? defaultServices(doors),
    origin: stored?.origin ?? "",
    model: {
      useOwnKey: stored?.model.useOwnKey ?? true,
      hasKey: stored?.hasKey ?? false,
    },
    doors: operatorDoors(doors),
  };
}
