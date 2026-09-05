import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with last-one-wins semantics.
 *
 * The `hover-elevate` / `active-elevate-2` utilities are unknown to
 * tailwind-merge, so they pass through untouched — which is what we want: they
 * are additive overlays, never in conflict with a background class.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
