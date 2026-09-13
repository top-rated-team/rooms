import { useEffect, useState } from "react";

import { PeopleList } from "@/components/admin/PeopleList";
import { DISPLAY, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import type { AdminPeopleResponse } from "@shared/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "refused"; line: string; youAre: string[] }
  | { kind: "failed"; line: string }
  | { kind: "ok"; data: AdminPeopleResponse };

export default function Admin() {
  const { resolvedTheme, setTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const previous = document.title;
    document.title = "People";
    const robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex, nofollow, noarchive");
    document.head.appendChild(robots);
    return () => {
      document.title = previous;
      robots.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/people", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        const payload = (await res.json()) as AdminPeopleResponse & {
          error?: string;
          youAre?: string[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setState({
            kind: "refused",
            line: payload.error?.trim() || "This page is only for the person who runs this deployment.",
            youAre: Array.isArray(payload.youAre) ? payload.youAre.filter((line) => typeof line === "string") : [],
          });
          return;
        }
        if (!payload.people || !payload.offeredSignIn) {
          setState({ kind: "failed", line: "The people list did not arrive in a shape this page can read." });
          return;
        }
        setState({ kind: "ok", data: payload });
      } catch {
        if (!cancelled) {
          setState({ kind: "failed", line: "The people list could not be loaded." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground" data-site-chrome data-testid="page-admin">
      <header className="border-b border-border">
        <div className={`${PAGE} flex items-baseline justify-between gap-[var(--s3)] py-[var(--s2)]`}>
          <p className={META}>This deployment</p>
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            className={`${META} [text-transform:none!important] hover:text-foreground`}
            data-testid="button-admin-theme"
          >
            {nextTheme === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
        </div>
      </header>

      <main className={`${PAGE} py-[var(--s5)]`}>
        <h1 className={`${DISPLAY} m-0`} data-testid="text-admin-title">
          People
        </h1>
        <p className={`${READ_MUTED} mt-[var(--s3)] max-w-[40rem]`}>
          Who has signed in on this deployment, by which method, with the contact detail that method
          actually gave us. A room address is a bearer credential. This page does not delete a
          person or cancel a booking.
        </p>

        {state.kind === "loading" ? (
          <p className={`${READ_MUTED} mt-[var(--s5)]`}>Opening the people list.</p>
        ) : null}
        {state.kind === "refused" ? (
          <div className="mt-[var(--s5)]">
            <p className={READ} data-testid="text-admin-refused" role="alert">
              {state.line}
            </p>
            {state.youAre.length > 0 ? (
              <>
                {/* The setup step, on the page where you hit the wall rather
                    than in a server log. It is your own identifier: LinkedIn
                    hands it to every site you sign into, and it opens nothing
                    on its own. */}
                <p className={`${READ} mt-[var(--s3)]`}>
                  To make this account the operator, set this on the deployment and sign in again:
                </p>
                <pre
                  data-testid="text-admin-you-are"
                  className="mt-[var(--s2)] overflow-x-auto rounded-md border border-border bg-muted p-[var(--s2)] text-sm"
                >
                  {state.youAre.join("\n")}
                </pre>
              </>
            ) : null}
          </div>
        ) : null}
        {state.kind === "failed" ? (
          <p className={`${READ} mt-[var(--s5)] text-destructive`} data-testid="text-admin-error" role="alert">
            {state.line}
          </p>
        ) : null}
        {state.kind === "ok" ? (
          <div className="mt-[var(--s5)]">
            <PeopleList data={state.data} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
