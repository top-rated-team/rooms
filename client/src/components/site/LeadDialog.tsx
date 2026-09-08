import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { DEFAULT_DOOR_ID, DOOR_BY_ID, DOORS, type DoorDef } from "@shared/doors";
import { BOOK_A_CALL_URL, EXPERTS, SERVICES, SERVICE_GROUPS, type ExpertDef } from "@shared/roster";
import { useBooking } from "@/hooks/use-booking";
import type { CreateWorkspaceResponse } from "@shared/api";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SECONDARY = `${BTN_BASE} bg-secondary text-secondary-foreground border border-secondary-border min-h-9 px-4 py-2`;
const BTN_GHOST = `${BTN_BASE} border border-transparent min-h-8 rounded-md px-3 text-xs`;

const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

/** Deliberately permissive: the server validates, and a rejected typo costs a lead. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "oppref"];

/**
 * Campaign attribution for the lead record. Read-only — nothing personal is put
 * back into a URL.
 *
 * `door` is the one key here that is not attribution. It is which offer the
 * visitor came in through, and the room reads it back to decide whose legal
 * name, terms and invoice line to print in its footer. It is written once, at
 * the moment the room is created, so nothing downstream has to remember it: a
 * visitor who arrived through the partner door can never be shown a Top-Rated
 * Team invoice, because a Top-Rated Team name was never handed to that room.
 * The door is read off the path, so a door page carries its own id the day it
 * exists; anything else is the door that pays for the site.
 */
export function collectSource(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {};
  const params = new URLSearchParams(window.location.search);
  for (const key of SOURCE_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 200);
  }
  out.landing = window.location.pathname;
  out.door = DOORS.find((door) => door.path === window.location.pathname)?.id ?? DEFAULT_DOOR_ID;
  if (document.referrer) out.referrer = document.referrer.slice(0, 300);
  return out;
}

/**
 * The door this form is sitting on, so the "if it cannot wait" line offers that
 * company's own address. Never a default: a visitor who came through a door
 * that is not ours must not be handed our contact page — see docs/doors.md.
 */
function currentDoor(): DoorDef {
  const fallback = DOOR_BY_ID[DEFAULT_DOOR_ID];
  if (typeof window === "undefined") return fallback;
  return DOORS.find((door) => door.path === window.location.pathname) ?? fallback;
}

const CONVERSION_TRACKING_LEAD = EXPERTS.find((expert) => expert.leadsConversionTracking);
const OWNER = EXPERTS.find((expert) => expert.badge === "Owner");

/**
 * Who actually reads this one. Named rather than implied: "we will be in touch"
 * with nobody behind it is the sentence this replaces.
 */
function answeredBy(intent: string): ExpertDef | undefined {
  if (intent === "conversion-tracking" && CONVERSION_TRACKING_LEAD) return CONVERSION_TRACKING_LEAD;
  return OWNER ?? CONVERSION_TRACKING_LEAD;
}

function contactHref(contact: string): string {
  return contact.includes("@") && !contact.startsWith("http") ? `mailto:${contact}` : contact;
}

export interface LeadPrefill {
  /** ServiceDef id, pre-selected in the intent list. */
  intent?: string;
  /** Set when the visitor clicked "Message" on a specific person. */
  expertName?: string;
  message?: string;
}

export interface LeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: LeadPrefill | null;
}

interface FormState {
  name: string;
  email: string;
  company: string;
  website: string;
  intent: string;
  message: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  company: "",
  website: "",
  intent: "conversion-tracking",
  message: "",
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    /* Non-JSON error bodies are expected from proxies; fall through. */
  }
  return fallback;
}

