import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";

import {
  ADGRANT_TEMPLATE_FILES_PURPOSE_LINE,
  ADGRANT_TEMPLATE_FILES_ROOM_LINE,
  type AdGrantTemplateFileKind,
  type AdGrantTemplateFilesResponse,
  type RoomSession,
} from "@shared/api";
import { TEMPLATES, type AdGrantTemplate } from "@shared/adgrant";
import { ACTION, ACTION_QUIET, DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { RoomMenu } from "@/components/site/RoomMenu";
import { Meta } from "@/components/adgrant/Meta";
import { Missing } from "@/components/adgrant/Missing";
import { leafPath, sectionPath } from "@/components/adgrant/links";
import { SECTION_BY_SEGMENT } from "@/components/adgrant/sections";
import { thisDoor } from "@/pages/adgrant/catalogue";
import { ApiError, apiRequest } from "@/lib/apiRequest";

const SECTION = SECTION_BY_SEGMENT.templates;
const GRANT_DOOR = thisDoor("ad-grants");
const BY_SLUG: Record<string, AdGrantTemplate> = Object.fromEntries(
  TEMPLATES.map((template) => [template.slug, template]),
);

const SESSION_EVENT = "room-session";

const COUNT_KIND: { kind: AdGrantTemplateFileKind; label: string; stat: keyof AdGrantTemplate["stats"] }[] = [
  { kind: "campaigns", label: "campaigns", stat: "campaigns" },
  { kind: "ad-groups", label: "ad groups", stat: "adGroups" },
  { kind: "keywords", label: "keywords", stat: "keywords" },
  { kind: "ads", label: "ads", stat: "ads" },
  { kind: "sitelinks", label: "sitelinks", stat: "sitelinks" },
  { kind: "callouts", label: "callouts", stat: "callouts" },
  { kind: "structured-snippets", label: "structured snippets", stat: "structuredSnippets" },
];

function useRoomSession(): RoomSession {
  const [session, setSession] = useState<RoomSession>({ signedIn: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/session", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        const next = res.ok ? ((await res.json()) as RoomSession) : { signedIn: false as const };
        if (!cancelled) setSession(next);
      } catch {
        if (!cancelled) setSession({ signedIn: false });
      }
    };
    void load();
    const onSession = () => void load();
    window.addEventListener(SESSION_EVENT, onSession);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EVENT, onSession);
    };
  }, []);

  return session;
}

function fileTestId(kind: AdGrantTemplateFileKind): string {
  if (kind === "editor") return "link-adgrant-template-editor";
  if (kind === "assets") return "link-adgrant-template-assets";
  return `link-adgrant-template-${kind}`;
}

