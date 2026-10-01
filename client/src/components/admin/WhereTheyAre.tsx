import { useEffect, useId, useRef, useState } from "react";

import type { CitySearchResponse, ZoneLookupResponse } from "@shared/api";
import { clockName, isFreeMailDomain, isTimeZone, zonePhrase } from "@shared/time-zones";

/**
 * "Where they are", on the widget page: one field. Type their town and pick
 * it — the town brings its own time zone, and the email names the town
 * ("Eastern Time (Smalltown, PA, EDT)"). Type their website or company
 * instead and it is looked up: the address the site prints, or the
 * company's headquarters (server/booking/zone-lookup.ts). An address at a
 * company's own domain is looked up the moment it is typed.
 */

export interface KnownPlace {
  zone: string;
  /** Their town, as the email names it: "Smalltown, PA". */
  place?: string;
  /** How it came to be known, said under the field: "Found on acme.org." */
  how?: string;
}

export interface WhereTheyAreProps {
  /** The recipient's address, lower-cased, or null until there is one. */
  address: string | null;
  /** What is known now, and where that came from. */
  known: KnownPlace & { source: "remembered" | "guessed" | "own"; domain?: string };
  onChoose: (choice: Required<Pick<KnownPlace, "zone" | "how">> & { place?: string }) => void;
  labelClassName: string;
  fieldClassName: string;
}

type City = CitySearchResponse["cities"][number];

const FIND = "find" as const;

export function WhereTheyAre({ address, known, onChoose, labelClassName, fieldClassName }: WhereTheyAreProps) {
  const [text, setText] = useState(known.place ?? "");
  const [editing, setEditing] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const listId = useId();
  const inputId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* A new person: their own place, and nothing typed for the last one. */
  useEffect(() => {
    setText(known.place ?? "");
    setEditing(false);
    setCities([]);
    setFailed(null);
    /* Only when the person changes: `known` changes as they are found. */
  }, [address]);

  /* What another way found (a lookup as the address was typed) shows in the field. */
  useEffect(() => {
    if (!editing) setText(known.place ?? "");
  }, [known.place, editing]);

  /* Towns as one types: from the server's list, never a geocoder per keystroke. */
  useEffect(() => {
    const query = text.trim();
    if (!editing || query.length < 2) {
      setCities([]);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/city-search?${new URLSearchParams({ q: query })}`, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          signal: ac.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as CitySearchResponse;
        setCities(Array.isArray(body.cities) ? body.cities.filter((city) => isTimeZone(city.zone)) : []);
        setHighlight(0);
      } catch {
        /* Typing on; the next keystroke asks again. */
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [text, editing]);

  async function lookUp(query: string, quiet: boolean) {
    if (!address) return;
    setLooking(true);
    setFailed(null);
    try {
      const res = await fetch(`/api/admin/zone-lookup?${new URLSearchParams({ q: query })}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => ({ found: false }))) as ZoneLookupResponse & { error?: string };
      if (!res.ok || !body.found || !isTimeZone(body.zone)) {
        if (!quiet) {
          setFailed(
            !res.ok
              ? body.error?.trim() || "That could not be looked up just now."
              : `Nothing found for “${query}”. Type their town instead.`,
          );
        }
        return;
      }
      const how = body.source === "website" && body.site ? `Found on ${body.site}.` : `Found ${body.place} (${body.source}).`;
      onChoose({ zone: body.zone, ...(body.city ? { place: body.city } : {}), how });
      setEditing(false);
      setText(body.city ?? "");
    } catch {
      if (!quiet) setFailed("That could not be looked up just now.");
    } finally {
      setLooking(false);
    }
  }

  /* AN ADDRESS AT A COMPANY'S OWN DOMAIN NAMES ITS WEBSITE, and the website
     usually prints where it is: looked up as soon as the address is there,
     when nothing else says where they are. Not for gmail.com and the like. */
  useEffect(() => {
    if (!address || known.source !== "own") return;
    const domain = address.slice(address.lastIndexOf("@") + 1);
    if (!domain || isFreeMailDomain(domain)) return;
    void lookUp(domain, true);
    /* Once per address. */
  }, [address]);

  const query = text.trim();
  const offerFind = editing && query.length >= 3;
  const options: (City | typeof FIND)[] = [...(editing ? cities : []), ...(offerFind ? [FIND] : [])];
  const open = editing && options.length > 0;

  function choose(option: City | typeof FIND) {
    if (option === FIND) {
      void lookUp(query, false);
      return;
    }
    onChoose({ zone: option.zone, place: option.place, how: "Picked from the list." });
    setText(option.place);
    setEditing(false);
    setCities([]);
  }

  const now = Date.now();
  const status = !address
    ? "Put the recipient's address in first."
    : looking
      ? "Looking up where they are."
      : failed ??
        `Times in the email: ${zonePhrase(known.zone, now, known.place)}. ${
          known.source === "remembered"
            ? known.how ?? "Kept for this address."
            : known.source === "guessed"
              ? `Guessed from the ${known.domain} address; type their town if they are elsewhere.`
              : "Nothing says where they are, so this is your own zone: type their town, or their website or company."
        }`;

  return (
    <div className="relative block sm:col-span-3">
      <label htmlFor={inputId} className={labelClassName}>
        Where they are
      </label>
      <input
        id={inputId}
        className={fieldClassName}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        value={text}
        disabled={!address}
        placeholder="Their town — or their website or company"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setText(event.target.value);
          setEditing(true);
          setFailed(null);
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
        }}
        onBlur={() => {
          /* After a click on a suggestion has landed. */
          closeTimer.current = setTimeout(() => setEditing(false), 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && open) {
            event.preventDefault();
            setHighlight((n) => Math.min(options.length - 1, n + 1));
          } else if (event.key === "ArrowUp" && open) {
            event.preventDefault();
            setHighlight((n) => Math.max(0, n - 1));
          } else if (event.key === "Escape") {
            setEditing(false);
            setText(known.place ?? "");
          } else if (event.key === "Enter") {
            event.preventDefault();
            /* The highlighted line: a town, or "Find" for a website or company. */
            const pick = open ? options[highlight] : undefined;
            if (pick) choose(pick);
            else if (editing && query.length >= 2) void lookUp(query, false);
          }
        }}
        data-testid="input-widget-where"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-background py-1 text-sm shadow-md"
          data-testid="list-widget-where"
        >
          {options.map((option, index) => (
            <li
              key={option === FIND ? "find" : `${option.label}-${option.zone}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={`cursor-pointer px-3 py-1.5 ${index === highlight ? "bg-muted" : ""}`}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              data-testid={option === FIND ? "option-widget-where-find" : "option-widget-where-city"}
            >
              {option === FIND ? (
                <span>
                  Find <span className="text-foreground">“{query}”</span> from their website or company
                </span>
              ) : (
                <span>
                  {option.label}
                  <span className="text-muted-foreground"> · {clockName(option.zone, now)}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <span
        className={`mt-1.5 block text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}
        aria-live="polite"
        data-testid="text-widget-where"
      >
        {status}
      </span>
    </div>
  );
}
