/**
 * Which door a home-page question belongs to — or that it belongs to none.
 *
 * The home page is not a door. Nine agents each read one corpus, and
 * server/ai/kb.ts returns nothing rather than answering out of a neighbour's
 * documentation. Sending a general question to a default agent would cite the
 * wrong pages with working links. This module reads the question against the
 * door table and returns one of three things:
 *
 *   - one live door, with one line saying why
 *   - two or three live doors to pick from, when it cannot tell
 *   - a page (pricing, or a person) for questions no agent here should answer
 *
 * It does not call the model. Guessing with a thin prompt is how the wrong
 * corpus gets cited; a lookup against the rows the site already publishes is
 * the whole of the routing.
 */

import { DOOR_BY_ID, DOORS, doorAgent, type DoorDef } from "@shared/doors";

export type RoutePage = "pricing" | "contact";

export interface RoutedDoor {
  kind: "door";
  doorId: string;
  /** Null when the door is live but no agent of ours answers there. */
  agentId: string | null;
  /** One line, shown to the visitor, naming the door and why. */
  reason: string;
}

export interface RouteChoice {
  doorId: string;
  /** The door's own headline — the words the page already uses for this work. */
  label: string;
}

export interface RoutedChoices {
  kind: "choices";
  reason: string;
  choices: RouteChoice[];
}

export interface RoutedPage {
  kind: "page";
  page: RoutePage;
  reason: string;
  /** Where the page lives, when there is one address. Contact has two, on the screen. */
  href?: string;
}

export type RouteQuestionResult = RoutedDoor | RoutedChoices | RoutedPage;

const STOP = new Set([
  "a",
  "an",
  "the",
  "is",
  "it",
  "to",
  "of",
  "and",
  "or",
  "for",
  "in",
  "on",
  "how",
  "do",
  "does",
  "did",
  "what",
  "when",
  "where",
  "why",
  "can",
  "we",
  "you",
  "i",
  "our",
  "my",
  "your",
  "with",
  "without",
  "from",
  "that",
  "this",
  "be",
  "been",
  "are",
  "was",
  "were",
  "will",
  "would",
  "should",
  "could",
  "if",
  "at",
  "by",
  "as",
  "not",
  "no",
  "yes",
  "me",
  "us",
  "they",
  "them",
  "their",
  "than",
  "then",
  "so",
  "too",
  "very",
  "just",
  "about",
  "into",
  "over",
  "after",
  "before",
  "once",
  "also",
  "any",
  "some",
  "more",
  "most",
  "own",
  "same",
  "such",
  "only",
  "other",
  "up",
  "out",
  "get",
  "got",
  "make",
  "made",
  "need",
  "want",
  "know",
  "see",
  "look",
  "like",
  "one",
  "two",
  "please",
  "thanks",
  "hello",
  "hi",
]);

/** Minimum score before a door may win on its own. Below this, we ask. */
const MIN_ALONE = 6;
/** Winner must beat the runner-up by this, or it is a choice, not a guess. */
const MARGIN = 3.5;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensOf(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function shortHeadline(door: DoorDef): string {
  return door.headline.split(/\s+[—–-]\s+|,\s+/)[0];
}

/** For dropping a headline into a sentence without shouting the first letter. */
function asSubject(door: DoorDef): string {
  const name = shortHeadline(door);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function doorDocument(door: DoorDef): string {
  return [
    door.id.replace(/-/g, " "),
    door.slug.replace(/-/g, " "),
    door.headline,
    door.blurb,
    door.agentLine,
    ...door.starters,
  ].join("\n");
}

/**
 * A door's phrases, in two kinds, because they are not the same evidence.
 *
 * IDENTITY is what the door IS: the words of its id, and its short headline —
 * the name a person would use for it. MENTIONS are everything else the headline
 * happens to contain, which is every 2- and 3-gram of it.
 *
 * The distinction had no cost until a headline started naming other doors'
 * subjects. "Google Ads, ChatGPT Ads and Paid Ads" mentions ChatGPT Ads, and
 * the conversion-tracking door IS ChatGPT Ads. Flat scoring cannot tell those
 * apart, and measured, it did not: "Do you do ChatGPT Ads?" came back as a
 * three-way question instead of a door, with the mentioner two points behind
 * the door that owns the subject.
 *
 * A door that IS the thing beats a door that mentions it. That is all this
 * split encodes, and it is true of every door, not only of the renamed one.
 */
function phrasesOf(door: DoorDef): { identity: string[]; mentions: string[] } {
  const identity = new Set<string>();
  const idWords = normalize(door.id.replace(/-/g, " "));
  if (idWords) identity.add(idWords);
  const short = normalize(shortHeadline(door));
  if (short) identity.add(short);

  const mentions = new Set<string>();
  const headline = normalize(door.headline);
  if (headline && !identity.has(headline)) mentions.add(headline);

  const headTokens = headline.split(/\s+/).filter(Boolean);
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= headTokens.length; i++) {
      const gram = headTokens.slice(i, i + n).join(" ");
      if (!identity.has(gram) && gram.split(" ").some((w) => !STOP.has(w))) mentions.add(gram);
    }
  }
  return { identity: [...identity], mentions: [...mentions] };
}

