import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

import {
  bookSlot,
  bookingTopic,
  cachedSlots,
  CONFIRMED_POLL_MS,
  CONFIRMED_TIMEOUT_MS,
  buildBookBody,
  errorFromBody,
  formatBookedWhen,
  formatSlotDay,
  isPhoneBooking,
  loadSlots,
  parseDays,
  parseSlotsPayload,
  slotsUrl,
  type BookedPayload,
  type SlotDay,
  type SlotsPayload,
} from "@/lib/booking";
import type {
  BookingConfirmedResponse,
  BookingLinkedInAvailability,
  BookingLinkedInSession,
  HoldBookingResponse,
} from "@shared/api";
import { BOOKING_LINKEDIN_SESSION_QUERY } from "@shared/api";
import { isHouseHost } from "@shared/operator";

import { BookingQr } from "./BookingQr";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2";
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2`;
/** The second way to hand over an address, beside the field rather than under it. */
const BTN_SECONDARY = `${BTN_BASE} border border-border bg-transparent text-foreground min-h-9 px-4 py-2`;
const BTN_SLOT =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const BTN_SLOT_SELECTED = `${BTN_SLOT} border-primary bg-primary text-primary-foreground`;
const BTN_ICON =
  `${BTN_BASE} min-h-8 min-w-8 border border-transparent p-1 text-muted-foreground`;

const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

/** Deliberately permissive: a rejected typo costs a booking, not a lead. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const WEEKDAY_LABELS = weekdayLabels();

export interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** True when the page is the OAuth return. The host must open the popup. */
export function bookingLinkedInReturnPending(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(new URLSearchParams(window.location.search).get(BOOKING_LINKEDIN_SESSION_QUERY)?.trim());
}

type Phase =
  | { kind: "pick" }
  | { kind: "waiting"; hold: HoldBookingResponse; openedWhatsApp: boolean }
  | { kind: "done"; booked: BookedPayload; viaWhatsApp: boolean }
  | { kind: "expired"; code: string };

function offerWhatsAppGate(): boolean {
  if (typeof window === "undefined") return false;
  return isHouseHost(window.location.hostname);
}

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
  const [floorDate, setFloorDate] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState<number | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [linkedin, setLinkedin] = useState<BookingLinkedInAvailability | null>(null);
  const [bookerEmail, setBookerEmail] = useState<string | null>(null);
  const pollAbort = useRef<AbortController | null>(null);
  const slotsRef = useRef<SlotsPayload | null>(slots);
  slotsRef.current = slots;
  const byDate = useMemo(() => {
    const map = new Map<string, SlotDay>();
    if (slots) {
      for (const day of slots.days) map.set(day.date, day);
    }
    return map;
  }, [slots]);

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
    setFloorDate(null);
    setViewYear(null);
    setViewMonth(null);
    setFocusedDate(null);
    setMonthLoading(false);
    setMonthError(null);
    setLinkedin(null);
    setBookerEmail(null);

    let cancelled = false;
    setLoading(cachedSlots() == null);

    void loadLinkedInAvailability().then((availability) => {
      if (!cancelled) setLinkedin(availability);
    });

    void (async () => {
      const returning = await takeLinkedInSessionFromUrl();
      try {
        const payload = await loadSlots();
        if (cancelled) return;
        const floor = payload.days[0]?.date ?? null;
        const draft = returning && returning.session ? returning.session.draft : null;
        const picked = draft?.date ?? firstDayWithASlot(payload.days);
        setSlots(payload);
        setLoadError(null);
        setFloorDate(floor);
        setDate(picked);
        setFocusedDate(picked);
        const origin = parseStamp(picked ?? floor);
        if (origin) {
          setViewYear(origin.year);
          setViewMonth(origin.month);
        }
        if (draft?.time) {
          setTime(draft.time);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Times could not be loaded just now.");
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (cancelled || !returning) return;
      if (returning.error || !returning.session) {
        setFormError(returning.error ?? "That sign-in has expired. Pick a time again.");
        return;
      }
      const session = returning.session;
      if (session.booker.email) {
        setBookerEmail(session.booker.email);
        setEmail(session.booker.email);
      }
      const result = session.result;
      if (result.booked) {
        setPhase({
          kind: "done",
          booked: {
            booked: true,
            startsAt: result.startsAt,
            timezone: result.timezone,
            meetUrl: result.meetUrl,
            invited: result.invited,
            whatsapp: { url: "", code: "" },
          },
          viaWhatsApp: false,
        });
        return;
      }
      if ("held" in result && result.held) {
        setPhase({ kind: "waiting", hold: result, openedWhatsApp: false });
        const controller = new AbortController();
        pollAbort.current = controller;
        void pollHoldConfirmed(result.whatsapp.code, controller.signal).then((confirmed) => {
          if (controller.signal.aborted) return;
          if (confirmed.confirmed) {
            setPhase({
              kind: "done",
              booked: bookedFromHold(result, confirmed),
              viaWhatsApp: true,
            });
          } else {
            setPhase({ kind: "expired", code: result.whatsapp.code });
          }
        });
        return;
      }
      if ("days" in result && result.days) applyDays(result.days);
      if ("error" in result && result.error) setFormError(result.error);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      pollAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open || !floorDate || viewYear == null || viewMonth == null) return;
    const window = monthWindow(viewYear, viewMonth, floorDate);
    if (window.count <= 0) return;
    if (rangeIsCovered(slotsRef.current?.days ?? [], window.from, window.count)) return;

    let cancelled = false;
    setMonthLoading(true);
    setMonthError(null);
    void fetchSlotsRange(window.from, window.count)
      .then((payload) => {
        if (cancelled) return;
        setSlots((current) => mergePayload(current, payload));
        setMonthError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMonthError(error instanceof Error ? error.message : "Times for this month could not be loaded just now.");
      })
      .finally(() => {
        if (!cancelled) setMonthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, floorDate, viewYear, viewMonth]);

  useEffect(() => {
    if (!slots || !floorDate || viewYear == null || viewMonth == null) return;
    const prefix = monthPrefix(viewYear, viewMonth);
    if (date && date.startsWith(prefix) && date >= floorDate) return;
    const inMonth = slots.days.filter((day) => day.date.startsWith(prefix) && day.date >= floorDate);
    if (inMonth.length === 0) return;
    const next = firstDayWithASlot(inMonth);
    setDate(next);
    setFocusedDate(next);
    setTime(null);
  }, [slots, floorDate, viewYear, viewMonth, date]);

  function pickSlot(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    setFocusedDate(nextDate);
    setFormError(null);
  }

  function pickDay(nextDate: string) {
    if (floorDate && nextDate < floorDate) return;
    setDate(nextDate);
    setFocusedDate(nextDate);
    setTime((current) => (nextDate === date ? current : null));
    setFormError(null);
    const origin = parseStamp(nextDate);
    if (origin) {
      setViewYear(origin.year);
      setViewMonth(origin.month);
    }
  }

  function applyDays(days: SlotDay[]) {
    setSlots((current) => (current ? { ...current, days: mergeSlotDays(current.days, days) } : current));
    const still = date && time && days.some((day) => day.date === date && day.slots.includes(time));
    if (!still) {
      setTime(null);
      const picked = firstDayWithASlot(days);
      setDate(picked);
      setFocusedDate(picked);
      const origin = parseStamp(picked);
      if (origin) {
        setViewYear(origin.year);
        setViewMonth(origin.month);
      }
    }
  }

  function goMonth(delta: number) {
    if (viewYear == null || viewMonth == null || !floorDate) return;
    if (delta < 0 && !canGoPrevMonth(viewYear, viewMonth, floorDate)) return;
    const next = addMonths(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
    setTime(null);
    setMonthError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date || !time) return;
    const trimmed = email.trim();
    const whatsappGate = offerWhatsAppGate();
    if (trimmed && !EMAIL_RE.test(trimmed)) {
      setEmailError(
        whatsappGate
          ? "Enter an email address the invite can reach, or leave it blank."
          : "Enter an email address the invite can reach.",
      );
      return;
    }
    if (!trimmed && !whatsappGate) {
      setEmailError("Enter an email address. This page does not take a booking without one.");
      return;
    }
    setEmailError(null);
    setFormError(null);

    if (trimmed) {
      setSending(true);
      try {
        const result = await bookSlot({ date, time, email: trimmed });
        if (!result.ok && result.conflict) {
          applyDays(result.days);
          setFormError(result.error);
          return;
        }
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setPhase({ kind: "done", booked: result.booked, viaWhatsApp: false });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFormError("Could not reach the server. Check your connection and try again.");
      } finally {
        setSending(false);
      }
      return;
    }

    const phone = isPhoneBooking();
    const tab = phone ? window.open("about:blank", "_blank") : null;
    setSending(true);
    try {
      const hold = await holdSlot({ date, time });
      if (!hold.ok && hold.conflict) {
        tab?.close();
        applyDays(hold.days);
        setFormError(hold.error);
        return;
      }
      if (!hold.ok) {
        tab?.close();
        setFormError(hold.error);
        return;
      }

      let openedWhatsApp = false;
      if (phone) {
        if (tab) {
          tab.location.href = hold.body.whatsapp.url;
          openedWhatsApp = true;
        } else {
          openedWhatsApp = window.open(hold.body.whatsapp.url, "_blank") != null;
        }
      } else {
        tab?.close();
      }

      setPhase({ kind: "waiting", hold: hold.body, openedWhatsApp });
      const controller = new AbortController();
      pollAbort.current = controller;
      const confirmed = await pollHoldConfirmed(hold.body.whatsapp.code, controller.signal);
      if (controller.signal.aborted) return;
      if (confirmed.confirmed) {
        setPhase({
          kind: "done",
          booked: bookedFromHold(hold.body, confirmed),
          viaWhatsApp: true,
        });
      } else {
        setPhase({ kind: "expired", code: hold.body.whatsapp.code });
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
  const selectedDay = date ? byDate.get(date) : undefined;
  const nothingFreeInWindow = Boolean(
    slots && !monthLoading && slots.days.length > 0 && slots.days.every((day) => day.slots.length === 0),
  );
  const liveText = date
    ? announceDay(date, selectedDay?.slots, selectedDay == null && monthLoading)
    : "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          data-testid="dialog-booking"
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-popover-border bg-popover p-6 text-popover-foreground shadow-lg scrollbar-thin data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 ${
            phase.kind === "pick" ? "max-w-lg md:max-w-2xl" : "max-w-lg"
          }`}
        >
          <Dialog.Close
            data-testid="button-booking-close"
            className="absolute right-4 top-4 rounded-md border border-transparent p-1 text-muted-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          {phase.kind === "done" ? (
            <DoneView booked={phase.booked} email={email.trim() || bookerEmail} viaWhatsApp={phase.viaWhatsApp} />
          ) : phase.kind === "waiting" ? (
            <WaitingView hold={phase.hold} openedWhatsApp={phase.openedWhatsApp} />
          ) : phase.kind === "expired" ? (
            <ExpiredView
              code={phase.code}
              onRetry={() => {
                setPhase({ kind: "pick" });
                setFormError(null);
                setTime(null);
                setMonthError(null);
                void loadSlots({ force: true })
                  .then((payload) => {
                    const floor = payload.days[0]?.date ?? null;
                    const picked = firstDayWithASlot(payload.days);
                    setSlots(payload);
                    setFloorDate(floor);
                    setDate(picked);
                    setFocusedDate(picked);
                    const origin = parseStamp(picked ?? floor);
                    if (origin) {
                      setViewYear(origin.year);
                      setViewMonth(origin.month);
                    }
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
              ) : slots && viewYear != null && viewMonth != null && floorDate ? (
                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(11rem,13rem)] md:items-start md:gap-8">
                  <DayGrid
                    year={viewYear}
                    month={viewMonth}
                    floorDate={floorDate}
                    selectedDate={date}
                    focusedDate={focusedDate ?? date}
                    byDate={byDate}
                    canGoPrev={canGoPrevMonth(viewYear, viewMonth, floorDate)}
                    onPrev={() => goMonth(-1)}
                    onNext={() => goMonth(1)}
                    onSelectDay={pickDay}
                    onFocusDay={setFocusedDate}
                    onPageMonth={goMonth}
                  />
                  <TimesPane
                    date={date}
                    timezone={timezone}
                    slots={selectedDay?.slots}
                    known={selectedDay != null}
                    loading={monthLoading && selectedDay == null}
                    loadError={monthError && selectedDay == null ? monthError : null}
                    nothingFreeInWindow={nothingFreeInWindow}
                    selectedTime={time}
                    onPick={pickSlot}
                  />
                </div>
              ) : null}

              {slots && !loading && !loadError ? (
                <>
                  <div className="sr-only" aria-live="polite" aria-atomic="true">
                    {liveText}
                  </div>

                  {/*
                    ONE LINE: the address, the button that books, and the way
                    to hand over an address without typing it. They belong
                    together because they are one decision — how we reach you —
                    and stacking them read as three separate steps.
                  */}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="booking-email" className="mb-1.5 block text-sm font-medium">
                        Email
                      </label>
                      <input
                        id="booking-email"
                        data-testid="input-booking-email"
                        type="email"
                        autoComplete="email"
                        aria-invalid={emailError ? true : undefined}
                        aria-required={offerWhatsAppGate() ? undefined : true}
                        aria-describedby={emailError ? "booking-email-error booking-email-hint" : "booking-email-hint"}
                        className={FIELD}
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (emailError) setEmailError(null);
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      data-testid="button-booking-submit"
                      className={`${BTN_PRIMARY} shrink-0`}
                      disabled={sending || !date || !time}
                    >
                      {sending ? <Loader2 className="animate-spin" /> : null}
                      Book
                    </button>
                    {linkedin?.available === true && date && time ? (
                      <a
                        href={linkedinStartHref({ date, time })}
                        data-testid="button-booking-linkedin"
                        className={`${BTN_SECONDARY} shrink-0`}
                      >
                        Sign in with LinkedIn
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        data-testid="button-booking-linkedin"
                        title={linkedinButtonTitle(linkedin, Boolean(date && time))}
                        className={`${BTN_SECONDARY} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Sign in with LinkedIn
                      </button>
                    )}
                  </div>
                  <p id="booking-email-hint" className="mt-1.5 text-xs text-muted-foreground">
                    {emailHint(offerWhatsAppGate(), linkedin)}
                  </p>
                  {emailError ? (
                    <p id="booking-email-error" className="mt-1.5 text-xs text-destructive" role="alert">
                      {emailError}
                    </p>
                  ) : null}

                  {formError ? (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                      {formError}
                    </p>
                  ) : null}

                </>
              ) : null}
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DayGrid({
  year,
  month,
  floorDate,
  selectedDate,
  focusedDate,
  byDate,
  canGoPrev,
  onPrev,
  onNext,
  onSelectDay,
  onFocusDay,
  onPageMonth,
}: {
  year: number;
  month: number;
  floorDate: string;
  selectedDate: string | null;
  focusedDate: string | null;
  byDate: Map<string, SlotDay>;
  canGoPrev: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (date: string) => void;
  onFocusDay: (date: string) => void;
  onPageMonth: (delta: number) => void;
}) {
  const rows = monthRows(year, month);
  const focusable = focusableDays(year, month, floorDate);
  const tabStop = (focusedDate && focusable.includes(focusedDate) ? focusedDate : null) ?? selectedDate ?? focusable[0] ?? null;
  const monthName = formatMonthHeading(year, month);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabStop) return;
    const grid = gridRef.current;
    if (!grid) return;
    const active = document.activeElement;
    const inGrid = Boolean(active && grid.contains(active));
    const lostAfterNav =
      !active ||
      active === document.body ||
      active === document.documentElement ||
      (active instanceof HTMLElement && active.getAttribute("role") === "dialog");
    if (!inGrid && !lostAfterNav) return;
    const cell = grid.querySelector(`[data-booking-day="${tabStop}"]`);
    if (cell instanceof HTMLElement && cell !== active) cell.focus();
  }, [tabStop, year, month]);

  function moveTo(next: string) {
    onFocusDay(next);
    onSelectDay(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (tabStop == null) return;
    const key = event.key;
    if (key === "PageUp") {
      event.preventDefault();
      if (canGoPrev) onPageMonth(-1);
      return;
    }
    if (key === "PageDown") {
      event.preventDefault();
      onPageMonth(1);
      return;
    }
    if (key === "Home" || key === "End" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
    } else {
      return;
    }

    const row = rows.find((cells) => cells.includes(tabStop));
    if (key === "Home" && row) {
      const first = row.find((cell) => cell != null && cell >= floorDate);
      if (first) moveTo(first);
      return;
    }
    if (key === "End" && row) {
      const last = [...row].reverse().find((cell) => cell != null && cell >= floorDate);
      if (last) moveTo(last);
      return;
    }

    if (key === "ArrowLeft") {
      const target = addCalendarDays(tabStop, -1);
      if (target >= floorDate) moveTo(target);
      return;
    }
    if (key === "ArrowRight") {
      moveTo(addCalendarDays(tabStop, 1));
      return;
    }
    if (key === "ArrowUp") {
      const target = addCalendarDays(tabStop, -7);
      if (target >= floorDate) moveTo(target);
      else if (focusable[0]) moveTo(focusable[0]);
      return;
    }
    if (key === "ArrowDown") {
      moveTo(addCalendarDays(tabStop, 7));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="button-booking-month-prev"
          className={BTN_ICON}
          disabled={!canGoPrev}
          aria-label="Previous month"
          onClick={onPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 id="booking-month-label" className="text-sm font-medium">
          {monthName}
        </h3>
        <button
          type="button"
          data-testid="button-booking-month-next"
          className={BTN_ICON}
          aria-label="Next month"
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-labelledby="booking-month-label"
        data-testid="grid-booking-days"
        className="mt-3"
        onKeyDown={onKeyDown}
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label, index) => (
            <div key={index} role="columnheader" className="px-0.5 py-1 text-center text-xs text-muted-foreground">
              {label}
            </div>
          ))}
        </div>
        {rows.map((cells, rowIndex) => (
          <div key={rowIndex} role="row" className="grid grid-cols-7">
            {cells.map((cell, cellIndex) => {
              if (cell == null) {
                return <div key={`empty-${rowIndex}-${cellIndex}`} role="gridcell" />;
              }
              const past = cell < floorDate;
              const entry = byDate.get(cell);
              const empty = past || (entry != null && entry.slots.length === 0);
              const selected = selectedDate === cell;
              const isTabStop = tabStop === cell && !past;
              return (
                <button
                  key={cell}
                  type="button"
                  role="gridcell"
                  data-testid={`button-booking-day-${cell}`}
                  data-booking-day={cell}
                  tabIndex={isTabStop ? 0 : -1}
                  aria-selected={selected}
                  aria-disabled={empty ? true : undefined}
                  aria-current={cell === floorDate ? "date" : undefined}
                  aria-label={announceDay(cell, entry?.slots, entry == null && !past)}
                  disabled={past}
                  className={dayClassName({ selected, past, empty })}
                  onClick={() => onSelectDay(cell)}
                >
                  {parseStamp(cell)?.day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimesPane({
  date,
  timezone,
  slots,
  known,
  loading,
  loadError,
  nothingFreeInWindow,
  selectedTime,
  onPick,
}: {
  date: string | null;
  timezone: string | undefined;
  slots: string[] | undefined;
  known: boolean;
  loading: boolean;
  loadError: string | null;
  nothingFreeInWindow: boolean;
  selectedTime: string | null;
  onPick: (date: string, time: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-medium">{date ? formatSlotDay(date) : "Pick a day"}</h3>
        {timezone ? <p className="text-sm font-normal text-muted-foreground">{timezone}</p> : null}
      </div>
      {loadError ? (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {loadError}
        </p>
      ) : loading ? (
        <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Looking up times that are free.
        </p>
      ) : nothingFreeInWindow ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Nothing free in this window.</p>
      ) : !date || (known && (slots?.length ?? 0) === 0) ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Nothing free</p>
      ) : date && slots && slots.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {slots.map((slot) => {
            const selected = selectedTime === slot;
            return (
              <button
                key={slot}
                type="button"
                data-testid={`button-booking-slot-${date}-${slot}`}
                aria-pressed={selected}
                className={selected ? BTN_SLOT_SELECTED : BTN_SLOT}
                onClick={() => onPick(date, slot)}
              >
                {slot}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Looking up times that are free.</p>
      )}
    </div>
  );
}

function dayClassName({ selected, past, empty }: { selected: boolean; past: boolean; empty: boolean }): string {
  if (selected) {
    return "m-0.5 min-h-9 w-[calc(100%-0.25rem)] rounded-md bg-primary text-sm tabular-nums text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  }
  if (past) {
    return "m-0.5 min-h-9 w-[calc(100%-0.25rem)] rounded-md text-sm tabular-nums text-muted-foreground opacity-40";
  }
  if (empty) {
    return "m-0.5 min-h-9 w-[calc(100%-0.25rem)] rounded-md text-sm tabular-nums text-muted-foreground hover-elevate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  }
  return "m-0.5 min-h-9 w-[calc(100%-0.25rem)] rounded-md text-sm tabular-nums text-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
}

function emailHint(whatsappGate: boolean, linkedin: BookingLinkedInAvailability | null): string {
  const signInOn = linkedin?.available === true;
  if (whatsappGate) {
    if (signInOn) {
      return "An address gets you a calendar invite and any reminder. Sign in with LinkedIn does the same without typing it. With neither, the slot is held for five minutes while you send a WhatsApp message. The call is booked only after that message arrives.";
    }
    return "An address gets you a calendar invite and any reminder. With neither, the slot is held for five minutes while you send a WhatsApp message. The call is booked only after that message arrives.";
  }
  if (signInOn) {
    return "An address is required — type it, or sign in with LinkedIn. This page does not take a booking without one.";
  }
  return "An address is required. This page does not take a booking without one.";
}

function linkedinButtonTitle(
  linkedin: BookingLinkedInAvailability | null,
  hasPick: boolean,
): string | undefined {
  if (linkedin && !linkedin.available) return linkedin.unavailableLine;
  if (linkedin?.available === true && !hasPick) return "Pick a day and a time first.";
  return undefined;
}

function linkedinStartHref(input: { date: string; time: string }): string {
  const params = new URLSearchParams({
    date: input.date,
    time: input.time,
    name: "Visitor",
    topic: bookingTopic(),
    return: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });
  return `/api/booking/linkedin?${params.toString()}`;
}

async function loadLinkedInAvailability(): Promise<BookingLinkedInAvailability | null> {
  try {
    const res = await fetch("/api/booking/linkedin", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const text = await res.text();
    const raw = text ? (JSON.parse(text) as unknown) : null;
    return parseLinkedInAvailability(raw);
  } catch {
    return null;
  }
}

function parseLinkedInAvailability(value: unknown): BookingLinkedInAvailability | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.available === true) return { available: true };
  if (record.available === false && typeof record.unavailableLine === "string") {
    return { available: false, unavailableLine: record.unavailableLine };
  }
  return null;
}

async function takeLinkedInSessionFromUrl(): Promise<
  { session: BookingLinkedInSession; error: null } | { session: null; error: string } | null
> {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const id = url.searchParams.get(BOOKING_LINKEDIN_SESSION_QUERY)?.trim() ?? "";
  if (!id) return null;
  url.searchParams.delete(BOOKING_LINKEDIN_SESSION_QUERY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, "", next || "/");

  try {
    const res = await fetch(`/api/booking/linkedin?session=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const text = await res.text();
    const raw = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      return {
        session: null,
        error: errorFromBody(raw, "That sign-in has expired. Pick a time again."),
      };
    }
    const session = parseLinkedInSession(raw);
    if (!session) {
      return { session: null, error: "That sign-in could not be read. Pick a time again." };
    }
    return { session, error: null };
  } catch {
    return { session: null, error: "Could not reach the server. Check your connection and try again." };
  }
}

function parseLinkedInSession(value: unknown): BookingLinkedInSession | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.draft !== "object" || record.draft === null) return null;
  const draft = record.draft as Record<string, unknown>;
  if (
    typeof draft.date !== "string" ||
    typeof draft.time !== "string" ||
    typeof draft.name !== "string" ||
    typeof draft.topic !== "string"
  ) {
    return null;
  }
  if (typeof record.booker !== "object" || record.booker === null) return null;
  const booker = record.booker as Record<string, unknown>;
  if (
    (booker.name !== null && typeof booker.name !== "string") ||
    (booker.email !== null && typeof booker.email !== "string") ||
    (booker.profileUrl !== null && typeof booker.profileUrl !== "string")
  ) {
    return null;
  }
  if (typeof record.result !== "object" || record.result === null) return null;
  const result = record.result as BookingLinkedInSession["result"];
  return {
    draft: { date: draft.date, time: draft.time, name: draft.name, topic: draft.topic },
    booker: {
      name: typeof booker.name === "string" ? booker.name : null,
      email: typeof booker.email === "string" ? booker.email : null,
      profileUrl: typeof booker.profileUrl === "string" ? booker.profileUrl : null,
    },
    result,
  };
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

function announceDay(date: string, slots: string[] | undefined, pending: boolean): string {
  const when = formatSlotDayLong(date);
  if (pending) return `${when}, looking up times that are free`;
  const count = slots?.length ?? 0;
  if (count === 0) return `${when}, nothing free`;
  if (count === 1) return `${when}, 1 time free`;
  return `${when}, ${count} times free`;
}

function mergePayload(current: SlotsPayload | null, incoming: SlotsPayload): SlotsPayload {
  if (!current) return incoming;
  return {
    timezone: incoming.timezone,
    slotMinutes: incoming.slotMinutes,
    days: mergeSlotDays(current.days, incoming.days),
  };
}

function mergeSlotDays(current: SlotDay[], incoming: SlotDay[]): SlotDay[] {
  const map = new Map<string, SlotDay>();
  for (const day of current) map.set(day.date, day);
  for (const day of incoming) map.set(day.date, day);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSlotsRange(from: string, days: number): Promise<SlotsPayload> {
  let res: Response;
  try {
    res = await fetch(slotsUrl(from, days), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    if (res.ok) throw new Error("The server returned a response that was not JSON.");
  }
  if (!res.ok) {
    throw new Error(errorFromBody(body, "Times could not be loaded just now."));
  }
  return parseSlotsPayload(body);
}

function rangeIsCovered(days: SlotDay[], from: string, count: number): boolean {
  const have = new Set(days.map((day) => day.date));
  for (let i = 0; i < count; i += 1) {
    if (!have.has(addCalendarDays(from, i))) return false;
  }
  return true;
}

function monthWindow(year: number, month: number, floor: string): { from: string; count: number } {
  const first = stamp(year, month, 1);
  const last = stamp(year, month, daysInMonth(year, month));
  const from = first < floor ? floor : first;
  if (from > last) return { from, count: 0 };
  return { from, count: diffDays(from, last) + 1 };
}

function canGoPrevMonth(year: number, month: number, floor: string): boolean {
  const prev = addMonths(year, month, -1);
  const last = stamp(prev.year, prev.month, daysInMonth(prev.year, prev.month));
  return last >= floor;
}

function monthRows(year: number, month: number): (string | null)[][] {
  const count = daysInMonth(year, month);
  const lead = weekdayMonday0(stamp(year, month, 1));
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(stamp(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function focusableDays(year: number, month: number, floor: string): string[] {
  const count = daysInMonth(year, month);
  const out: string[] = [];
  for (let day = 1; day <= count; day += 1) {
    const value = stamp(year, month, day);
    if (value >= floor) out.push(value);
  }
  return out;
}

function weekdayLabels(): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2026, 0, 5 + index)),
  );
}

function formatMonthHeading(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(year, month - 1, 1),
  );
}

function formatSlotDayLong(date: string): string {
  const parsed = parseStamp(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

function parseStamp(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { year, month, day };
}

function stamp(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthPrefix(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function utcNoon(date: string): number {
  const parsed = parseStamp(date);
  if (!parsed) return Number.NaN;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0);
}

function addCalendarDays(date: string, delta: number): string {
  const ms = utcNoon(date) + delta * 86_400_000;
  const next = new Date(ms);
  return stamp(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function diffDays(from: string, to: string): number {
  return Math.round((utcNoon(to) - utcNoon(from)) / 86_400_000);
}

function weekdayMonday0(date: string): number {
  return (new Date(utcNoon(date)).getUTCDay() + 6) % 7;
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
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Check className="h-5 w-5" />
      </div>
      <Dialog.Title className="px-8 text-xl font-semibold tracking-tight">
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

/* Borrowed verbatim from the login panel in RoomMenu.tsx, so the two look
   like one product. type-note carries the size; [text-transform:none] is
   needed because .type-note uppercases by default in the frozen index.css. */
const DIALOG_COPY = "type-note [text-transform:none] text-foreground";
const DIALOG_HEADING = "type-note [text-transform:none] font-medium text-foreground";

function WaitingView({ hold, openedWhatsApp }: { hold: HoldBookingResponse; openedWhatsApp: boolean }) {
  const phone = isPhoneBooking();
  return (
    <div className="text-center">
      {/* The same type as the login panel two clicks away, on the owner's
          instruction: this used to be a bold sans title over grey body text
          and that one is quiet, so the two read as different products. Still
          centred — that part he asked to keep. */}
      <Dialog.Title className={`px-8 ${DIALOG_HEADING}`}>Send the WhatsApp message</Dialog.Title>
      <Dialog.Description className={`mx-auto mt-[var(--s2)] max-w-[42ch] ${DIALOG_COPY}`}>
        {openedWhatsApp
          ? "WhatsApp is open with a message ready. Send it. The call is booked only after that message arrives."
          : phone
            ? "Open WhatsApp and send the message. The call is booked only after that message arrives."
            : "Scan this code or click it. Both open the same WhatsApp message. The call is booked only after that message arrives."}
      </Dialog.Description>
      <p className={`mt-[var(--s2)] ${DIALOG_COPY}`}>
        The message contains the code{" "}
        <code className="rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
          {hold.whatsapp.code}
        </code>
      </p>
      {phone ? (
        openedWhatsApp ? null : (
          <p className="mt-4 text-sm">
            <a
              href={hold.whatsapp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              data-testid="link-booking-whatsapp"
            >
              Open WhatsApp
            </a>
          </p>
        )
      ) : (
        <div className="mt-[var(--s3)] flex justify-center">
          <BookingQr url={hold.whatsapp.url} />
        </div>
      )}
      <p className={`mt-[var(--s3)] flex items-center justify-center gap-[var(--s1)] ${DIALOG_COPY}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for the WhatsApp message. Nothing is booked yet.
      </p>
    </div>
  );
}

function ExpiredView({ code, onRetry }: { code: string; onRetry: () => void }) {
  return (
    <div className="text-center">
      <Dialog.Title className="px-8 text-xl font-semibold tracking-tight">Nothing was booked</Dialog.Title>
      <Dialog.Description className="mx-auto mt-2 max-w-[42ch] text-sm text-muted-foreground">
        Five minutes passed without a WhatsApp message for{" "}
        <code className="rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
          {code}
        </code>{" "}
        — the slot is free again.
      </Dialog.Description>
      <div className="mt-6 flex justify-center">
        <button type="button" className={BTN_PRIMARY} onClick={onRetry} data-testid="button-booking-retry">
          Pick another time
        </button>
      </div>
    </div>
  );
}

async function holdSlot(input: { date: string; time: string }): Promise<
  | { ok: true; body: HoldBookingResponse }
  | { ok: false; conflict: true; error: string; days: SlotDay[] }
  | { ok: false; conflict: false; error: string }
> {
  let res: Response;
  try {
    res = await fetch("/api/booking", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(buildBookBody(input)),
    });
  } catch {
    return {
      ok: false,
      conflict: false,
      error: "Could not reach the server. Check your connection and try again.",
    };
  }

  let raw: unknown = null;
  try {
    const text = await res.text();
    raw = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    if (res.ok) {
      return { ok: false, conflict: false, error: "The server returned a response that was not JSON." };
    }
  }

  if (res.status === 409) {
    const days = parseDays(raw && typeof raw === "object" ? (raw as { days?: unknown }).days : undefined);
    return {
      ok: false,
      conflict: true,
      error: errorFromBody(raw, "That time has just been taken. Here is what is still free."),
      days: days ?? [],
    };
  }

  if (!res.ok) {
    return { ok: false, conflict: false, error: errorFromBody(raw, "That time could not be held.") };
  }

  const body = parseHoldPayload(raw);
  if (!body) {
    return { ok: false, conflict: false, error: "The server did not hold the slot." };
  }
  return { ok: true, body };
}

function parseHoldPayload(value: unknown): HoldBookingResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.booked !== false || record.held !== true) return null;
  if (typeof record.startsAt !== "string" || typeof record.timezone !== "string") return null;
  if (record.meetUrl !== null || record.invited !== false) return null;
  if (typeof record.whatsapp !== "object" || record.whatsapp === null) return null;
  const whatsapp = record.whatsapp as Record<string, unknown>;
  if (typeof whatsapp.url !== "string" || typeof whatsapp.code !== "string") return null;
  if (typeof record.expiresAt !== "string") return null;
  return {
    booked: false,
    held: true,
    startsAt: record.startsAt,
    timezone: record.timezone,
    meetUrl: null,
    invited: false,
    whatsapp: { url: whatsapp.url, code: whatsapp.code },
    expiresAt: record.expiresAt,
  };
}

function parseHoldConfirmed(value: unknown): BookingConfirmedResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.confirmed === true) {
    if (typeof record.at !== "string") return null;
    const meetUrl = record.meetUrl === null || record.meetUrl === undefined ? null : record.meetUrl;
    if (meetUrl !== null && typeof meetUrl !== "string") return null;
    return {
      confirmed: true,
      at: record.at,
      meetUrl,
      startsAt: typeof record.startsAt === "string" ? record.startsAt : undefined,
      timezone: typeof record.timezone === "string" ? record.timezone : undefined,
      invited: typeof record.invited === "boolean" ? record.invited : undefined,
    };
  }
  if (record.confirmed === false) {
    return { confirmed: false, expired: record.expired === true };
  }
  return null;
}

async function pollHoldConfirmed(code: string, signal: AbortSignal): Promise<BookingConfirmedResponse> {
  const deadline = Date.now() + CONFIRMED_TIMEOUT_MS;
  while (!signal.aborted) {
    try {
      const res = await fetch(`/api/booking/confirmed?code=${encodeURIComponent(code)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        signal,
      });
      const text = await res.text();
      const raw = text ? (JSON.parse(text) as unknown) : null;
      const parsed = parseHoldConfirmed(raw);
      if (parsed && parsed.confirmed) return parsed;
      if (parsed && !parsed.confirmed && parsed.expired) return parsed;
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
    if (Date.now() >= deadline) return { confirmed: false, expired: true };
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(resolve, CONFIRMED_POLL_MS);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  throw new DOMException("Aborted", "AbortError");
}

function bookedFromHold(
  hold: HoldBookingResponse,
  confirmed: Extract<BookingConfirmedResponse, { confirmed: true }>,
): BookedPayload {
  return {
    booked: true,
    startsAt: confirmed.startsAt ?? hold.startsAt,
    timezone: confirmed.timezone ?? hold.timezone,
    meetUrl: confirmed.meetUrl ?? null,
    invited: confirmed.invited ?? false,
    whatsapp: hold.whatsapp,
  };
}

export default BookingDialog;
