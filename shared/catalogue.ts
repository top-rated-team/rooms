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

import { ADGRANT_ORIGIN, adgrantMountFor } from "./adgrant-site";
import type { DoorContract, DoorDef } from "./doors";
import { CONTACT_EMAIL, MAIN_SITE_URL } from "./roster";

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
export type HouseId = "top-rated-team" | "adgrant-ai";

export interface ResolveCatalogueOptions {
  /**
   * Which in-house catalogue to start from. Omitted or `top-rated-team` is
   * today's table. `adgrant-ai` clones every row — including hidden ones —
   * and re-points the copy at what that service does for a nonprofit.
   */
  house?: HouseId | null;
  /** Used only to decide the path prefix of an AdGrant clone (`""` vs `/adgrant`). */
  hostname?: string | null;
  /** When the client already knows the mount, pass it rather than a hostname. */
  mount?: "" | "/adgrant";
}

export interface OperatorConfig {
  identity: OperatorIdentity;
  /**
   * Per door id. A door that is ours and is not in the map is offered as
   * named — our name stays on it rather than disappearing into their brand by
   * omission. A door that is already somebody else's is left as it is.
   */
  services?: Record<string, OperatorService>;
  /**
   * When this deployment was forked from a house that is itself a fork.
   * `adgrant-ai` means: clone the nonprofit catalogue first, then apply this
   * operator on top of it. Omitted is `top-rated-team`, which is today's path.
   */
  base?: HouseId;
}

/** A door row as a configured operator's catalogue carries it. */
export type CatalogueDoor = DoorDef & { offered: boolean };

/**
 * The second house. Same registered company as top-rated.team — AdGrant.AI is
 * a product, not a second legal person — and its own terms, contact label and
 * trading name. A fork of adgrant.ai starts from this identity, not from a
 * partner's.
 */
export const ADGRANT_IDENTITY: OperatorIdentity = {
  displayName: "AdGrant.AI",
  legalName: "Top-Rated Team (Danylo Burykin SZČO)",
  entity:
    "The company that runs adgrant.ai, with people in Prague, Madeira, Kyiv, Bratislava and Batumi. AdGrant.AI is its product for nonprofits.",
  termsUrl: `${ADGRANT_ORIGIN}/terms`,
  /* AN ADDRESS, NOT A PAGE. This was `${MAIN_SITE_URL}/contact`, and /contact
     301s to the front of the house — so the one link a nonprofit's data
     protection officer is given for an erasure request landed them on another
     brand's home page. top-rated.team's own legal pages use the address; so
     does this one now. */
  contact: CONTACT_EMAIL,
  contactLabel: "Write to AdGrant.AI",
  invoiceLine: "Top-Rated Team (Danylo Burykin SZČO) signs the contract and sends the invoice.",
};

/**
 * Resolve the door table for an operator, and for a second in-house house.
 *
 * `operator` absent, null or undefined AND house omitted or `top-rated-team`
 * returns `doors` itself — the same array, the same row objects — so this
 * function cannot change what the reference deployment shows. Anything else
 * is a fork or the AdGrant in-house clone, and every row comes back with
 * `offered` set.
 *
 * A fork of a fork is this function called on an already-resolved catalogue,
 * or one OperatorConfig with `base: "adgrant-ai"`. The house legal name is
 * then read off the inner catalogue, so white-label replaces that house, not
 * a name that is no longer on the row.
 */
export function resolveCatalogue(
  doors: readonly DoorDef[],
  operator?: OperatorConfig | null,
  houseOrOptions?: HouseId | ResolveCatalogueOptions | null,
): DoorDef[] | CatalogueDoor[] {
  const options = asOptions(houseOrOptions);
  const house = options.house ?? operator?.base ?? "top-rated-team";
  /* `doors` arrives readonly so a caller cannot be handed a table it can edit
     in place. The clone is already ours; the pass-through is the SAME array
     and the same row objects, cast rather than copied, because the paragraph
     above promises this function cannot change what the reference deployment
     shows. */
  const rooted: DoorDef[] =
    house === "adgrant-ai" ? cloneForAdGrant(doors, mountOf(options)) : (doors as DoorDef[]);

  if (operator == null) return rooted;

  const houseName = houseLegalName(rooted);
  const services = operator.services ?? {};

  for (const door of rooted) {
    const service = services[door.id];
    const mode = modeFor(door, service, houseName);
    if (mode === "white-label") {
      assertOperatorCanBeAnswerable(door, operator.identity, houseName);
    }
  }

  return rooted.map((door) => {
    const service = services[door.id];
    const offered = service?.offered ?? true;
    const mode = modeFor(door, service, houseName);
    return applyMode(door, mode, offered, operator.identity, houseNames(rooted));
  });
}

