/**
 * Who a letter from this deployment appears to be from.
 *
 * LEAD_EMAIL_FROM is an ADDRESS. Every mail client that is handed a bare
 * address shows the local part as the sender's name — so a letter from
 * contact@top-rated.team arrived looking as though it came from somebody
 * called "contact", which is the one thing a first email from a company
 * should not say. The address is unchanged; only the name in front of it is
 * added.
 *
 * The name is read from the door that pays for this site rather than typed
 * here, so it cannot drift from the footer, the legal pages and the invoices,
 * which all name the business the same way.
 *
 * An operator who wants a different name puts the whole RFC 5322 form in the
 * variable — `Acme <hello@acme.example>` — and this leaves it alone. That is
 * also the escape hatch for a fork: the name belongs to whoever runs the
 * deployment, not to us.
 */

import { DEFAULT_DOOR_ID, DOOR_BY_ID } from "@shared/doors";

/** True when the value already carries a display name, in any of its forms. */
export function hasDisplayName(value: string): boolean {
  return value.includes("<") && value.includes(">");
}

/**
 * The From header, or null when no address is configured.
 *
 * A name containing a comma, a quote or a colon has to be quoted or the
 * header parses as two addresses. Ours does not contain one today; the
 * escaping is here because the day it does is not the day to find out.
 */
export function mailFrom(raw = process.env.LEAD_EMAIL_FROM): string | null {
  const address = raw?.trim();
  if (!address) return null;
  if (hasDisplayName(address)) return address;

  const contract = DOOR_BY_ID[DEFAULT_DOOR_ID].contract;
  const name = (contract.displayName ?? contract.legalName).trim();
  if (!name) return address;

  const needsQuoting = /[",:;<>@\[\]\\]/.test(name);
  const display = needsQuoting ? `"${name.replace(/([\\"])/g, "\\$1")}"` : name;
  return `${display} <${address}>`;
}
