import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Redirect, useLocation, useRoute } from "wouter";

import { ACTION, DISPLAY, META, META_PLAIN, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { useTheme } from "@/hooks/use-theme";
import { PRICES } from "@shared/pricing";
import {
  defaultServices,
  isHouseHost,
  type OperatorPublic,
  type OperatorService,
  type ServiceMode,
} from "@shared/operator";

const LADDER_STORAGE = "operator-ladder";

const FIELD =
  "type-body w-full border-0 border-b border-input bg-transparent py-[var(--s1)] text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type LadderDraft = Record<string, { price: string; buys: string; condition: string }>;

function emptyLadder(): LadderDraft {
  const draft: LadderDraft = {};
  for (const row of PRICES) {
    draft[row.id] = { price: row.price, buys: row.buys, condition: row.condition ?? "" };
  }
  return draft;
}

function readLadder(): LadderDraft {
  const base = emptyLadder();
  try {
    const raw = window.localStorage.getItem(LADDER_STORAGE);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as LadderDraft;
    for (const id of Object.keys(base)) {
      const row = parsed[id];
      if (!row || typeof row !== "object") continue;
      base[id] = {
        price: typeof row.price === "string" ? row.price : base[id].price,
        buys: typeof row.buys === "string" ? row.buys : base[id].buys,
        condition: typeof row.condition === "string" ? row.condition : base[id].condition,
      };
    }
  } catch {
    // A blocked or broken store costs persistence, not the form.
  }
  return base;
}

function writeLadder(draft: LadderDraft): void {
  try {
    window.localStorage.setItem(LADDER_STORAGE, JSON.stringify(draft));
  } catch {
    // Same as read: the numbers stay on screen for this visit.
  }
}

function defaultOrigin(): string {
  if (typeof window === "undefined") return "";
  return isHouseHost(window.location.hostname) ? "" : window.location.origin;
}

export default function Setup() {
  const [onSetup] = useRoute("/setup");
  const [onPartner] = useRoute("/partner");
  const [, navigate] = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [entity, setEntity] = useState("");
  const [termsUrl, setTermsUrl] = useState("");
  const [contact, setContact] = useState("");
  const [origin, setOrigin] = useState(defaultOrigin);
  const [useOwnKey, setUseOwnKey] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [services, setServices] = useState<Record<string, OperatorService>>(() => defaultServices());
  const [doors, setDoors] = useState<OperatorPublic["doors"]>([]);
  const [ladder, setLadder] = useState<LadderDraft>(emptyLadder);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const cabinet = configured || onPartner;

  useEffect(() => {
    const previous = document.title;
    document.title = cabinet ? "Partner cabinet" : "Set up this deployment";
    return () => {
      document.title = previous;
    };
  }, [cabinet]);

  useEffect(() => {
    setLadder(readLadder());
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/operator");
        const payload = (await res.json()) as OperatorPublic & { error?: string };
        if (cancelled) return;
        if (!res.ok || !payload.doors) {
          setError(payload.error ?? "Could not load the operator config.");
          return;
        }
        setConfigured(payload.configured);
        setDoors(payload.doors);
        setServices(payload.services ?? defaultServices());
        setUseOwnKey(payload.model?.useOwnKey ?? true);
        setHasKey(payload.model?.hasKey ?? false);
        if (payload.identity) {
          setDisplayName(payload.identity.displayName);
          setLegalName(payload.identity.legalName);
          setEntity(payload.identity.entity);
          setTermsUrl(payload.identity.termsUrl ?? "");
          setContact(payload.identity.contact ?? "");
        }
        setOrigin(payload.origin || defaultOrigin());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the operator config.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const whiteLabelOnHouse = useMemo(() => {
    const anyWhite = Object.values(services).some((row) => row.offered && row.mode === "white-label");
    return anyWhite && isHouseHost(origin);
  }, [services, origin]);

  function setService(id: string, patch: Partial<OperatorService>) {
    setServices((current) => {
      const row = current[id] ?? { mode: "named" as ServiceMode, offered: true };
      const next = { ...row, ...patch };
      if (patch.mode === "white-label") {
        const door = doors.find((item) => item.id === id);
        if (door && !door.canWhiteLabel) next.mode = "named";
      }
      return { ...current, [id]: next };
    });
  }

  function updateLadder(id: string, patch: Partial<LadderDraft[string]>) {
    setLadder((current) => {
      const next = { ...current, [id]: { ...current[id], ...patch } };
      writeLadder(next);
      return next;
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        identity: {
          displayName,
          legalName,
          entity,
          termsUrl,
          contact,
        },
        services,
        origin,
        model: {
          useOwnKey,
          ...(useOwnKey && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      };
      const res = await fetch("/api/operator", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const payload = JSON.parse(text) as OperatorPublic & { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not save.");
        return;
      }
      setConfigured(true);
      setHasKey(payload.model.hasKey);
      setApiKey("");
      setSaved(true);
      if (onSetup) navigate("/partner", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background text-foreground" data-site-chrome>
        <p className={`${PAGE} ${READ_MUTED} py-[var(--s5)]`}>Opening the setup page.</p>
      </div>
    );
  }

  if (!configured && onPartner) return <Redirect to="/setup" replace />;
  if (configured && onSetup) return <Redirect to="/partner" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground" data-site-chrome>
      <header className="border-b border-border">
        <div className={`${PAGE} flex items-baseline justify-between gap-[var(--s3)] py-[var(--s2)]`}>
          <p className={META}>{cabinet ? displayName || "Cabinet" : "This deployment"}</p>
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            className={`${META} [text-transform:none!important] hover:text-foreground`}
            data-testid="button-setup-theme"
          >
            {nextTheme === "dark" ? "Dark" : "Light"}
            <span className="sr-only"> theme</span>
          </button>
        </div>
      </header>

      <main className={`${PAGE} py-[var(--s5)]`}>
        <h1 className={`${DISPLAY} m-0`} data-testid="text-setup-title">
          {cabinet ? "Partner cabinet" : "Set up this deployment"}
        </h1>
        <p className={`${READ_MUTED} mt-[var(--s3)] max-w-[40rem]`}>
          {cabinet
            ? "A change here is what the next request uses. There is no rebuild and no restart."
            : "One page. Fill this in, save, and this address becomes the cabinet. There is no later install step."}
        </p>

        <form onSubmit={onSubmit} className="mt-[var(--s5)] flex max-w-[40rem] flex-col gap-[var(--s5)]">
          <section>
            <h2 className={`${READ} m-0 font-display font-medium`}>Who you are</h2>
            <p className={`${META_PLAIN} mt-[var(--s2)]`}>
              The trading name is for chrome. The registered name is what a room prints on the
              contract and the invoice, as selectable text.
            </p>
            <div className="mt-[var(--s3)] flex flex-col gap-[var(--s3)]">
              <label className="flex flex-col gap-[var(--s1)]">
                <span className={META}>Display name</span>
                <input
                  className={FIELD}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="organization"
                  required
                  data-testid="input-display-name"
                />
              </label>
              <label className="flex flex-col gap-[var(--s1)]">
                <span className={META}>Legal name</span>
                <input
                  className={FIELD}
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  required
                  data-testid="input-legal-name"
                />
                <span className={META_PLAIN}>Including the legal form, exactly as it should appear on paper.</span>
              </label>
              <label className="flex flex-col gap-[var(--s1)]">
                <span className={META}>Entity</span>
                <textarea
                  className={`${FIELD} min-h-16 resize-y`}
                  value={entity}
                  onChange={(event) => setEntity(event.target.value)}
                  required
                  data-testid="input-entity"
                />
              </label>
              <label className="flex flex-col gap-[var(--s1)]">
                <span className={META}>Terms URL</span>
                <input
                  className={FIELD}
                  value={termsUrl}
                  onChange={(event) => setTermsUrl(event.target.value)}
                  inputMode="url"
                  placeholder="https://"
                  data-testid="input-terms-url"
                />
                <span className={META_PLAIN}>Leave empty if that company has not published terms yet. This page will not borrow ours.</span>
              </label>
              <label className="flex flex-col gap-[var(--s1)]">
                <span className={META}>Contact address</span>
                <input
                  className={FIELD}
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="an email, or the address of a contact page"
                  data-testid="input-contact"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className={`${READ} m-0 font-display font-medium`}>Model key</h2>
            <p className={`${META_PLAIN} mt-[var(--s2)]`}>
              Answers are free on your own OpenAI key: you pay the model provider directly. The key
              already set on this host is the other option, and it puts your visitors' questions on
              that account's bill. The key is stored on this server and is never sent back to this
              page.
            </p>
            <fieldset className="mt-[var(--s3)] flex flex-col gap-[var(--s2)]">
              <legend className="sr-only">Which key answers should use</legend>
              <label className={`${READ} flex items-start gap-[var(--s2)]`}>
                <input
                  type="radio"
                  name="model-key"
                  className="mt-1 accent-primary"
                  checked={useOwnKey}
                  onChange={() => setUseOwnKey(true)}
                  data-testid="radio-own-key"
                />
                <span>Your own key</span>
              </label>
              <label className={`${READ} flex items-start gap-[var(--s2)]`}>
                <input
                  type="radio"
                  name="model-key"
                  className="mt-1 accent-primary"
                  checked={!useOwnKey}
                  onChange={() => setUseOwnKey(false)}
                  data-testid="radio-host-key"
                />
                <span>The key already on this deployment</span>
              </label>
            </fieldset>
            {useOwnKey ? (
              <label className="mt-[var(--s3)] flex flex-col gap-[var(--s1)]">
                <span className={META}>{hasKey ? "Replace the stored key" : "OpenAI API key"}</span>
                <input
                  className={FIELD}
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                  placeholder={hasKey ? "Leave blank to keep the key already stored" : ""}
                  data-testid="input-api-key"
                />
                <span className={META_PLAIN}>
                  {hasKey
                    ? "A key is stored. It is not shown here. Paste a new one only to replace it."
                    : "You can save without a key. The ask panel will then say live answers are not configured, which is true until you add one."}
                </span>
              </label>
            ) : (
              <p className={`${META_PLAIN} mt-[var(--s3)]`}>
                This uses whatever OPENAI_API_KEY the host already has. If that is empty, the ask
                panel will say live answers are not configured.
              </p>
            )}
          </section>

          <section>
            <h2 className={`${READ} m-0 font-display font-medium`}>Services</h2>
            <p className={`${META_PLAIN} mt-[var(--s2)]`}>
              Referral keeps our name, terms and invoice on that row. White label puts yours there
              instead, and only on work you are actually answerable for. Switching a row off leaves
              it in the catalogue as a flag, so switching it back on later is the same flag.
            </p>
            <ul className="mt-[var(--s3)] flex flex-col">
              {doors.map((door) => {
                const row = services[door.id] ?? { mode: "named" as ServiceMode, offered: true };
                return (
                  <li key={door.id} className="border-t border-border py-[var(--s3)] last:border-b">
                    <p className={`${READ} m-0 font-display font-medium`}>{door.headline}</p>
                    <label className={`${READ} mt-[var(--s2)] flex items-center gap-[var(--s2)]`}>
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={row.offered}
                        onChange={(event) => setService(door.id, { offered: event.target.checked })}
                      />
                      <span>Offer this row</span>
                    </label>
                    <fieldset className="mt-[var(--s2)] flex flex-col gap-[var(--s2)]">
                      <legend className="sr-only">How {door.headline} is offered</legend>
                      <label className={`${READ} flex items-start gap-[var(--s2)]`}>
                        <input
                          type="radio"
                          name={`mode-${door.id}`}
                          className="mt-1 accent-primary"
                          checked={row.mode === "named"}
                          onChange={() => setService(door.id, { mode: "named" })}
                        />
                        <span>Referral — our name stays on the row</span>
                      </label>
                      <label className={`${READ} flex items-start gap-[var(--s2)] ${door.canWhiteLabel ? "" : "text-muted-foreground"}`}>
                        <input
                          type="radio"
                          name={`mode-${door.id}`}
                          className="mt-1 accent-primary"
                          checked={row.mode === "white-label"}
                          disabled={!door.canWhiteLabel}
                          onChange={() => setService(door.id, { mode: "white-label" })}
                        />
                        <span>
                          {door.canWhiteLabel
                            ? "White label — your name goes on the row, and you are answerable for the work"
                            : "White label is not available: a room that named you for this work would be naming someone who is not answerable for it"}
                        </span>
                      </label>
                    </fieldset>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className={`${READ} m-0 font-display font-medium`}>Your prices</h2>
            <p className={`${META_PLAIN} mt-[var(--s2)]`}>
              Same ladder shape, in your own words. These stay in this browser. They are not sent to
              the server, and nothing on this page publishes them.
            </p>
            <ul className="mt-[var(--s3)] flex flex-col">
              {PRICES.map((row) => {
                const draft = ladder[row.id] ?? { price: row.price, buys: row.buys, condition: row.condition ?? "" };
                return (
                  <li key={row.id} className="border-t border-border py-[var(--s3)] last:border-b">
                    <p className={META}>{row.id}</p>
                    <label className="mt-[var(--s2)] flex flex-col gap-[var(--s1)]">
                      <span className={META}>Price</span>
                      <input
                        className={FIELD}
                        value={draft.price}
                        onChange={(event) => updateLadder(row.id, { price: event.target.value })}
                      />
                    </label>
                    <label className="mt-[var(--s2)] flex flex-col gap-[var(--s1)]">
                      <span className={META}>What it buys</span>
                      <textarea
                        className={`${FIELD} min-h-16 resize-y`}
                        value={draft.buys}
                        onChange={(event) => updateLadder(row.id, { buys: event.target.value })}
                      />
                    </label>
                    <label className="mt-[var(--s2)] flex flex-col gap-[var(--s1)]">
                      <span className={META}>Condition</span>
                      <textarea
                        className={`${FIELD} min-h-16 resize-y`}
                        value={draft.condition}
                        onChange={(event) => updateLadder(row.id, { condition: event.target.value })}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className={`${READ} m-0 font-display font-medium`}>Address this answers on</h2>
            <p className={`${META_PLAIN} mt-[var(--s2)]`}>
              Your own domain or subdomain. A white-label site on a top-rated.team address would
              still be ours.
            </p>
            <label className="mt-[var(--s3)] flex flex-col gap-[var(--s1)]">
              <span className={META}>Public URL</span>
              <input
                className={FIELD}
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                inputMode="url"
                placeholder="https://rooms.your-domain"
                required
                data-testid="input-origin"
              />
            </label>
            {whiteLabelOnHouse ? (
              <p className={`${READ} mt-[var(--s2)] text-destructive`} data-testid="text-origin-conflict">
                White label is on, and this address is still ours. Change the URL to your domain, or
                offer those rows as referral.
              </p>
            ) : null}
          </section>

          {error ? (
            <p className={`${READ} text-destructive`} data-testid="text-setup-error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className={READ} data-testid="text-setup-saved">
              Saved. The next request uses this config. This page is now the cabinet, at /partner.
            </p>
          ) : null}

          <div>
            <button type="submit" className={ACTION} disabled={saving || whiteLabelOnHouse} data-testid="button-setup-save">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
