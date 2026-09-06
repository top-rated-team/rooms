import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The promotion rule, in one place, written to be read.
 *
 * The panel on the landing page owns nothing of the visitor's: no row, no
 * address, no email. Exactly four things end that state, and nothing else does:
 *
 *   (a) they ask for a person       — an explicit press, or the words below
 *   (b) they paste their own thing  — a URL, a code block, or a long paste
 *   (c) they press Keep             — the only deliberate one
 *   (d) they write a third message  — two questions is a lookup, three is a
 *                                     conversation, and a conversation lost on
 *                                     a refresh is a broken promise
 *
 * A trigger never creates anything by itself. It puts one question on screen and
 * the visitor answers it. "Stay anonymous" is a real answer: it is remembered
 * for the rest of the session and the question is not asked again.
 */

/* ------------------------------ the four rules ---------------------------- */

export type PromotionTrigger =
  | "asked-for-a-person"
  | "pasted-their-own"
  | "pressed-keep"
  | "third-message";

/** Two questions is a lookup. The third message is the one that makes it a conversation. */
export const PROMOTION_MESSAGE_COUNT = 3;

/**
 * Two sentences is a question. This much text is their situation — a log, an
 * error, a policy, the thing they were told by somebody else — and it is theirs
 * whether they typed it or pasted it.
 */
export const OWN_MATERIAL_MIN_LENGTH = 200;

/**
 * Asking for a person, in the words people actually use in this panel.
 *
 * Whole phrases rather than single words: "human" on its own matches "human
 * error" and "someone" on its own matches half the questions this agent gets.
 * The list is deliberately short and errs towards missing a request rather than
 * inventing one — a wrong guess costs the visitor a sentence they did not ask
 * for, and that sentence is the whole point of being careful here.
 */
const ASKING_FOR_A_PERSON = [
  "talk to a human",
  "talk to a person",
  "talk to someone",
  "speak to a human",
  "speak to a person",
  "speak to someone",
  "speak with someone",
  "a real person",
  "a real human",
  "an actual person",
  "can someone",
  "could someone",
  "can one of you",
  "can you do it",
  "can you do this",
  "do it for us",
  "do it for me",
  "do this for us",
  "do this for me",
  "set it up for us",
  "set it up for me",
  "need someone",
  "we need help",
  "hire you",
  "work with you",
  "work with us",
  "book a call",
  "get on a call",
  "jump on a call",
  "who can help",
  "your team",
  "how much do you charge",
  "what do you charge",
  "your rates",
  "a quote",
];

/**
 * An address they pasted. A bare hostname is left out on purpose: this agent's
 * own answers are full of them, and so are questions that quote the docs.
 */
const URL_PATTERN = /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+/i;

