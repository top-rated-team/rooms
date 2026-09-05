import { setInterval } from "node:timers";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimitOptions {
  /** Length of the window the allowance refills over. */
  windowMs: number;
  /** Requests permitted per window, per IP. */
  max: number;
  message?: string;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const SWEEP_INTERVAL_MS = 5 * 60_000;
const DEFAULT_MESSAGE = "Too many requests. Wait a moment and try again.";

/**
 * Dependency-free token bucket, per process and per IP. Continuous refill
 * rather than a fixed window, so a visitor who pauses is not punished for a
 * burst that happened to straddle a window boundary.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const { windowMs, max } = options;
  const message = options.message ?? DEFAULT_MESSAGE;
  const refillPerMs = max / windowMs;
  const buckets = new Map<string, Bucket>();

  // A fully refilled bucket carries no information, so dropping it is free and
  // keeps the map from growing with every IP that ever visited.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) * refillPerMs >= max) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: max, updatedAt: now };

    bucket.tokens = Math.min(max, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      const waitMs = (1 - bucket.tokens) / refillPerMs;
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(waitMs / 1000))));
      res.status(429).json({ error: message });
      return;
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
