import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useRoute } from "wouter";

import type { AdGrantTemplateFilesResponse } from "@shared/api";
import { TEMPLATES, type AdGrantTemplate } from "@shared/adgrant";
import { ACTION, DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { Meta } from "@/components/adgrant/Meta";
import { Missing } from "@/components/adgrant/Missing";
import { leafPath, mountHome, sectionPath } from "@/components/adgrant/links";
import { SECTION_BY_SEGMENT } from "@/components/adgrant/sections";
import { ApiError, apiRequest } from "@/lib/apiRequest";

const SECTION = SECTION_BY_SEGMENT.templates;
const BY_SLUG: Record<string, AdGrantTemplate> = Object.fromEntries(
  TEMPLATES.map((template) => [template.slug, template]),
);

function TemplateFiles({ result }: { result: AdGrantTemplateFilesResponse }) {
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

  return (
    /* A live region: pressing the button replaces nothing on screen that a
       screen reader would notice, so without this the only signal that the
       files arrived is visual. */
    <div
      className="mt-[var(--s5)] max-w-[46ch]"
      role="status"
      aria-live="polite"
      data-testid="block-adgrant-template-files"
    >
      <p className={READ}>{result.pausedLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{result.destinationLine}</p>
      <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{result.uploadLine}</p>
      <ul className="mt-[var(--s4)] list-none p-0">
        {hrefs.map(({ file, href }) => (
          <li key={file.filename} className="border-t border-border py-[var(--s3)] last:border-b">
            <a
              href={href}
              download={file.filename}
              className={ACTION}
              data-testid={file.kind === "editor" ? "link-adgrant-template-editor" : "link-adgrant-template-assets"}
            >
              {file.kind === "editor" ? "Download the Google Ads Editor CSV" : "Download callouts and structured snippets"}
            </a>
            <p className={`mt-[var(--s2)] ${READ_MUTED}`}>{file.line}</p>
          </li>
        ))}
      </ul>
      <p className={`mt-[var(--s3)] ${META}`}>{result.editorLine}</p>
    </div>
  );
}

export function TemplatePage() {
  const [, params] = useRoute<{ slug: string }>(leafPath("templates", ":slug"));
  const template = params?.slug ? BY_SLUG[params.slug] : undefined;
  const [files, setFiles] = useState<AdGrantTemplateFilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!template) {
    return <Missing title="This template is not in the library" />;
  }

  const slug = template.slug;

  const counts: { label: string; value: number }[] = [
    { label: "campaigns", value: template.stats.campaigns },
    { label: "ad groups", value: template.stats.adGroups },
    { label: "keywords", value: template.stats.keywords },
    { label: "ads", value: template.stats.ads },
    { label: "sitelinks", value: template.stats.sitelinks },
    { label: "callouts", value: template.stats.callouts },
    { label: "structured snippets", value: template.stats.structuredSnippets },
  ];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<AdGrantTemplateFilesResponse>(
        "GET",
        `/api/adgrant/templates/${encodeURIComponent(slug)}/files`,
      );
      setFiles(result);
    } catch (cause) {
      setFiles(null);
      setError(cause instanceof ApiError ? cause.message : "The setup files could not be read.");
    } finally {
      setBusy(false);
    }
  }

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

        <ol className="mt-[var(--s5)] max-w-[46ch]">
          {counts.map((row, index) => (
            <li
              key={row.label}
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

        <form className="mt-[var(--s5)] max-w-[46ch]" onSubmit={onSubmit} data-testid="form-adgrant-template-files">
          {/* "as published" was not true of the CSV. The published template
              carries no bid strategy at all and its sitelinks are account
              level; the file has to name a strategy per campaign and repeat
              the sitelinks under each one, because that is the shape Editor
              imports. Saying so is cheaper than a person discovering it in a
              live grant account. */}
          <p className={READ}>
            This template is the setup: campaigns, ad groups, keywords, ads, sitelinks, callouts and structured
            snippets. The files are built when you ask for them. Every campaign in the Google Ads Editor file is
            Paused.
          </p>
          <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
            Two things the file adds that the published template does not carry: a bid strategy on each campaign, and
            the account&rsquo;s sitelinks repeated under every campaign — both because that is the shape Google Ads
            Editor imports. Check them before you unpause anything. Nothing is written into a Google Ads account.
          </p>
          <button type="submit" className={`${ACTION} mt-[var(--s3)]`} disabled={busy} data-testid="button-adgrant-template-files">
            {busy ? "Building the files" : files ? "Build the files again" : "Get the setup files"}
          </button>
        </form>

        {error ? (
          <p
            role="alert"
            className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}
            data-testid="text-adgrant-template-files-error"
          >
            {error}
          </p>
        ) : null}

        {files ? <TemplateFiles result={files} /> : null}

        <p className={`mt-[var(--s5)] max-w-[46ch] ${READ_MUTED}`}>
          A structure for a specific nonprofit is produced on the{" "}
          <Link href={mountHome()} className={LINK}>
            front page
          </Link>
          , from that organisation&rsquo;s own website, and shown there. That is a different product from this starter.
        </p>
      </article>
    </>
  );
}
