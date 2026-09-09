import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Loader2, X } from "lucide-react";

import {
  bookSlot,
  cachedSlots,
  formatBookedWhen,
  formatSlotDay,
  isPhoneBooking,
  loadSlots,
  pollBookingConfirmed,
  type BookedPayload,
  type SlotDay,
  type SlotsPayload,
} from "@/lib/booking";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
const BTN_SLOT =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const BTN_SLOT_SELECTED = `${BTN_SLOT} border-primary bg-primary text-primary-foreground`;

const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

/** Deliberately permissive: a rejected typo costs a booking, not a lead. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase =
  | { kind: "pick" }
  | { kind: "waiting"; booked: BookedPayload; openedWhatsApp: boolean }
  | { kind: "done"; booked: BookedPayload; viaWhatsApp: boolean }
  | { kind: "expired"; booked: BookedPayload };

export function BookingDialog({ open, onOpenChange }: BookingDialogProps) {
  const [slots, setSlots] = useState<SlotsPayload | null>(cachedSlots);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => cachedSlots() == null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const pollAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      pollAbort.current?.abort();
      pollAbort.current = null;
      return;
    }
    setSlots(cachedSlots());
    setLoadError(null);
    setDate(null);
    setTime(null);
    setEmail("");
    setEmailError(null);
    setFormError(null);
    setSending(false);
    setPhase({ kind: "pick" });

    let cancelled = false;
    setLoading(cachedSlots() == null);
    void loadSlots()
      .then((payload) => {
        if (cancelled) return;
        setSlots(payload);
        setLoadError(null);
        setDate((current) => current ?? firstDayWithASlot(payload.days));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Times could not be loaded just now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      pollAbort.current?.abort();
    };
  }, []);

  function pickSlot(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    setFormError(null);
  }

  function applyDays(days: SlotDay[]) {
    setSlots((current) => (current ? { ...current, days } : current));
    const still = date && time && days.some((day) => day.date === date && day.slots.includes(time));
    if (!still) {
      setTime(null);
      setDate(firstDayWithASlot(days));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date || !time) return;
    const trimmed = email.trim();
    if (trimmed && !EMAIL_RE.test(trimmed)) {
      setEmailError("Enter an email address the invite can reach, or leave it blank.");
      return;
    }
    setEmailError(null);
    setFormError(null);

    const phone = isPhoneBooking();
    const tab = phone ? window.open("about:blank", "_blank") : null;
    setSending(true);
    try {
      const result = await bookSlot({ date, time, email: trimmed || undefined });
      if (!result.ok && result.conflict) {
        tab?.close();
        applyDays(result.days);
        setFormError(result.error);
        return;
      }
      if (!result.ok) {
        tab?.close();
        setFormError(result.error);
        return;
      }

      if (!phone) {
        tab?.close();
        setPhase({ kind: "done", booked: result.booked, viaWhatsApp: false });
        return;
      }

      let openedWhatsApp = false;
      if (tab) {
        tab.location.href = result.booked.whatsapp.url;
        openedWhatsApp = true;
      } else {
        openedWhatsApp = window.open(result.booked.whatsapp.url, "_blank") != null;
      }

      setPhase({ kind: "waiting", booked: result.booked, openedWhatsApp });
      const controller = new AbortController();
      pollAbort.current = controller;
      const confirmed = await pollBookingConfirmed(result.booked.whatsapp.code, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (confirmed.confirmed) {
        setPhase({ kind: "done", booked: result.booked, viaWhatsApp: true });
      } else {
        setPhase({ kind: "expired", booked: result.booked });
      }
    } catch (error) {
      tab?.close();
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const timezone = slots?.timezone;
  const title = "Book a call";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          data-testid="dialog-booking"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-popover-border bg-popover p-6 text-popover-foreground shadow-lg scrollbar-thin data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        >
          <Dialog.Close
            data-testid="button-booking-close"
            className="absolute right-4 top-4 rounded-md border border-transparent p-1 text-muted-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          {phase.kind === "done" ? (
            <DoneView booked={phase.booked} email={email.trim() || null} viaWhatsApp={phase.viaWhatsApp} />
          ) : phase.kind === "waiting" ? (
            <WaitingView booked={phase.booked} openedWhatsApp={phase.openedWhatsApp} />
          ) : phase.kind === "expired" ? (
            <ExpiredView
              booked={phase.booked}
              onRetry={() => {
                setPhase({ kind: "pick" });
                setFormError(null);
                setTime(null);
                void loadSlots({ force: true })
                  .then((payload) => {
                    setSlots(payload);
                    setDate(firstDayWithASlot(payload.days));
                  })
                  .catch((error: unknown) => {
                    setLoadError(error instanceof Error ? error.message : "Times could not be loaded just now.");
                  });
              }}
            />
          ) : (
            <form onSubmit={submit} noValidate>
              <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {descriptionFor(slots, timezone, loading, loadError)}
              </Dialog.Description>

              {loading ? (
                <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking up times that are free.
                </p>
              ) : loadError ? (
                <p role="alert" className="mt-6 text-sm text-destructive">
                  {loadError}
                </p>
              ) : slots ? (
                <div className="mt-6 flex flex-col gap-4">
                  {slots.days.map((day) => (
                    <section key={day.date} aria-labelledby={`booking-day-${day.date}`}>
                      <h3 id={`booking-day-${day.date}`} className="text-sm font-medium">
                        <span>{formatSlotDay(day.date)}</span>
                        {timezone ? (
                          <span className="ml-2 font-normal text-muted-foreground">{timezone}</span>
                        ) : null}
                      </h3>
                      {day.slots.length === 0 ? (
                        <p className="mt-1.5 text-sm text-muted-foreground">Nothing free</p>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {day.slots.map((slot) => {
                            const selected = date === day.date && time === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                data-testid={`button-booking-slot-${day.date}-${slot}`}
                                aria-pressed={selected}
                                className={selected ? BTN_SLOT_SELECTED : BTN_SLOT}
                                onClick={() => pickSlot(day.date, slot)}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              ) : null}

              {slots && !loading && !loadError ? (
                <>
                  <div className="mt-6">
                    <label htmlFor="booking-email" className="mb-1.5 block text-sm font-medium">
                      Email
                    </label>
                    <input
                      id="booking-email"
                      data-testid="input-booking-email"
                      type="email"
                      autoComplete="email"
                      aria-invalid={emailError ? true : undefined}
                      aria-describedby={emailError ? "booking-email-error booking-email-hint" : "booking-email-hint"}
                      className={FIELD}
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (emailError) setEmailError(null);
                      }}
                    />
                    <p id="booking-email-hint" className="mt-1.5 text-xs text-muted-foreground">
                      An email address gets you a calendar invite. Leave it blank and the call is still booked; you just
                      will not get an invite.
                    </p>
                    {emailError ? (
                      <p id="booking-email-error" className="mt-1.5 text-xs text-destructive" role="alert">
                        {emailError}
                      </p>
                    ) : null}
                  </div>

                  {formError ? (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                      {formError}
                    </p>
                  ) : null}

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      data-testid="button-booking-submit"
                      className={BTN_PRIMARY}
                      disabled={sending || !date || !time}
                    >
                      {sending ? <Loader2 className="animate-spin" /> : null}
                      {isPhoneBooking() ? "Book this time in WhatsApp" : "Book this time"}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function descriptionFor(
  slots: SlotsPayload | null,
  timezone: string | undefined,
  loading: boolean,
  loadError: string | null,
): string {
  if (loadError) return "Times could not be loaded, so nothing here can be booked yet.";
  if (loading && !slots) return "Looking up times that are free.";
  if (timezone && slots) {
    return `${slots.slotMinutes} minutes. Times are in ${timezone}.`;
  }
  return "Pick a time that is free.";
}

function firstDayWithASlot(days: SlotDay[]): string | null {
  return days.find((day) => day.slots.length > 0)?.date ?? days[0]?.date ?? null;
}

function DoneView({
  booked,
  email,
  viaWhatsApp,
}: {
  booked: BookedPayload;
  email: string | null;
  viaWhatsApp: boolean;
}) {
  const when = formatBookedWhen(booked.startsAt, booked.timezone);
  return (
    <div>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Check className="h-5 w-5" />
      </div>
      <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">
        {viaWhatsApp ? "Confirmed" : "Booked"}
      </Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-muted-foreground">
        {when}.
      </Dialog.Description>
      {inviteLine(booked, email)}
      {booked.meetUrl ? (
        <p className="mt-3 text-sm">
          <a
            href={booked.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            data-testid="link-booking-meet"
          >
            Google Meet link
          </a>
        </p>
      ) : null}
    </div>
  );
}

function inviteLine(booked: BookedPayload, email: string | null) {
  if (booked.invited && email) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        A calendar invite is on its way to <span className="font-medium text-foreground">{email}</span>.
      </p>
    );
  }
  if (email && !booked.invited) {
    return <p className="mt-3 text-sm text-muted-foreground">The time is booked. No calendar invite was sent.</p>;
  }
  return null;
}

function WaitingView({ booked, openedWhatsApp }: { booked: BookedPayload; openedWhatsApp: boolean }) {
  return (
    <div>
      <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">Send the WhatsApp message</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-muted-foreground">
        {openedWhatsApp
          ? "WhatsApp is open with a message ready. Send it, and this page will show when the booking is confirmed."
          : "Open WhatsApp and send the message. This page will show when the booking is confirmed."}
      </Dialog.Description>
      <p className="mt-3 text-sm text-muted-foreground">
        The message contains the code{" "}
        <code className="rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
          {booked.whatsapp.code}
        </code>
        .
      </p>
      {openedWhatsApp ? null : (
        <p className="mt-4 text-sm">
          <a
            href={booked.whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            data-testid="link-booking-whatsapp"
          >
            Open WhatsApp
          </a>
        </p>
      )}
      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for the message to arrive.
      </p>
    </div>
  );
}

function ExpiredView({ booked, onRetry }: { booked: BookedPayload; onRetry: () => void }) {
  return (
    <div>
      <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight">The code has expired</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-muted-foreground">
        Five minutes passed without a WhatsApp message for{" "}
        <code className="rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
          {booked.whatsapp.code}
        </code>
        . Book again.
      </Dialog.Description>
      <div className="mt-6">
        <button type="button" className={BTN_PRIMARY} onClick={onRetry} data-testid="button-booking-retry">
          Pick another time
        </button>
      </div>
    </div>
  );
}

export default BookingDialog;
