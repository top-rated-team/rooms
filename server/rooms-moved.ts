/**
 * /rooms, and every room address this site gave out on Top-Rated Team's hosts,
 * sent on to the rooms' new home. See shared/rooms-moved.ts for why they moved,
 * and why AdGrant.AI's hosts are left exactly as they were.
 *
 * A 302 and not a 301: where the rooms live is a setting, and a browser keeps
 * a 301 with no expiry. no-store for the same reason. An old /w/<token> goes
 * to MakeHybrid without its token -- it was a credential here, it is nothing
 * there, and a credential is not something to hand to another host in a URL.
 * One of AdGrant.AI's rooms goes to AdGrant.AI's rooms the same way: they are
 * its own MakeHybrid white label now, on app.adgrant.ai.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { ADGRANT_ROOMS_URL, DEFAULT_HYBRID_ROOMS_URL, ROOMS_PATH, roomsMovedOn } from "@shared/rooms-moved";
import { storage } from "./storage";

/** The door AdGrant.AI's rooms are stamped with. */
const ADGRANT_DOOR = "ad-grants";

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

/** Whether a room was opened through AdGrant.AI's door. */
export function isAdGrantRoom(source: Record<string, string> | null | undefined): boolean {
  return source?.door === ADGRANT_DOOR;
}

/** Where a room with this stamp lives now: AdGrant.AI's white label, or ours. */
export function movedRoomsUrl(source: Record<string, string> | null | undefined): string {
  return isAdGrantRoom(source) ? ADGRANT_ROOMS_URL : hybridRoomsUrl();
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendOn(req: Request, res: Response, next: NextFunction): void {
  if (!roomsMovedOn(req.hostname)) {
    next();
    return;
  }
  noStore(res);
  res.redirect(302, hybridRoomsUrl());
}

export function registerRoomsMoved(app: Express): void {
  app.get(ROOMS_PATH, sendOn);
  app.get("/w", sendOn);
  app.get("/w/:token", (req, res, next) => {
    if (!roomsMovedOn(req.hostname)) {
      next();
      return;
    }
    void (async () => {
      const state = await storage.getWorkspaceByToken(req.params.token).catch(() => null);
      noStore(res);
      res.redirect(302, movedRoomsUrl(state?.workspace.source));
    })().catch(next);
  });
}
