/**
 * The catalogue as an operator's deployment shows it.
 *
 * shared/doors.ts is every offer, each carrying the contract the room will
 * print. That file has no notion of an operator other than us, so a fork of
 * this site would still name Top-Rated Team on every row. This module is the
 * missing step: given those rows and an operator config, return the same
 * offers as that operator's site should show them.
 *
 * Two modes per service, not per deployment — a partner may want their Google
 * Ads white-labelled and our Ad Grants tool named. private/fork-and-partners.md
 * is the brief; the money section is the constraint: the fork is free and
 * reports nothing back. There is no usage count, no deployment id and no
 * endpoint here.
 *
 * Pages should not import DOORS when they mean "what this deployment shows".
 * They call `catalogue` from shared/doors.ts, which is this resolver bound to
 * the door table. With no operator that call is the table itself, unchanged,
 * which is what keeps ai.top-rated.team as it is.
 */

import type { DoorContract, DoorDef } from "./doors";

/** How one of our services appears in the operator's catalogue. */
export type ServiceMode = "named" | "white-label";

/**
 * Who the operator is, in the same six facts a door contract already carries.
 * A room that names them as answerable has to have a real name to print;
 * empty legal name is rejected at resolve time when any row is white-label.
 */
export interface OperatorIdentity {
  displayName: string;
  legalName: string;
  entity: string;
  termsUrl: string | null;
  contact: string | null;
  contactLabel?: string;
  /**
   * Who invoices, in one sentence. Optional: when omitted, it is derived from
   * legalName the same way our own doors derive theirs, so a setup form that
   * asks for the registered name does not also have to ask for the sentence.
   */
  invoiceLine?: string;
}

/** One service in the operator's catalogue. Missing from the map is not a deletion. */
export interface OperatorService {
  mode: ServiceMode;
  /**
   * False means the row stays in the catalogue with this flag, so switching it
   * back on later is the same flag. Never omit the row to hide it.
   */
  offered: boolean;
}

/**
 * What a fork fills in on /setup. This parcel owns the shape the resolver
 * reads; the page that writes it is a later parcel. Nothing here identifies a
 * deployment to us, because nothing here is reported to us.
 */
export interface OperatorConfig {
  identity: OperatorIdentity;
  /**
   * Per door id. A door that is ours and is not in the map is offered as
   * named — our name stays on it rather than disappearing into their brand by
   * omission. A door that is already somebody else's is left as it is.
   */
  services?: Record<string, OperatorService>;
}

/** A door row as a configured operator's catalogue carries it. */
export type CatalogueDoor = DoorDef & { offered: boolean };

/**
 * Resolve the door table for an operator.
 *
 * `operator` absent, null or undefined returns `doors` itself — the same
 * array, the same row objects — so this function cannot change what the
 * reference deployment shows. Anything else is a fork, and every row comes
 * back with `offered` set.
 */
export function resolveCatalogue(doors: readonly DoorDef[], operator?: OperatorConfig | null): DoorDef[] | CatalogueDoor[] {
  if (operator == null) return doors as DoorDef[];

  const houseName = houseLegalName(doors);
  const services = operator.services ?? {};

  for (const door of doors) {
    const service = services[door.id];
    const mode = modeFor(door, service, houseName);
    if (mode === "white-label") {
      assertOperatorCanBeAnswerable(door, operator.identity, houseName);
    }
  }

  return doors.map((door) => {
    const service = services[door.id];
    const offered = service?.offered ?? true;
    const mode = modeFor(door, service, houseName);
    return applyMode(door, mode, offered, operator.identity, houseName);
  });
}

function houseLegalName(doors: readonly DoorDef[]): string | null {
  const ours = doors.find((door) => door.tier === "white") ?? doors.find((door) => door.tier !== "grey");
  return ours?.contract.legalName ?? null;
}

function isOurs(door: DoorDef, houseName: string | null): boolean {
  return houseName !== null && door.contract.legalName === houseName;
}

function modeFor(door: DoorDef, service: OperatorService | undefined, houseName: string | null): ServiceMode | "unchanged" {
  if (service) return service.mode;
  return isOurs(door, houseName) ? "named" : "unchanged";
}

function assertOperatorCanBeAnswerable(door: DoorDef, identity: OperatorIdentity | undefined, houseName: string | null): void {
  const legalName = identity?.legalName?.trim() ?? "";
  if (!legalName) {
    throw new Error(
      `White-label mode would print this operator as the company answerable for "${door.headline}", and the config has no legal name to print. Add the operator's registered name, or offer the row as named so ours stays on it.`,
    );
  }

  if (door.tier !== "white" || !isOurs(door, houseName)) {
    throw new Error(
      `White-label mode would print ${legalName} as answerable for "${door.headline}", which is contracted by ${door.contract.legalName}. A room that names the operator for that work would be naming someone who is not. Offer the row as named, or switch it off.`,
    );
  }
}

function applyMode(
  door: DoorDef,
  mode: ServiceMode | "unchanged",
  offered: boolean,
  identity: OperatorIdentity,
  houseName: string | null,
): CatalogueDoor {
  if (mode === "unchanged") {
    return { ...cloneDoor(door), offered };
  }

  if (mode === "named") {
    // Today's grey tier with the names swapped: the partner's client still
    // reads our legal name, terms, invoice line and contact, and this site
    // publishes no figure for the row — priceForDoor already returns null
    // for the partner price tier, and that is the guarantee we reuse.
    return {
      ...cloneDoor(door),
      tier: "grey",
      priceTier: "partner",
      offered,
    };
  }

  const contract = contractFrom(identity);
  const relabelled = houseName ? replaceInValue(cloneDoor(door), houseName, contract.legalName) : cloneDoor(door);
  return {
    ...relabelled,
    contract,
    tier: "white",
    offered,
  };
}

function contractFrom(identity: OperatorIdentity): DoorContract {
  const legalName = identity.legalName.trim();
  const displayName = identity.displayName.trim() || legalName;
  const invoiceLine =
    identity.invoiceLine?.trim() || `${legalName} signs the contract and sends the invoice.`;
  const contactLabel = identity.contactLabel?.trim() || (displayName ? `Write to ${displayName}` : undefined);
  return {
    legalName,
    displayName,
    entity: identity.entity.trim(),
    termsUrl: identity.termsUrl,
    invoiceLine,
    contact: identity.contact,
    ...(contactLabel ? { contactLabel } : {}),
  };
}

function cloneDoor(door: DoorDef): DoorDef {
  return {
    ...door,
    starters: [...door.starters],
    contract: { ...door.contract },
    ...(door.tool ? { tool: { ...door.tool } } : {}),
  };
}

/**
 * Walk the row so a white-label resolve cannot leave our legal name in a
 * field the author of this file did not remember to list. The test searches
 * the whole structure the same way.
 */
function replaceInValue<T>(value: T, find: string, replacement: string): T {
  if (find === replacement) return value;
  if (typeof value === "string") {
    return (value.includes(find) ? value.split(find).join(replacement) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceInValue(entry, find, replacement)) as T;
  }
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = replaceInValue(entry, find, replacement);
    }
    return copy as T;
  }
  return value;
}
