/**
 * /rooms, and every room address this site ever gave out, sent on to the
 * rooms' new home. See shared/rooms-moved.ts for why they moved.
 *
 * A 302 and not a 301: where the rooms live is a setting, and a browser keeps
 * a 301 with no expiry. no-store for the same reason. The old /w/<token>
 * addresses go to the same place without their token -- it was a credential
 * here, it is nothing there, and a credential is not something to hand to
 * another host in a URL.
 */
import type { Express, Request, Response } from "express";
import { DEFAULT_HYBRID_ROOMS_URL, ROOMS_PATH } from "@shared/rooms-moved";

/** HYBRID_ROOMS_URL when it is an https address, and the white label's own host otherwise. */
export function hybridRoomsUrl(): string {
  const raw = process.env.HYBRID_ROOMS_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") return url.toString();
    } catch {
      /* Not an address. The default is better than a redirect to nowhere. */
    }
    console.warn("[rooms] HYBRID_ROOMS_URL is not an https address; sending rooms to the default instead.");
  }
  return DEFAULT_HYBRID_ROOMS_URL;
}

function sendOn(_req: Request, res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, hybridRoomsUrl());
}

export function registerRoomsMoved(app: Express): void {
  app.get(ROOMS_PATH, sendOn);
  app.get("/w", sendOn);
  app.get("/w/:token", sendOn);
}