interface Scored {
  door: DoorDef;
  score: number;
}

/**
 * Exported for tests and for diagnosis, named so nobody routes with it. Same
 * reason shared/roster.ts exports HOUSE_STYLE_FOR_TESTS: the scoring is the
 * part of this file that goes wrong silently, and a green suite of exact
 * starter matches proved that once already.
 */
export function scoreDoorsForTests(question: string): Scored[] {
  return scoreDoors(question);
}

function scoreDoors(question: string): Scored[] {
  const q = normalize(question);
  const qTokens = tokensOf(question);
  const docs = DOORS.map((door) => {
    const bag = new Set(tokensOf(doorDocument(door)));
    return { door, bag, phrases: phrasesOf(door) };
  });

  const df = new Map<string, number>();
  for (const token of new Set(qTokens)) {
    df.set(token, docs.filter((d) => d.bag.has(token)).length);
  }

  /*
   * HOW MANY DOORS CARRY EACH PHRASE, which is the thing this scorer was not
   * asking and needed to.
   *
   * Tokens have always been weighted by rarity a few lines below — a word in
   * one door's bag is worth three times its idf, a word in every door is worth
   * almost nothing. Phrases got a flat 5 or 8 no matter how many doors carried
   * them, and that asymmetry is what makes a shared phrase decide a question it
   * cannot possibly answer.
   *
   * It became load-bearing when the owner renamed the Google Ads door "Google
   * Ads, ChatGPT Ads and Paid Ads". Every 2- and 3-gram of a headline enters
   * the table, so that name puts "chatgpt ads" into a second door's phrases and
   * "paid ads" into a third's. Measured before this change: "Do you do ChatGPT
   * Ads?" and "Can you audit our paid ads?" stopped resolving to a door at all
   * and started asking the visitor which of three they meant.
   *
   * A phrase in one door is a fact about that door. The same phrase in three is
   * a fact about the vocabulary. Dividing by the number of carriers says
   * exactly that, and it leaves a phrase nobody else uses worth what it always
   * was.
   */
  const phraseDf = new Map<string, number>();
  for (const d of docs) {
    for (const phrase of new Set([...d.phrases.identity, ...d.phrases.mentions])) {
      phraseDf.set(phrase, (phraseDf.get(phrase) ?? 0) + 1);
    }
  }

  /* Identity is counted separately: "chatgpt ads" is one door's subject and
     another door's passing mention, and only the first should be scarce. */
  const identityDf = new Map<string, number>();
  for (const d of docs) {
    for (const phrase of new Set(d.phrases.identity)) {
      identityDf.set(phrase, (identityDf.get(phrase) ?? 0) + 1);
    }
  }

  const n = docs.length;

  return docs.map(({ door, bag, phrases }) => {
    let score = 0;
    const starterHit = door.starters.some((starter) => {
      const s = normalize(starter);
      return s === q || (q.length > 40 && (q.includes(s) || s.includes(q)));
    });
    if (starterHit) score += 20;

    /*
     * MATCHED ON WORD BOUNDARIES, and the version without them sent the wrong
     * people to the wrong door for as long as this file has existed.
     *
     * `q.includes(phrase)` is a raw substring test. The Ad Grants headline is
     * "Google Ad Grant AI setup through the official Google Ads API", whose
     * n-grams include BOTH "google ad" and "google ads" — and "google ad" is a
     * substring of "google ads". So "Can you manage our Google Ads?" paid that
     * door twice, 5 points for a phrase the visitor never wrote, and it beat
     * the Google Ads door 11.20 to 6.20.
     *
     * Measured, not reasoned: three plain management questions — "Can you
     * manage our Google Ads?", "We need help managing our Google Ads account",
     * "Who runs Google Ads campaigns?" — all routed to the charity product.
     * That is the highest-intent question this business gets, landing on a page
     * about grants for nonprofits.
     *
     * normalize() leaves single-space-separated words, so padding both sides is
     * the whole fix: " google ad " is not inside " ... google ads ".
     */
    const padded = ` ${q} `;
    for (const phrase of phrases.identity) {
      if (phrase.length < 4 || !padded.includes(` ${phrase} `)) continue;
      if (phrase.split(" ").every((w) => STOP.has(w))) continue;
      /* Being the thing is worth more than mentioning it, and worth less when
         two doors are the same thing — which no two are today. */
      score += 12 / (identityDf.get(phrase) ?? 1);
    }

    for (const phrase of phrases.mentions) {
      if (phrase.length < 4 || !padded.includes(` ${phrase} `)) continue;
      const words = phrase.split(" ").filter((w) => !STOP.has(w));
      if (words.length === 0) continue;
      score += (words.length >= 3 ? 8 : 5) / (phraseDf.get(phrase) ?? 1);
    }

    for (const token of qTokens) {
      if (!bag.has(token)) continue;
      const seen = df.get(token) ?? 0;
      if (seen === 0) continue;
      const idf = Math.log((n + 1) / seen);
      score += seen === 1 ? idf * 3 : idf;
    }

    // A whole distinctive token sitting in the door's id is a named subject.
    const idTokens = new Set(tokensOf(door.id.replace(/-/g, " ")));
    for (const token of qTokens) {
      if (idTokens.has(token) && (df.get(token) ?? 0) <= 2) score += 2;
    }

    return { door, score };
  });
}