export function LeadDialog({ open, onOpenChange, prefill }: LeadDialogProps) {
  /* The popup rather than a tab, decided once in useBooking. */
  const booking = useBooking();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  /** The server's own id for this request. The visitor's proof it exists. */
  const [reference, setReference] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  const groups = useMemo(
    () => SERVICE_GROUPS.map((group) => ({ group, items: SERVICES.filter((s) => s.group === group) })),
    [],
  );

  // Each opening is a fresh enquiry; the prefill decides what it is about.
  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      intent: prefill?.intent ?? EMPTY_FORM.intent,
      message: prefill?.message ?? "",
    });
    setEmailError(null);
    setFormError(null);
    setSending(false);
    setSent(false);
    setReference(null);
    setContinuing(false);
  }, [open, prefill]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next: FormState = { ...prev };
      next[key] = value;
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!EMAIL_RE.test(form.email.trim())) {
      setEmailError("Enter an email address we can reply to.");
      return;
    }
    setEmailError(null);
    setFormError(null);
    setSending(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || null,
          email: form.email.trim(),
          company: form.company.trim() || null,
          website: form.website.trim() || null,
          intent: form.intent,
          message: form.message.trim() || null,
          source: collectSource(),
        }),
      });
      if (!res.ok) {
        setFormError(
          await readError(
            res,
            door.contract.contact
              ? `That did not arrive, so nothing was recorded. Write to ${door.contract.contact} instead and it reaches the same people.`
              : "That did not arrive, so nothing was recorded. Book a call instead and it reaches the same people.",
          ),
        );
        return;
      }
      const body = (await res.json().catch(() => null)) as { reference?: string } | null;
      setReference(typeof body?.reference === "string" ? body.reference : null);
      setSent(true);
    } catch {
      setFormError("Network error, so nothing was recorded on our side. Try again, or book a call.");
    } finally {
      setSending(false);
    }
  }

  async function continueInWorkspace() {
    setContinuing(true);
    setFormError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "conversion-tracking",
          firstMessage: form.message.trim() || undefined,
          visitorName: form.name.trim() || undefined,
          visitorEmail: form.email.trim() || undefined,
          visitorCompany: form.company.trim() || undefined,
          visitorWebsite: form.website.trim() || undefined,
          source: collectSource(),
        }),
      });
      if (!res.ok) {
        setFormError(await readError(res, "The workspace could not be created. We still have your message."));
        return;
      }
      const state = (await res.json()) as CreateWorkspaceResponse;
      onOpenChange(false);
      navigate(`/w/${state.workspace.token}`);
    } catch {
      setFormError("Network error creating the workspace. We still have your message.");
    } finally {
      setContinuing(false);
    }
  }

  const door = useMemo(currentDoor, []);
  const answerer = answeredBy(form.intent);
  const sentTo = form.email.trim();
  const title = prefill?.expertName ? `Message ${prefill.expertName}` : "Tell us what you are running";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          data-testid="dialog-lead"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-popover-border bg-popover p-6 text-popover-foreground shadow-lg scrollbar-thin data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        >
          <Dialog.Close
            data-testid="button-lead-close"
            className="absolute right-4 top-4 rounded-md border border-transparent p-1 text-muted-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          {sent ? (
            <div>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Check className="h-5 w-5" />
              </div>
              <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">Received and written down</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {answerer ? (
                  <>
                    <span className="font-medium text-foreground">{answerer.name}</span> reads this — {answerer.title} —
                    and replies from a real inbox, usually within a working day.
                  </>
                ) : (
                  <>A person on the team reads this and replies from a real inbox, usually within a working day.</>
                )}
                {sentTo ? (
                  <>
                    {" "}
                    The reply comes back to <span className="font-medium text-foreground">{sentTo}</span>.
                  </>
                ) : null}
              </Dialog.Description>
              {reference ? (
                <p className="mt-3 text-xs text-muted-foreground" data-testid="text-lead-reference">
                  Your reference is{" "}
                  <code className="rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {reference}
                  </code>
                  . Quote it and we find this in one search.
                </p>
              ) : null}
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing else is sent to you — no confirmation, no sequence — so a person's reply is the only thing that
                comes back, and this form has no address of its own. A workspace does: a shared space with the agents
                and our team in it, no signup, and the link is the whole account. Open one and you can come back to the
                same conversation whenever you like.
              </p>
              {door.contract.contact ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  If it cannot wait a day, or a day goes by with nothing, write to{" "}
                  <a
                    href={contactHref(door.contract.contact)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {door.contract.contactLabel ?? door.contract.contact}
                  </a>{" "}
                  or book a call below.
                </p>
              ) : null}
              {formError ? (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="button-lead-continue-workspace"
                  className={BTN_PRIMARY}
                  onClick={continueInWorkspace}
                  disabled={continuing}
                >
                  {continuing ? <Loader2 className="animate-spin" /> : null}
                  Continue in a workspace
                  {continuing ? null : <ArrowRight />}
                </button>
                <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY} {...booking}>
                  Book a call
                </a>
                <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                Enough to reply properly. We answer from a real inbox — no sequence, no drip. We will never ask you to
                paste an API key or a password here.
              </Dialog.Description>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium">
                    Name
                  </label>
                  <input
                    id="lead-name"
                    data-testid="input-lead-name"
                    className={FIELD}
                    value={form.name}
                    autoComplete="name"
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lead-email" className="mb-1.5 block text-sm font-medium">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="lead-email"
                    data-testid="input-lead-email"
                    type="email"
                    required
                    autoComplete="email"
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? "lead-email-error" : undefined}
                    className={FIELD}
                    value={form.email}
                    onChange={(e) => {
                      set("email", e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                  />
                  {emailError ? (
                    <p id="lead-email-error" className="mt-1.5 text-xs text-destructive">
                      {emailError}
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lead-company" className="mb-1.5 block text-sm font-medium">
                    Company
                  </label>
                  <input
                    id="lead-company"
                    data-testid="input-lead-company"
                    className={FIELD}
                    autoComplete="organization"
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lead-website" className="mb-1.5 block text-sm font-medium">
                    Website
                  </label>
                  <input
                    id="lead-website"
                    data-testid="input-lead-website"
                    className={FIELD}
                    placeholder="example.com"
                    autoComplete="url"
                    value={form.website}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-intent" className="mb-1.5 block text-sm font-medium">
                    What do you need
                  </label>
                  <select
                    id="lead-intent"
                    data-testid="select-lead-intent"
                    className={FIELD}
                    value={form.intent}
                    onChange={(e) => set("intent", e.target.value)}
                  >
                    {groups.map(({ group, items }) => (
                      <optgroup key={group} label={group}>
                        {items.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="other">Something else</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-message" className="mb-1.5 block text-sm font-medium">
                    Message
                  </label>
                  <textarea
                    id="lead-message"
                    data-testid="input-lead-message"
                    rows={4}
                    className={`${FIELD} resize-y`}
                    placeholder="Your platform, your checkout, and what counts as a conversion. Rough is fine."
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                  />
                </div>
              </div>

              {formError ? (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="submit" data-testid="button-lead-submit" className={BTN_PRIMARY} disabled={sending}>
                  {sending ? <Loader2 className="animate-spin" /> : null}
                  Send message
                </button>
                <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY} {...booking}>
                  Book a call instead
                </a>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default LeadDialog;
