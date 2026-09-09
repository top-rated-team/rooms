import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

import {
  bookSlot,
  cachedSlots,
  errorFromBody,
  formatBookedWhen,
  formatSlotDay,
  isPhoneBooking,
  loadSlots,
  parseSlotsPayload,
  pollBookingConfirmed,
  slotsUrl,
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
  const [floorDate, setFloorDate] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState<number | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
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

    let cancelled = false;
    setLoading(cachedSlots() == null);
    void loadSlots()
      .then((payload) => {
        if (cancelled) return;
        const floor = payload.days[0]?.date ?? null;
        const picked = firstDayWithASlot(payload.days);
        setSlots(payload);
        setLoadError(null);
        setFloorDate(floor);
        setDate((current) => current ?? picked);
        setFocusedDate((current) => current ?? picked);
        const origin = parseStamp(picked ?? floor);
        if (origin) {
          setViewYear(origin.year);
          setViewMonth(origin.month);
        }
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