/**
 * Questions the page already answers. An agent sent these will decline, quote
 * a published figure it was not asked to explain, or invent a person. The
 * price is on /pricing; the two ways to reach a person are on the first screen.
 *
 * Only short, generic forms match. A long question that happens to contain
 * "cost" ("what does the written assessment cover, and what does it cost") is
 * still a door's subject.
 */
function isPricePage(question: string): boolean {
  const q = normalize(question);
  if (
    q === "what does this cost" ||
    q === "what does it cost" ||
    q === "how much does this cost" ||
    q === "how much does it cost" ||
    q === "how much do you charge" ||
    q === "what do you charge" ||
    q === "whats the price" ||
    q === "what is the price" ||
    q === "what are your prices" ||
    q === "what are your rates" ||
    q === "how much is it" ||
    q === "pricing" ||
    q === "price" ||
    q === "what does this cost me"
  ) {
    return true;
  }
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  const aboutMoney =
    /\b(cost|costs|price|pricing|charge|charges|fee|fees|rates)\b/.test(q) || /^how much\b/.test(q);
  if (!aboutMoney) return false;
  if (
    /\b(chatgpt|openai|google|linkedin|grant|grants|pixel|audit|shopify|pmax|insight|automation|campaign|agent|build)\b/.test(
      q,
    )
  ) {
    return false;
  }
  return true;
}

function isContactPage(question: string): boolean {
  const q = normalize(question);
  if (
    q === "who are you" ||
    q === "who are you people" ||
    q === "can i talk to somebody" ||
    q === "can i talk to someone" ||
    q === "can i talk to a person" ||
    q === "can i speak to somebody" ||
    q === "can i speak to someone" ||
    q === "can i speak to a person" ||
    q === "book a call" ||
    q === "leave a message" ||
    q === "i want to talk to a person" ||
    q === "i want a human" ||
    q === "talk to a person" ||
    q === "can i talk to somebody please"
  ) {
    return true;
  }
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  return (
    /\bwho are you\b/.test(q) ||
    /\bcan i (?:talk|speak) to (?:somebody|someone|a person|a human|you)\b/.test(q) ||
    /\b(?:book a call|leave a message)\b/.test(q) ||
    /\bi want (?:to (?:talk|speak) to )?(?:a )?(?:person|human|somebody)\b/.test(q)
  );
}

