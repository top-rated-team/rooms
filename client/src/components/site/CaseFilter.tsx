import { useLocation, useSearch } from "wouter";

import { CaseEntry } from "@/components/site/Cases";
import { META, PAGE } from "@/components/site/doors/quiet";
import { CASES, casesForDoor } from "@shared/cases";
import { DOORS } from "@shared/doors";

/* ---------------------------------------------------------------------------
 * FILTER THE CASES BY SERVICE
 *
 * /case-studies used to dump all twenty-two in one list, with no way to say
 * which service a visitor came for. Every case already carries a derived
 * `doors` array; this control reads it.
 *
 * Options come from DOORS, then only those that actually have a case. Five
 * doors have none, and an option that returns an empty list is a dead end
 * the page put there itself. A new door with a case appears here without an
 * edit to this file.
 *
 * The choice lives in ?service= so a filtered view can be linked and the
 * back button works. Native select: keyboard-operable, and no animation.
 * ------------------------------------------------------------------------- */

/** Doors that have at least one case. Recomputed from the two tables, never listed by hand. */
const DOORS_WITH_CASES = DOORS.filter((door) => casesForDoor(door.id).length > 0);
const ALLOWED = new Set(DOORS_WITH_CASES.map((door) => door.id));

const FIELD =
  "type-body w-full max-w-[62ch] border-0 border-b border-input bg-transparent px-0 py-[var(--s1)] text-foreground focus:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function serviceFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("service");
  if (value && ALLOWED.has(value)) return value;
  return null;
}

function hrefFor(pathname: string, search: string, id: string | null): string {
  const params = new URLSearchParams(search);
  if (id) params.set("service", id);
  else params.delete("service");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function countLine(serviceId: string | null, count: number): string {
  if (!serviceId) {
    return count === 1 ? "1 account." : `${count} accounts.`;
  }
  const door = DOORS_WITH_CASES.find((row) => row.id === serviceId);
  const name = door?.headline ?? serviceId;
  if (count === 1) return `1 account for ${name}.`;
  return `${count} accounts for ${name}.`;
}

export function CaseFilter() {
  const [pathname, navigate] = useLocation();
  const search = useSearch();
  const serviceId = serviceFromSearch(search);
  const entries = serviceId ? casesForDoor(serviceId) : CASES;

  return (
    <section className={`${PAGE} pt-[var(--s5)]`} data-testid="list-cases">
      <div>
        <label htmlFor="cases-service" className={`${META} block`}>
          Service
        </label>
        <select
          id="cases-service"
          name="service"
          data-testid="select-cases-service"
          className={FIELD}
          value={serviceId ?? ""}
          aria-controls="cases-list"
          onChange={(event) => {
            const next = event.target.value;
            navigate(hrefFor(pathname, search, next || null));
          }}
        >
          <option value="" className="bg-background text-foreground">
            {`All · ${CASES.length}`}
          </option>
          {DOORS_WITH_CASES.map((door) => (
            <option key={door.id} value={door.id} className="bg-background text-foreground">
              {door.headline}
            </option>
          ))}
        </select>
        <p
          aria-live="polite"
          aria-atomic="true"
          data-testid="text-cases-count"
          className={`${META} mt-[var(--s2)] tabular-nums`}
        >
          {countLine(serviceId, entries.length)}
        </p>
      </div>

      <div id="cases-list" className="mt-[var(--s4)] flex flex-col gap-[var(--s4)]">
        {entries.map((entry, index) => (
          <CaseEntry key={entry.slug} entry={entry} index={index} />
        ))}
      </div>
    </section>
  );
}

export default CaseFilter;