function TemplateFiles({
  result,
  counts,
}: {
  result: AdGrantTemplateFilesResponse;
  counts: { kind: AdGrantTemplateFileKind; label: string; value: number }[];
}) {
  /*
   * Created IN the effect, not in a useMemo the effect then cleans up after.
   * StrictMode mounts an effect, runs its cleanup, and mounts it again, so
   * the memo's URLs were revoked on that first teardown and never rebuilt —
   * the memo had not changed, so it did not re-run. The links then pointed at
   * revoked blobs and downloading did nothing, in development and in any
   * future double-mount. Owning both halves in one effect makes the pair
   * impossible to get out of step.
   */
  const [hrefs, setHrefs] = useState<{ file: AdGrantTemplateFilesResponse["files"][number]; href: string }[]>([]);

  useEffect(() => {
    const made = result.files.map((file) => ({
      file,
      href: URL.createObjectURL(new Blob([file.body], { type: file.mime })),
    }));
    setHrefs(made);
    return () => {
      for (const item of made) URL.revokeObjectURL(item.href);
    };
  }, [result]);

  const byKind = new Map(hrefs.map((item) => [item.file.kind, item]));
  const listed = counts.filter((row) => byKind.has(row.kind));
  const editor = byKind.get("editor");

  return (
    <div
      className="mt-[var(--s5)] max-w-[46ch]"
      role="status"
      aria-live="polite"
      data-testid="block-adgrant-template-files"
    >
      <p className={READ}>{result.pausedLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{result.destinationLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{result.uploadLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
        Each file is imported on its own in Google Ads Editor, under Account then Import. The combined file is the same
        import with the row types together.
      </p>

      <ol className="mt-[var(--s4)] max-w-[46ch]">
        {listed.map((row, index) => {
          const item = byKind.get(row.kind);
          if (!item) return null;
          return (
            <li
              key={row.kind}
              className="grid items-baseline gap-x-[var(--s3)] border-t border-border py-[var(--s2)] last:border-b lg:grid-cols-[3rem_minmax(0,1fr)_auto]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <a
                  href={item.href}
                  download={item.file.filename}
                  className={LINK}
                  data-testid={fileTestId(row.kind)}
                >
                  {row.label}
                </a>
                <span className={`mt-[var(--s1)] block ${READ_MUTED}`}>
                  {item.file.tool ?? "Google Ads Editor"}. {item.file.line}
                </span>
              </span>
              <span className={`${HEADING} tabular-nums`}>{row.value}</span>
            </li>
          );
        })}
      </ol>

      {editor ? (
        <p className={`mt-[var(--s4)] ${READ}`}>
          <a
            href={editor.href}
            download={editor.file.filename}
            className={ACTION}
            data-testid={fileTestId("editor")}
          >
            Download the combined Google Ads Editor file
          </a>
          <span className={`mt-[var(--s2)] block ${READ_MUTED}`}>{editor.file.line}</span>
        </p>
      ) : null}

      <p className={`mt-[var(--s4)] ${READ}`}>{result.roomLine}</p>
      <p className={`mt-[var(--s2)] ${META}`}>{result.editorLine}</p>
    </div>
  );
}

export function TemplatePage() {
  const [, params] = useRoute<{ slug: string }>(leafPath("templates", ":slug"));
  const template = params?.slug ? BY_SLUG[params.slug] : undefined;
  const session = useRoomSession();
  const [files, setFiles] = useState<AdGrantTemplateFilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const slug = template?.slug ?? "";
  const signedIn = session.signedIn;

  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!slug) return;
      setBusy(true);
      setError(null);
      try {
        const result = await apiRequest<AdGrantTemplateFilesResponse>(
          "GET",
          `/api/adgrant/templates/${encodeURIComponent(slug)}/files`,
          undefined,
          { signal },
        );
        setFiles(result);
      } catch (cause) {
        setFiles(null);
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "The setup files could not be read.");
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    if (!signedIn || !slug) {
      setFiles(null);
      setError(null);
      setBusy(false);
      return;
    }
    const ac = new AbortController();
    void loadFiles(ac.signal);
    return () => ac.abort();
  }, [loadFiles, retry, signedIn, slug]);

  if (!template) {
    return <Missing title="This template is not in the library" />;
  }

  const counts = COUNT_KIND.map((row) => ({
    kind: row.kind,
    label: row.label,
    value: template.stats[row.stat],
  })).filter((row) => row.value > 0);

  return (
    <>
      <Meta title={`${template.title} — AdGrant.AI`} description={template.summary} />
      <article className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
        <p className={META}>
          <Link href={sectionPath("templates")} className={LINK}>
            {SECTION.name}
          </Link>
        </p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`} data-testid="text-adgrant-template-title">
          {template.title}
        </h1>
        <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}>{template.summary}</p>
        <p className={`mt-[var(--s2)] ${META}`}>Niche: {template.niche.replace(/-/g, " ")}</p>

        <p className={`mt-[var(--s5)] max-w-[46ch] ${READ}`}>{ADGRANT_TEMPLATE_FILES_PURPOSE_LINE}</p>
        <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>
          Each of the counts below is a file: one CSV for campaigns, one for ad groups, one for keywords, one for ads,
          one for sitelinks, one for callouts and one for structured snippets, plus the combined Google Ads Editor
          file. Every campaign in every file is Paused. Nothing is written into a Google Ads account.
        </p>
        <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>{ADGRANT_TEMPLATE_FILES_ROOM_LINE}</p>

        <div className="mt-[var(--s4)]" data-testid="block-adgrant-template-signin">
          <RoomMenu
            className={ACTION}
            doorId={GRANT_DOOR?.id}
            agentId={GRANT_DOOR?.firstAgentId}
            testId="button-adgrant-template-room"
            layout="inline"
          />
        </div>

        {!files ? (
          <ol className="mt-[var(--s5)] max-w-[46ch]">
            {counts.map((row, index) => (
              <li
                key={row.kind}
                className="grid items-baseline gap-x-[var(--s3)] border-t border-border py-[var(--s2)] last:border-b lg:grid-cols-[3rem_minmax(0,1fr)_auto]"
              >
                <span className={NUMERAL} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={READ}>{row.label}</span>
                <span className={`${HEADING} tabular-nums`}>{row.value}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {signedIn && busy && !files ? (
          <p className={`mt-[var(--s4)] ${READ_MUTED}`}>Reading the setup files.</p>
        ) : null}

        {error ? (
          <div className="mt-[var(--s4)] max-w-[46ch]">
            <p role="alert" className={READ_MUTED} data-testid="text-adgrant-template-files-error">
              {error}
            </p>
            {signedIn ? (
              <button
                type="button"
                className={`${ACTION_QUIET} mt-[var(--s3)]`}
                onClick={() => setRetry((n) => n + 1)}
                data-testid="button-adgrant-template-files-retry"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {files ? <TemplateFiles result={files} counts={counts} /> : null}
      </article>
    </>
  );
}