function reasonForDoor(door: DoorDef, picked: boolean): string {
  const subject = asSubject(door);
  const name = shortHeadline(door);
  const agent = doorAgent(door);
  if (picked) {
    if (agent) return `You picked ${name}, so the ${agent.name} is answering.`;
    return `You picked ${name}. No agent of ours answers there — that page is where to start.`;
  }
  if (agent) {
    return `This looks like a question about ${subject}, so the ${agent.name} is answering.`;
  }
  return `This looks like a question about ${subject}. No agent of ours answers there — a person does that work, and that page is where to start.`;
}

function asDoor(door: DoorDef, picked: boolean): RoutedDoor {
  return {
    kind: "door",
    doorId: door.id,
    agentId: door.firstAgentId,
    reason: reasonForDoor(door, picked),
  };
}

function liveChoice(door: DoorDef): RouteChoice {
  return { doorId: door.id, label: door.headline };
}

function fillChoices(preferred: DoorDef[]): RouteChoice[] {
  const seen = new Set<string>();
  const out: RouteChoice[] = [];
  for (const door of preferred) {
    if (door.status !== "live") continue;
    if (seen.has(door.id)) continue;
    seen.add(door.id);
    out.push(liveChoice(door));
    if (out.length >= 3) return out;
  }
  for (const door of DOORS) {
    if (door.status !== "live") continue;
    if (!door.firstAgentId) continue;
    if (seen.has(door.id)) continue;
    seen.add(door.id);
    out.push(liveChoice(door));
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

const CONTACT_COMING: RoutedPage = {
  kind: "page",
  page: "contact",
  reason:
    "That service is not open to ask an agent about yet. A person can tell you where it stands — book a call or leave a message.",
};

const CONTACT_PAGE: RoutedPage = {
  kind: "page",
  page: "contact",
  reason:
    "This is a question for a person, not for an agent. Book a call or leave a message — both are already on this page.",
};

const PRICING_PAGE: RoutedPage = {
  kind: "page",
  page: "pricing",
  href: "/pricing",
  reason: "What this costs is on the pricing page, not something an agent decides.",
};

function uniqueComingDoor(question: string): DoorDef | undefined {
  const qTokens = tokensOf(question);
  if (qTokens.length === 0) return undefined;
  for (const token of qTokens) {
    const holders = DOORS.filter((door) => tokensOf(doorDocument(door)).includes(token));
    if (holders.length === 1 && holders[0].status !== "live") return holders[0];
  }
  return undefined;
}

function pickedLiveDoor(doorId: string | undefined): DoorDef | undefined {
  if (!doorId) return undefined;
  const door = DOOR_BY_ID[doorId];
  if (!door || door.status !== "live") return undefined;
  return door;
}

/**
 * Read a home-page question and say which live door it belongs to, which page
 * answers it, or that the visitor needs to pick.
 *
 * `pickedDoorId` is the visitor's choice from a previous `choices` result. A
 * coming door, or an id that is not a door, is ignored rather than honoured.
 */
export function routeQuestion(question: string, pickedDoorId?: string): RouteQuestionResult {
  const picked = pickedLiveDoor(pickedDoorId);
  if (picked) return asDoor(picked, true);

  const trimmed = question.trim();
  if (!trimmed) {
    return {
      kind: "choices",
      reason: "Say a little more, or pick the service that sounds like what you meant.",
      choices: fillChoices([]),
    };
  }

  if (isContactPage(trimmed)) return CONTACT_PAGE;
  if (isPricePage(trimmed)) return PRICING_PAGE;

  const coming = uniqueComingDoor(trimmed);
  if (coming) return CONTACT_COMING;

  const ranked = scoreDoors(trimmed).sort((a, b) => b.score - a.score);
  const best = ranked[0];

  const live = ranked.filter((row) => row.door.status === "live");
  const bestLive = live[0];
  const secondLive = live[1];

  if (best && best.door.status !== "live" && best.score >= MIN_ALONE && best.score >= (bestLive?.score ?? 0) + MARGIN) {
    return CONTACT_COMING;
  }

  if (
    bestLive &&
    bestLive.score >= MIN_ALONE &&
    (secondLive == null || bestLive.score >= secondLive.score + MARGIN)
  ) {
    return asDoor(bestLive.door, false);
  }

  const close = live.filter((row) => row.score > 0).slice(0, 3);
  const preferred = (close.length >= 2 ? close : live.slice(0, 3)).map((row) => row.door);

  return {
    kind: "choices",
    reason: "This could be more than one service. Pick the one that sounds like what you asked.",
    choices: fillChoices(preferred),
  };
}
