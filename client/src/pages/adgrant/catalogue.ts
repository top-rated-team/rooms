import { useEffect, useState } from "react";

import type { RoomLoginAvailability } from "@shared/api";
import { ADGRANT_IDENTITY, catalogueLegalFacts, type CatalogueDoor } from "@shared/catalogue";
import { adgrantCatalogue } from "@shared/doors";

import { ADGRANT_MOUNT } from "@/components/adgrant/mount";

/**
 * The AdGrant.AI catalogue for this host. Mount is the one the rest of this
 * tree already decided, so a door path cannot disagree with a library path.
 */
export function thisCatalogue() {
  return adgrantCatalogue(null, { mount: ADGRANT_MOUNT }) as CatalogueDoor[];
}

/**
 * EVERY LOOKUP GOES THROUGH THE SAME FILTER AS THE LIST.
 *
 * A hidden row is hidden from a visitor, not from the index page only. This
 * repository has already shipped the other shape once — a list that respected
 * the flag and a route that did not — and a green test certified it. So the
 * filter lives in one place and the finders use it: a door that is not listed
 * has no page, and asking for its address gets the same answer as asking for
 * a service that was never there.
 */
export function listedDoors(): CatalogueDoor[] {
  return thisCatalogue().filter((door) => !door.hidden && door.offered !== false);
}

export function thisDoor(id: string): CatalogueDoor | undefined {
  return listedDoors().find((door) => door.id === id);
}

export function thisDoorBySlug(slug: string): CatalogueDoor | undefined {
  return listedDoors().find((door) => door.slug === slug);
}

export interface LoginWays {
  linkedin: boolean;
  whatsapp: boolean;
  email: boolean;
}

/**
 * Which ways in this deployment really has, asked of the same endpoint the
 * sign-in panel asks. None of the three can be worked out in the browser:
 * LinkedIn depends on an app and on the address its redirect returns to,
 * WhatsApp on the host and a probe, email on mail being configured.
 *
 * `null` until the answer arrives. The legal pages render no sentence about a
 * way in while it is null, because the alternative is asserting a transfer of
 * somebody's data for a tenth of a second and then taking it back.
 */
export function useLoginWays(): LoginWays | null {
  const [ways, setWays] = useState<LoginWays | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/room-login", { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<RoomLoginAvailability>) : null))
      .then((body) => {
        if (cancelled) return;
        setWays(
          body
            ? {
                linkedin: body.linkedin.available,
                whatsapp: body.whatsapp.available,
                email: body.email.available,
              }
            : { linkedin: false, whatsapp: false, email: false },
        );
      })
      .catch(() => {
        if (!cancelled) setWays({ linkedin: false, whatsapp: false, email: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ways;
}

export function thisLegalFacts(login?: LoginWays) {
  return catalogueLegalFacts(thisCatalogue(), ADGRANT_IDENTITY, login);
}

export { ADGRANT_IDENTITY };
