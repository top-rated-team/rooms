/**
 * Time zones for the email booking block: turning the calendar's wall-clock
 * times into the reader's, and naming a zone so a person can read it.
 *
 * Nothing in an email address says where its owner is. The one hint is a
 * country's own domain (.de, .cz, .in), and only for a country that keeps one
 * clock; everywhere else — gmail.com, a .com, the United States — the widget
 * page asks the owner. `guessZoneFromAddress` is that hint and nothing more.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function isTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(zone: string, ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  let format = partsFormatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(zone, format);
  }
  const out: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(ms))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { y: out.year!, mo: out.month!, d: out.day!, h: out.hour! % 24, mi: out.minute!, s: out.second! };
}

/** Minutes east of UTC in `zone` at the instant `ms`: +120 for Bratislava in summer. */
export function zoneOffsetMinutes(zone: string, ms: number): number {
  const p = partsIn(zone, ms);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** The instant a wall-clock date and time in `zone` names, or null for a malformed one. */
export function wallClockToInstant(date: string, time: string, zone: string): number | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const first = guess - zoneOffsetMinutes(zone, guess) * 60_000;
  const second = guess - zoneOffsetMinutes(zone, first) * 60_000;
  return second;
}

/** The wall-clock date ("2026-10-02") and time ("09:30") in `zone` at `ms`. */
export function wallClockIn(zone: string, ms: number): { date: string; time: string } {
  const p = partsIn(zone, ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** "GMT+2", "GMT-4", "GMT+5:30", "GMT+0". */
export function offsetLabel(zone: string, ms: number): string {
  const minutes = zoneOffsetMinutes(zone, ms);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/*
 * WHAT A CLOCK IS CALLED WHERE IT IS KEPT: EDT in New York, BST in London,
 * CEST in Prague, IST in India, AEST in Sydney. Intl knows each one only in
 * its own country's English (en-US says GMT+1 for London), so each is tried;
 * a few clocks Intl names in no English at all are written here. GMT±n is
 * the last resort, for a clock with no name of its own.
 */
const ABBREVIATION_LOCALES = ["en-US", "en-CA", "en-GB", "en-IE", "en-IN", "en-AU", "en-NZ", "en-ZA", "en-SG"];
/* Clocks that never change, so one name is always right. */
const FIXED_ABBREVIATIONS: Record<string, string> = {
  "Asia/Tokyo": "JST",
  "Asia/Seoul": "KST",
  "Asia/Shanghai": "CST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Taipei": "CST",
  "Asia/Manila": "PHT",
  "Asia/Jakarta": "WIB",
  "Asia/Bangkok": "ICT",
  "Asia/Ho_Chi_Minh": "ICT",
  "Asia/Saigon": "ICT",
  "Asia/Karachi": "PKT",
  "Asia/Kathmandu": "NPT",
  "Asia/Katmandu": "NPT",
  "Asia/Dhaka": "BST",
  "Europe/Moscow": "MSK",
  "Europe/Istanbul": "TRT",
  "Asia/Riyadh": "AST",
  "America/Sao_Paulo": "BRT",
  "America/Argentina/Buenos_Aires": "ART",
  "America/Buenos_Aires": "ART",
  "America/Bogota": "COT",
  "America/Lima": "PET",
  "America/Caracas": "VET",
};

const abbreviationFormatters = new Map<string, Intl.DateTimeFormat>();

export function zoneAbbreviation(zone: string, ms: number): string {
  if (isUtc(zone)) return "UTC";
  for (const locale of ABBREVIATION_LOCALES) {
    const key = `${locale}|${zone}`;
    let format = abbreviationFormatters.get(key);
    try {
      if (!format) {
        format = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" });
        abbreviationFormatters.set(key, format);
      }
      const name = format.formatToParts(new Date(ms)).find((part) => part.type === "timeZoneName")?.value ?? "";
      if (/^[A-Z]{2,5}$/.test(name)) return name;
    } catch {
      break;
    }
  }
  return FIXED_ABBREVIATIONS[zone] ?? offsetLabel(zone, ms);
}

function isUtc(zone: string): boolean {
  return /^(Etc\/)?(UTC|UCT|GMT|Zulu|Universal|Greenwich)$/i.test(zone);
}

/* Browsers and Node still list some zones under their old names. */
const CITY_NAMES: Record<string, string> = {
  Calcutta: "Kolkata",
  Kiev: "Kyiv",
  Katmandu: "Kathmandu",
  Rangoon: "Yangon",
  Saigon: "Ho Chi Minh City",
  Ho_Chi_Minh: "Ho Chi Minh City",
  Godthab: "Nuuk",
  St_Johns: "St John's",
  Buenos_Aires: "Buenos Aires",
};

/** "America/New_York" → "New York"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone: string): string {
  if (isUtc(zone)) return "UTC";
  const last = zone.split("/").pop() ?? zone;
  return CITY_NAMES[last] ?? last.replace(/_/g, " ");
}

/** "Eastern Time", "Central European Time", or null where Intl has no name, only an offset. */
function genericName(zone: string, ms: number): string | null {
  try {
    const name = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "longGeneric" })
      .formatToParts(new Date(ms))
      .find((part) => part.type === "timeZoneName")?.value;
    return name && !/^(GMT|UTC)/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * The zone as a person reads it: "Eastern Time (New York, EDT)". Without
 * `ms`, no offset — for a block whose times span a change of clocks, where
 * each day says its own.
 */
export function zonePhrase(zone: string, ms?: number): string {
  if (isUtc(zone)) return "UTC";
  const city = zoneCity(zone);
  const name = genericName(zone, ms ?? Date.now());
  if (ms == null) return name ? `${name} (${city})` : `${city} time`;
  const short = zoneAbbreviation(zone, ms);
  return name ? `${name} (${city}, ${short})` : `${city} time (${short})`;
}

/*
 * Country domains of countries that keep one clock, with that clock. A
 * country with several (.us, .ca, .au, .ru, .br, .mx, .id, .kz) is left out
 * rather than guessed, and so is a country domain mostly bought for its
 * letters (.co, .io, .me, .ai, .tv, .ly).
 */
const ZONE_BY_COUNTRY_DOMAIN: Record<string, string> = {
  sk: "Europe/Bratislava",
  cz: "Europe/Prague",
  pl: "Europe/Warsaw",
  de: "Europe/Berlin",
  at: "Europe/Vienna",
  ch: "Europe/Zurich",
  li: "Europe/Vaduz",
  hu: "Europe/Budapest",
  si: "Europe/Ljubljana",
  hr: "Europe/Zagreb",
  rs: "Europe/Belgrade",
  ba: "Europe/Sarajevo",
  mk: "Europe/Skopje",
  al: "Europe/Tirane",
  ro: "Europe/Bucharest",
  bg: "Europe/Sofia",
  gr: "Europe/Athens",
  cy: "Asia/Nicosia",
  tr: "Europe/Istanbul",
  ua: "Europe/Kyiv",
  by: "Europe/Minsk",
  md: "Europe/Chisinau",
  lt: "Europe/Vilnius",
  lv: "Europe/Riga",
  ee: "Europe/Tallinn",
  fi: "Europe/Helsinki",
  se: "Europe/Stockholm",
  no: "Europe/Oslo",
  dk: "Europe/Copenhagen",
  is: "Atlantic/Reykjavik",
  ie: "Europe/Dublin",
  uk: "Europe/London",
  nl: "Europe/Amsterdam",
  be: "Europe/Brussels",
  lu: "Europe/Luxembourg",
  fr: "Europe/Paris",
  es: "Europe/Madrid",
  pt: "Europe/Lisbon",
  it: "Europe/Rome",
  mt: "Europe/Malta",
  il: "Asia/Jerusalem",
  ae: "Asia/Dubai",
  sa: "Asia/Riyadh",
  qa: "Asia/Qatar",
  in: "Asia/Kolkata",
  pk: "Asia/Karachi",
  bd: "Asia/Dhaka",
  lk: "Asia/Colombo",
  np: "Asia/Kathmandu",
  th: "Asia/Bangkok",
  vn: "Asia/Ho_Chi_Minh",
  sg: "Asia/Singapore",
  my: "Asia/Kuala_Lumpur",
  ph: "Asia/Manila",
  hk: "Asia/Hong_Kong",
  tw: "Asia/Taipei",
  cn: "Asia/Shanghai",
  jp: "Asia/Tokyo",
  kr: "Asia/Seoul",
  nz: "Pacific/Auckland",
  za: "Africa/Johannesburg",
  ng: "Africa/Lagos",
  ke: "Africa/Nairobi",
  eg: "Africa/Cairo",
  ma: "Africa/Casablanca",
  ge: "Asia/Tbilisi",
  am: "Asia/Yerevan",
  az: "Asia/Baku",
  ar: "America/Argentina/Buenos_Aires",
  cl: "America/Santiago",
  pe: "America/Lima",
  uy: "America/Montevideo",
  ve: "America/Caracas",
  ec: "America/Guayaquil",
};

/** The clock of the country whose domain the address is at, where that country keeps one. */
export function guessZoneFromAddress(address: string): { zone: string; domain: string } | null {
  const at = address.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return null;
  const tld = address.trim().toLowerCase().slice(at + 1).split(".").pop() ?? "";
  const zone = ZONE_BY_COUNTRY_DOMAIN[tld];
  return zone ? { zone, domain: `.${tld}` } : null;
}

/*
 * THE ZONE LIST A PERSON PICKS FROM. The IANA list names one clock many
 * times over — forty-odd American cities all on Eastern Time — and files
 * them under continents nobody looks a zone up by. Zones that keep the same
 * time all year (the same offset in January and in July) are one entry
 * here, named for the clock as it is called where it is kept and for its
 * best-known cities, in clock order, the clocks most calls are on first.
 */

/* Best-known first; the first of a group present is the one a pick stores. */
const WELL_KNOWN = [
  "Pacific/Pago_Pago", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Vancouver",
  "America/Tijuana", "America/Phoenix", "America/Denver", "America/Edmonton", "America/Chicago", "America/Winnipeg",
  "America/Mexico_City", "America/Regina", "America/Guatemala", "America/New_York", "America/Toronto",
  "America/Bogota", "America/Lima", "America/Panama", "America/Caracas", "America/Halifax", "America/Puerto_Rico",
  "America/Santo_Domingo", "America/Santiago", "America/St_Johns", "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Montevideo", "America/Nuuk", "America/Godthab",
  "Atlantic/South_Georgia",
  "Atlantic/Azores", "Atlantic/Cape_Verde", "Europe/London", "Europe/Dublin", "Europe/Lisbon",
  "Atlantic/Reykjavik", "Africa/Abidjan", "Africa/Accra", "Europe/Prague", "Europe/Berlin", "Europe/Paris",
  "Europe/Madrid", "Europe/Rome", "Europe/Warsaw", "Europe/Vienna", "Europe/Amsterdam", "Africa/Casablanca",
  "Africa/Lagos", "Africa/Algiers", "Europe/Kyiv", "Europe/Kiev", "Europe/Athens", "Europe/Bucharest", "Europe/Helsinki",
  "Asia/Jerusalem", "Asia/Beirut", "Africa/Cairo", "Africa/Johannesburg", "Europe/Istanbul", "Europe/Moscow",
  "Asia/Riyadh", "Africa/Nairobi", "Asia/Baghdad", "Asia/Tehran", "Asia/Dubai", "Asia/Baku", "Asia/Tbilisi",
  "Asia/Yerevan", "Asia/Kabul", "Asia/Karachi", "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Kolkata",
  "Asia/Calcutta", "Asia/Colombo", "Asia/Kathmandu", "Asia/Katmandu", "Asia/Dhaka", "Asia/Almaty", "Asia/Yangon",
  "Asia/Rangoon", "Asia/Bangkok", "Asia/Jakarta", "Asia/Ho_Chi_Minh", "Asia/Saigon", "Asia/Singapore", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Manila",
  "Australia/Perth", "Asia/Tokyo", "Asia/Seoul", "Australia/Darwin", "Australia/Adelaide", "Australia/Brisbane",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Port_Moresby", "Asia/Vladivostok", "Pacific/Noumea",
  "Asia/Magadan", "Pacific/Auckland", "Pacific/Fiji", "Pacific/Tongatapu", "Pacific/Apia", "Pacific/Kiritimati",
];

/* The clocks most calls are on, listed first. An old spelling counts too. */
const COMMON = new Set([
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Phoenix", "America/Denver",
  "America/Chicago", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Prague", "Europe/Kyiv",
  "Europe/Kiev", "Europe/Istanbul", "Asia/Dubai", "Asia/Kolkata", "Asia/Calcutta", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
]);

export interface ZoneGroup {
  /** The zone a pick of this entry stores: the best-known one in it. */
  zone: string;
  /** "Central European Time (CEST) — Prague, Berlin, Paris". */
  label: string;
  /** One of the clocks most calls are on: listed first. */
  common: boolean;
  /** Minutes east of UTC now, for the order. */
  offset: number;
  members: string[];
  /** The January and July offsets the members share. */
  key: string;
}

function yearKey(zone: string, now: number): string {
  const year = new Date(now).getUTCFullYear();
  return `${zoneOffsetMinutes(zone, Date.UTC(year, 0, 15, 12))}/${zoneOffsetMinutes(zone, Date.UTC(year, 6, 15, 12))}`;
}

const rank = new Map(WELL_KNOWN.map((zone, index) => [zone, index]));

export function zoneGroups(zones: string[], now: number = Date.now()): ZoneGroup[] {
  const byKey = new Map<string, string[]>();
  for (const zone of new Set(zones)) {
    if (!isTimeZone(zone)) continue;
    const key = yearKey(zone, now);
    const members = byKey.get(key) ?? [];
    members.push(zone);
    byKey.set(key, members);
  }
  const groups: ZoneGroup[] = [];
  for (const members of byKey.values()) {
    const known = members.filter((zone) => rank.has(zone)).sort((a, b) => rank.get(a)! - rank.get(b)!);
    const rest = members.filter((zone) => !rank.has(zone)).sort();
    const zone = known[0] ?? (members.find(isUtc) || rest[0]!);
    const shown = (known.length > 0 ? known : [zone]).slice(0, 3);
    const cities = [...new Set(shown.map(zoneCity))];
    /* The clock's name only where every city shown goes by it: Istanbul,
       Moscow and Riyadh keep one time but not one name. */
    const names = new Set(shown.map((member) => (isUtc(member) ? "UTC" : genericName(member, now))));
    const name = names.size === 1 ? [...names][0] : null;
    const short = zoneAbbreviation(zone, now);
    /* One clock, several names: each city with its own (Moscow is MSK, not TRT). */
    const shorts = shown.map((member) => zoneAbbreviation(member, now));
    const label =
      name === "UTC" || isUtc(zone)
        ? "UTC"
        : name
          ? `${name} (${short}) — ${cities.join(", ")}`
          : new Set(shorts).size === 1
            ? `${cities.join(", ")} (${short})`
            : shown.map((member, index) => `${zoneCity(member)} (${shorts[index]})`).join(", ");
    groups.push({
      zone,
      label,
      common: members.some((member) => COMMON.has(member)),
      offset: zoneOffsetMinutes(zone, now),
      members: members.sort(),
      key: yearKey(zone, now),
    });
  }
  return groups.sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));
}

/**
 * The entry a zone belongs to — by its clock, not its name, so a zone the
 * list spells differently (America/Indiana/Indianapolis) or does not list
 * still shows as picked.
 */
export function zoneGroupFor(zone: string, groups: ZoneGroup[], now: number = Date.now()): ZoneGroup | undefined {
  if (!isTimeZone(zone)) return undefined;
  const key = yearKey(zone, now);
  return groups.find((group) => group.members.includes(zone)) ?? groups.find((group) => group.key === key);
}

/* Mail services, not companies: their domain says nothing about the person. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
  "gmx.com", "gmx.net", "mail.com", "zoho.com", "fastmail.com", "hey.com", "yandex.com", "yandex.ru", "mail.ru",
  "qq.com", "163.com", "126.com", "tutanota.com", "duck.com", "comcast.net", "att.net", "verizon.net",
  "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
]);

export function isFreeMailDomain(domain: string): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  return FREE_MAIL.has(host) || /^(yahoo|hotmail|outlook|live)\.[a-z.]+$/.test(host);
}