/** The shapes code keeps when it is copied out of an editor, a console or a tag manager. */
const CODE_PATTERNS: RegExp[] = [
  /```/, //                            a fenced block
  /<\/?[a-z][^>]*>/i, //               a tag: a pixel snippet, a script, a template fragment
  /=>|\bfunction\s*[\w$]*\s*\(/, //    javascript
  /\{\s*"[^"]*"\s*:/, //               a JSON payload
  /^\s*(?:curl|GET|POST|PUT)\b/m, //   a request copied out of a terminal or a log
];

/** (a) — the message reads as a request for a person rather than for a document. */
export function readsAsAskingForAPerson(text: string): boolean {
  const normalised = text.toLowerCase().replace(/\s+/g, " ");
  return ASKING_FOR_A_PERSON.some((phrase) => normalised.includes(phrase));
}

/** (b) — the message carries something of theirs rather than only a question. */
export function readsAsTheirOwn(text: string): boolean {
  if (text.length >= OWN_MATERIAL_MIN_LENGTH) return true;
  if (URL_PATTERN.test(text)) return true;
  return CODE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * The whole rule for a typed message, in one function. Reported most specific
 * first; the question put to the visitor is the same either way.
 */
export function detectTrigger(text: string, messageCount: number): PromotionTrigger | null {
  if (readsAsAskingForAPerson(text)) return "asked-for-a-person";
  if (readsAsTheirOwn(text)) return "pasted-their-own";
  if (messageCount >= PROMOTION_MESSAGE_COUNT) return "third-message";
  return null;
}

/* ------------------------------ staying anonymous ------------------------- */

/** Per tab, not per browser: "this session" is the session they are in. */
const ANONYMOUS_KEY = "tr-panel-anonymous";

function recallAnonymous(): boolean {
  try {
    return window.sessionStorage.getItem(ANONYMOUS_KEY) === "1";
  } catch {
    // Private mode or blocked storage. Then the answer only lasts as long as
    // this mount, which is still one page view — it is never asked twice on the
    // same screen either way.
    return false;
  }
}

function rememberAnonymous(): void {
  try {
    window.sessionStorage.setItem(ANONYMOUS_KEY, "1");
  } catch {
    // See above: remembering the answer is a courtesy, not a requirement.
  }
}

/* --------------------------------- the hook ------------------------------- */

export interface CreatedRoom {
  /** Absolute URL the visitor must keep in order to get back in. */
  url: string;
  /** Used by the email path, which posts the id and never the token. */
  workspaceId: string;
  /** In-app path, for the navigation that happens after the address has been seen. */
  path: string;
}

export type CreateRoomResult =
  | { ok: true; room: CreatedRoom }
  | { ok: false; error: string };

export interface UsePanelStateOptions {
  /**
   * Mints the room. Called only after the visitor has said yes, never by a
   * trigger on its own, and it must not navigate: the address is shown in place
   * first.
   */
  createRoom: (firstMessage?: string) => Promise<CreateRoomResult>;
}

export type PanelStage =
  /** Nothing is saved. Most visitors never leave this. */
  | "quiet"
  /** The one question is on screen, waiting for an answer. */
  | "asking"
  /** The room exists and its address is on screen. */
  | "kept";

export interface PanelState {
  stage: PanelStage;
  /** Which of the four fired, for the record. */
  trigger: PromotionTrigger | null;
  /** True once "stay anonymous" was pressed. The question is not asked again this session. */
  anonymous: boolean;
  /** The room is being minted right now. */
  keeping: boolean;
  /** How many messages the visitor has sent into the panel. */
  messageCount: number;
  room: CreatedRoom | null;
  /** Set when minting failed; shown in place, next to the buttons that failed. */
  error: string | null;

  /** Call for every message the visitor sends. This is what applies (a), (b) and (d). */
  noteVisitorMessage: (text: string) => void;
  /** (a) as an explicit press — a button that asks for a person rather than a document. */
  noteAskedForAPerson: () => void;
  /**
   * (c), and the "Keep it" answer to the question. Mints the room and resolves
   * to an error message, or null — the same shape the rest of this codebase uses.
   * `firstMessage` overrides the last message noted, for a caller that knows better.
   */
  keep: (firstMessage?: string) => Promise<string | null>;
  /** The "No, stay anonymous" answer. It really stays anonymous. */
  stayAnonymous: () => void;
}

interface InternalState {
  stage: PanelStage;
  trigger: PromotionTrigger | null;
  anonymous: boolean;
  keeping: boolean;
  room: CreatedRoom | null;
  error: string | null;
}

export function usePanelState({ createRoom }: UsePanelStateOptions): PanelState {
  const [state, setState] = useState<InternalState>(() => ({
    stage: "quiet",
    trigger: null,
    anonymous: recallAnonymous(),
    keeping: false,
    room: null,
    error: null,
  }));
  const [messageCount, setMessageCount] = useState(0);

  // Counters live in refs so a message can be judged the moment it is sent,
  // rather than one render later.
  const countRef = useRef(0);
  const lastMessageRef = useRef<string | null>(null);
  const keepingRef = useRef(false);
  // One conversation gets one room. Without this a second press — a double
  // click, or the panel's own button after the row's — mints a second one and
  // strands the first.
  const keptRef = useRef(false);

  const createRoomRef = useRef(createRoom);
  useEffect(() => {
    createRoomRef.current = createRoom;
  }, [createRoom]);

  /** Puts the one question on screen. Asked once, and only from "quiet". */
  const promote = useCallback((fired: PromotionTrigger) => {
    setState((prev) => {
      if (prev.anonymous || prev.stage !== "quiet") return prev;
      return { ...prev, stage: "asking", trigger: fired };
    });
  }, []);

  const noteVisitorMessage = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      lastMessageRef.current = text;
      countRef.current += 1;
      setMessageCount(countRef.current);

      const fired = detectTrigger(text, countRef.current);
      if (fired) promote(fired);
    },
    [promote],
  );

  const noteAskedForAPerson = useCallback(() => promote("asked-for-a-person"), [promote]);

  const keep = useCallback(async (firstMessage?: string): Promise<string | null> => {
    if (keepingRef.current || keptRef.current) return null;
    keepingRef.current = true;
    setState((prev) => ({
      ...prev,
      keeping: true,
      error: null,
      // Pressing Keep without being asked is trigger (c).
      trigger: prev.trigger ?? "pressed-keep",
    }));

    const result = await createRoomRef.current(firstMessage ?? lastMessageRef.current ?? undefined);
    keepingRef.current = false;

    if (!result.ok) {
      setState((prev) => ({ ...prev, keeping: false, error: result.error }));
      return result.error;
    }
    keptRef.current = true;
    setState((prev) => ({ ...prev, keeping: false, stage: "kept", room: result.room, error: null }));
    return null;
  }, []);

  const stayAnonymous = useCallback(() => {
    rememberAnonymous();
    setState((prev) => ({ ...prev, stage: "quiet", trigger: null, anonymous: true, error: null }));
  }, []);

  return useMemo(
    () => ({
      stage: state.stage,
      trigger: state.trigger,
      anonymous: state.anonymous,
      keeping: state.keeping,
      messageCount,
      room: state.room,
      error: state.error,
      noteVisitorMessage,
      noteAskedForAPerson,
      keep,
      stayAnonymous,
    }),
    [state, messageCount, noteVisitorMessage, noteAskedForAPerson, keep, stayAnonymous],
  );
}
