import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

export type AppDatabase = NeonDatabase<typeof schema>;

let client: AppDatabase | null = null;
let attempted = false;

/**
 * Read as a function, not a module constant: `server/index.ts` loads `.env` in
 * its body, which runs after every imported module has already been evaluated.
 */
export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * The Drizzle client, or null when no `DATABASE_URL` is configured. Created on
 * first use and never at import time: an unreachable database must degrade to
 * the in-memory store rather than stop the process from booting.
 */
export function getDb(): AppDatabase | null {
  if (attempted) return client;
  attempted = true;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  try {
    // `ws` is handed to the driver directly rather than assigned to the global
    // neonConfig, so importing this module mutates no shared driver state.
    client = drizzle({ connection: url, schema, ws });
  } catch (error) {
    console.error("[db] DATABASE_URL is set but the client could not be created:", error);
    client = null;
  }

  return client;
}
