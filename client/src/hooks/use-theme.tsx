import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Light/dark switching, matching top-rated.team: the choice is stored under
 * "tr-theme" and applied by toggling the `dark` class on <html>.
 *
 * client/index.html runs a tiny inline script that stamps that class before the
 * first paint. This provider therefore *reads* the class as its starting point
 * instead of assuming light — otherwise a dark-mode visitor gets a white flash
 * on every load.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Must stay in sync with the inline no-flash script in client/index.html. */
const STORAGE_KEY = "tr-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  /** What the visitor chose, including "system". */
  theme: Theme;
  /** What is actually painted right now, with "system" already resolved. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage can throw outright in private mode or with cookies blocked.
  }
  return "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function appliedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(appliedTheme);

  useEffect(() => {
    const next = resolve(theme);
    document.documentElement.classList.toggle("dark", next === "dark");
    setResolvedTheme(next);
  }, [theme]);

  // Only "system" follows the OS; an explicit choice must survive the OS flipping.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next: ResolvedTheme = media.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      setResolvedTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A blocked store costs persistence, not the switch itself.
    }
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