function asOptions(value: HouseId | ResolveCatalogueOptions | null | undefined): ResolveCatalogueOptions {
  if (value == null) return {};
  if (typeof value === "string") return { house: value };
  return value;
}

function mountOf(options: ResolveCatalogueOptions): "" | "/adgrant" {
  if (options.mount === "" || options.mount === "/adgrant") return options.mount;
  return adgrantMountFor(options.hostname);
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

interface HouseNames {
  legalName: string | null;
  displayName: string | null;
}

function houseNames(doors: readonly DoorDef[]): HouseNames {
  const ours = doors.find((door) => door.tier === "white") ?? doors.find((door) => door.tier !== "grey");
  return {
    legalName: ours?.contract.legalName ?? null,
    displayName: ours?.contract.displayName ?? null,
  };
}

function applyMode(
  door: DoorDef,
  mode: ServiceMode | "unchanged",
  offered: boolean,
  identity: OperatorIdentity,
  house: HouseNames,
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
  let relabelled = cloneDoor(door);
  if (house.legalName) {
    relabelled = replaceInDoorExceptTool(relabelled, house.legalName, contract.legalName);
  }
  if (house.displayName && house.displayName !== house.legalName) {
    relabelled = replaceInDoorExceptTool(relabelled, house.displayName, contract.displayName ?? contract.legalName);
  }
  return {
    ...relabelled,
    contract,
    tier: "white",
    offered,
  };
}

/** White-label may not rename the tool: AdGrant.AI stays AdGrant.AI on a partner's row. */
function replaceInDoorExceptTool(door: DoorDef, find: string, replacement: string): DoorDef {
  const tool = door.tool;
  const without = { ...door };
  delete without.tool;
  const next = replaceInValue(without, find, replacement);
  return tool ? { ...next, tool } : next;
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

/* -------------------------------------------------------------------------- */
/* In-house AdGrant clone                                                     */
/* -------------------------------------------------------------------------- */

interface HouseServiceCopy {
  headline: string;
  blurb: string;
  agentLine: string;
  starters: string[];
  entity?: string;
  tool?: { line: string; href?: string };
}

/**
 * Every door, including the two hidden for the LinkedIn review. A cloned row
 * that still says what the Top-Rated Team row says is worse than no row: it
 * tells a nonprofit we sell something we do not.
 */
const ADGRANT_SERVICE_COPY: Record<string, HouseServiceCopy> = {
  "paid-ads-audit": {
    headline: "Free expert audit of the nonprofit's ad accounts",
    blurb:
      "A person opens the grant account, and any paid Google, LinkedIn or Meta account beside it, and writes down what the automation in them has actually been doing. Most accounts we open have been run by the platform's own bidding and by agents somebody added. You get what we found either way, and there is nothing to sign to get it.",
    agentLine:
      "No agent answers first in this door, and that is the point: an audit is a person opening an account they can see. No documentation can say what the automation did to a nonprofit's account, so nothing here will guess at it.",
    starters: [
      "We turned on Performance Max on a paid account next to the grant. Conversions went up and donations did not. What happened?",
      "An agent has been changing bids on the grant account for months. How do we find out what it optimised for?",
      "Our conversion count doubled after a tracking change. Is that real for donations?",
      "What would you look at first in a grant account you have never seen?",
    ],
  },
  "chatgpt-ads": {
    headline: "Conversion tracking for donations, sign-ups and ChatGPT Ads",
    blurb:
      "The measurement a grant and any paid ads sit on. Which event counts as a donation or a volunteer sign-up, one event id across the browser and the server, and consent that does not silently drop conversions — installed on the nonprofit's own site, verified against live events, and documented before we hand it back.",
    agentLine:
      "The ChatGPT Ads Agent answers first, from developers.openai.com/ads, and cites the page it used. It does not see the nonprofit's ad account, and it does not say whether a donation event will be accepted.",
    starters: [
      "How do I send a donation event from our own site without counting the thank-you page twice?",
      "Which event should we optimise on if gifts arrive by bank transfer weeks after a click?",
      "What is the difference between oppref and obref, and do we need both on a donation form?",
      "Our donations are being counted twice. How does deduplication actually work?",
      "Can I send a conversion from our CRM when a pledge is fulfilled?",
      "What do I need to add to our Content Security Policy for the pixel?",
      "We're in the EU. How do I gate the pixel behind consent without losing every donation?",
      "How do I confirm real donation events are arriving, not just getting a 200 back?",
    ],
  },
  "google-ads": {
    headline: "Paid search a nonprofit runs next to its Ad Grant",
    blurb:
      "Month-to-month management of paid Google Ads — and the same team on ChatGPT Ads, Meta and LinkedIn — in accounts the nonprofit owns. The grant is a different door. This one is the paid budget beside it: structure, bidding and negatives, and the measurement underneath, because bad data makes every bidding decision wrong.",
    agentLine:
      "The Google Ads Agent answers first, from Google's own Google Ads documentation, and cites the page it used: account structure, bidding, Performance Max, Shopping feeds and the conversion tracking underneath them. It does not audit an account it cannot see, and it does not say whether Google will approve an ad or lift a suspension.",
    starters: [
      "Can you take over management of our paid Google Ads account, not the grant?",
      "Should paid Search sit next to the grant, or will they compete for the same queries?",
      "How do I structure a small paid budget beside a $10k grant?",
      "Our CPA doubled after a bidding change — how do we diagnose it on a nonprofit account?",
      "We spend on paid search and still cannot say which campaigns bring donations. Where would you start?",
      "We already have a $10k Ad Grant. Is paid search the same work?",
    ],
    tool: {
      line: "Our own tool, and it is for Google Ad Grant accounts rather than paid ones. It reads a nonprofit's website and produces a structure the nonprofit can see and download. It does not write into a Google Ads account. On a paid account it has no part to play: a paid account is bid on, not generated. If you want the grant itself, the Ad Grants door is the one to read.",
    },
  },
  "linkedin-ads": {
    headline: "LinkedIn Ads for a nonprofit",
    blurb:
      "Account-based targeting for donors, partners and volunteers, lead gen forms, the Insight Tag, and a closed loop from spend to a donation or an application in the nonprofit's own CRM — so the report says outcomes rather than form fills.",
    agentLine:
      "The LinkedIn Ads Agent answers first, from LinkedIn's own advertising documentation, and cites the page it used: campaign objectives, audience targeting including company and contact lists, Lead Gen Forms, the Insight Tag and the Conversions API. It does not give a cost per lead, a budget or a price — a person does that — and where LinkedIn's own documentation is silent it says so rather than filling the gap.",
    starters: [
      "Can we upload a list of foundations and partner organisations, or only target by job title?",
      "Lead gen forms vs a donation page for a monthly giving campaign?",
      "Our LinkedIn leads never become donors. Is that the targeting or the offer?",
      "How do we get LinkedIn spend and CRM gifts into one report?",
    ],
  },
  "ad-grants": {
    headline: "Google Ad Grant structure from the nonprofit's website",
    blurb:
      "A structure — campaigns, ad groups, keywords, ads and extensions — is produced from the nonprofit's own website and shown here. Nothing is written into a Google Ads account. A person sets up the manager-account link afterwards if the structure should go into the grant account. The other half is a person, on the conversion tracking that lets the grant report donations and sign-ups instead of clicks, and on the month-to-month work that keeps the account inside the rules that suspend grants.",
    agentLine:
      "The Ad Grants Agent answers first, from Google's own Ad Grants policies, and cites the page it used: the 5% click-through rule, the website and account-management policies, what a generated structure contains, and what conversion tracking needs from the website. It does not say whether Google will approve or reinstate an account — a person reads the account before anyone answers that.",
    starters: [
      "Google suspended our grant account over the 5% click-through rule. Can you rebuild the structure?",
      "Do you write the campaigns into our own Google Ads account, or do we take a file to Google Ads Editor?",
      "We report on donations and volunteer sign-ups, not clicks. Can you set that tracking up?",
      "After the structure is produced, who runs the account each month — your team or the software?",
    ],
    entity:
      "The company that runs adgrant.ai. The structure is produced here; the management and the conversion tracking after it are our own people, on the same contract, so this door is one contract and one invoice either way.",
    tool: {
      line: "This site. It reads the nonprofit's website and produces campaigns, ad groups, keywords, ads and extensions, and shows them here. It does not write into a Google Ads account. A person sets up the manager-account link afterwards if the structure should go in. It does not run the account afterwards — the conversion tracking and the month-to-month work are a person, on the same contract.",
      href: ADGRANT_ORIGIN,
    },
  },
  "linkedin-automation": {
    headline: "LinkedIn automation for a nonprofit — with a written legal assessment",
    blurb:
      "What is and is not allowed where the nonprofit is gets written down before anything runs — by our AI lawyer agent, from the platforms' own published rules with every page it used cited, or by a qualified lawyer on their own paper where you need the opinion signed. We then build only that and hand the nonprofit's team the code to operate, naming in the scope which parts go through LinkedIn's own API and which drive a logged-in session — because sign-in, email and posting are the only permissions LinkedIn gives out without approval.",
    agentLine:
      "The LinkedIn Automation Agent answers first, from LinkedIn's own developer documentation, and cites the page it used: which permissions are open to any developer, which need LinkedIn's approval or a partner programme, and what the interfaces for invitations, messages, connections and posting require. It never says whether a particular automation is permitted — not by LinkedIn and not where the nonprofit is. That is the lawyer's written assessment, and it is written before anything runs.",
    starters: [
      "What can be automated on a nonprofit's LinkedIn page without putting the account at risk?",
      "We want follow-ups sent from our fundraising team's own profiles. Is that allowed where we are?",
      "What does the written assessment cover, who writes it, and what does it cost?",
      "Can this be built against the official LinkedIn API instead of a browser session?",
    ],
    entity:
      "The company that runs adgrant.ai. The written assessment is not ours: it comes from a qualified lawyer, on the lawyer's own paper.",
  },
  "ai-builds": {
    headline: "Custom AI for a nonprofit",
    blurb:
      "An assistant grounded in one body of the nonprofit's own knowledge, wired into one stack, that hands the work to a person where it runs out. We build them for nonprofits, and we sell two of our own at being.marketing — a multilingual life-story writer, and a set of custom AIs that run without a login.",
    agentLine:
      "The AI Builds Agent answers first, from OpenAI's own API documentation, and cites the page it used: retrieval and file search, function calling into a system the model does not own, and GPT Actions including the no-authentication option. It does not quote a price for a build or for keeping one running, and it does not see the nonprofit's codebase or CRM.",
    starters: [
      "Can you build an agent that answers from our own programme documentation and cites it?",
      "We want a workspace like this one, on our domain and our data. What does that take?",
      "What does it cost to keep an agent running once it is built, and who owns the code?",
      "Can an agent write a gift back into our CRM, or only read from it?",
    ],
  },
  "white-label": {
    headline: "White label — this platform under your name, for the nonprofits you serve",
    blurb:
      "Two ways round. We deliver the grant work behind your brand, invisible to the nonprofits you serve and answering to you. Or this platform runs under your name, with your own set of services rather than ours. A network, a federation or a team that is not either can use both. A fork of this site is already a live request, so the catalogue has to support a fork of a fork rather than discover it later.",
    agentLine:
      "No agent answers first in this door. What a white-label arrangement looks like depends on whose nonprofits they are, whose paper the work is on and which of your services we would be behind — and that is a conversation with a person, not a form.",
    starters: [
      "Can you deliver Ad Grant work under our brand, without the nonprofit knowing you exist?",
      "Could we run this platform as our own, with our own set of services for the nonprofits we serve?",
      "Whose contract is the nonprofit on, and whose invoice do they receive?",
      "We are a federation, not an agency. Does this still work for us?",
    ],
  },
  "linkedin-growth": {
    headline: "LinkedIn growth for a nonprofit, run by a partner company",
    blurb:
      "A separate company, a separate contract, a separate invoice. Not the company that runs this site. If you buy this and something of ours, you get two of everything: two contracts, two invoices, two support addresses.",
    agentLine: "No agent of ours answers in this door. Maksymenko's own people do, in their own room.",
    starters: [
      "Who exactly is the company doing this work, and where is it registered?",
      "What does Maksymenko's team do on a nonprofit's behalf, and what do they never touch?",
      "If this goes wrong, who am I complaining to, and under whose terms?",
      "I already work with the company that runs this site. What changes if I add this?",
    ],
  },
};

function cloneForAdGrant(doors: readonly DoorDef[], mount: "" | "/adgrant"): CatalogueDoor[] {
  const houseName = houseLegalName(doors);
  const missing = doors.filter((door) => !ADGRANT_SERVICE_COPY[door.id]).map((door) => door.id);
  if (missing.length > 0) {
    throw new Error(
      `AdGrant.AI is missing nonprofit copy for ${missing.join(", ")}. A cloned row that still says what the Top-Rated Team row says is worse than no row.`,
    );
  }

  return doors.map((door) => {
    const copy = ADGRANT_SERVICE_COPY[door.id];
    const next = cloneDoor(door);
    next.headline = copy.headline;
    next.blurb = copy.blurb;
    next.agentLine = copy.agentLine;
    next.starters = [...copy.starters];
    next.path = `${mount}${door.path.startsWith("/") ? door.path : `/${door.path}`}`;
    if (copy.tool && next.tool) {
      next.tool = {
        ...next.tool,
        line: copy.tool.line,
        ...(copy.tool.href ? { href: copy.tool.href } : {}),
      };
    }

    if (isOurs(door, houseName)) {
      const contract = contractFrom(ADGRANT_IDENTITY);
      if (door.tier === "light-grey") {
        contract.invoiceLine = door.contract.invoiceLine;
      }
      if (copy.entity) contract.entity = copy.entity;
      next.contract = contract;
    }

    return { ...next, offered: true };
  });
}

/** What a fork's privacy and terms pages are filled from — never guessed. */
export interface CatalogueLegalFacts {
  displayName: string;
  legalName: string;
  entity: string;
  termsUrl: string | null;
  contact: string | null;
  contactLabel?: string;
  invoiceLine: string;
  /** Sign-in methods this catalogue actually offers a visitor. */
  login: { linkedin: boolean; whatsapp: boolean; email: boolean };
  /** Rooms exist behind these doors. */
  rooms: boolean;
  /** A structure can be produced here, and is not written into Google Ads. */
  generatesStructure: boolean;
  /** Rows contracted by somebody else, as the catalogue actually carries them. */
  partners: { legalName: string; headline: string }[];
}

export function catalogueLegalFacts(
  doors: readonly (DoorDef & { offered?: boolean })[],
  identity: OperatorIdentity,
  /*
   * WHICH WAYS IN THIS DEPLOYMENT ACTUALLY HAS. It cannot be known from the
   * catalogue: LinkedIn depends on an app and on the address its redirect
   * returns to, WhatsApp on the host and on a probe, email on mail being
   * configured. So it is passed in, and the default is NONE.
   *
   * It defaulted to all three true, which put "we use Sign In with LinkedIn"
   * on adgrant.ai's privacy page — a data flow that address does not have.
   * A legal page that under-claims is wrong and harmless; one that
   * over-claims describes a transfer of somebody's data that never happened.
   */
  login: CatalogueLegalFacts["login"] = { linkedin: false, whatsapp: false, email: false },
): CatalogueLegalFacts {
  const offered = doors.filter((door) => door.offered !== false);
  const partners = offered
    .filter((door) => door.contract.legalName !== identity.legalName)
    .map((door) => ({ legalName: door.contract.legalName, headline: door.headline }));
  const generatesStructure = offered.some((door) => door.id === "ad-grants");
  return {
    displayName: identity.displayName,
    legalName: identity.legalName,
    entity: identity.entity,
    termsUrl: identity.termsUrl,
    contact: identity.contact,
    ...(identity.contactLabel ? { contactLabel: identity.contactLabel } : {}),
    invoiceLine: identity.invoiceLine?.trim() || `${identity.legalName} signs the contract and sends the invoice.`,
    login,
    rooms: offered.length > 0,
    generatesStructure,
    partners,
  };
}

/** Door ids the AdGrant clone must have copy for. Used by the test, not by pages. */
export function adgrantCopyIds(): string[] {
  return Object.keys(ADGRANT_SERVICE_COPY);
}
