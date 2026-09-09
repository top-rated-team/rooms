import { Link, useRoute } from "wouter";

import { TEMPLATES, type AdGrantTemplate } from "@shared/adgrant";
import { DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { Meta } from "@/components/adgrant/Meta";
import { Missing } from "@/components/adgrant/Missing";
import { leafPath, mountHome, sectionPath } from "@/components/adgrant/links";
import { SECTION_BY_SEGMENT } from "@/components/adgrant/sections";

const SECTION = SECTION_BY_SEGMENT.templates;
const BY_SLUG: Record<string, AdGrantTemplate> = Object.fromEntries(
  TEMPLATES.map((template) => [template.slug, template]),
);

export function TemplatePage() {
  const [, params] = useRoute<{ slug: string }>(leafPath("templates", ":slug"));
  const template = params?.slug ? BY_SLUG[params.slug] : undefined;

  if (!template) {
    return <Missing title="This template is not in the library" />;
  }

  const counts: { label: string; value: number }[] = [
    { label: "campaigns", value: template.stats.campaigns },
    { label: "ad groups", value: template.stats.adGroups },
    { label: "keywords", value: template.stats.keywords },
    { label: "ads", value: template.stats.ads },
    { label: "sitelinks", value: template.stats.sitelinks },
    { label: "callouts", value: template.stats.callouts },
    { label: "structured snippets", value: template.stats.structuredSnippets },
  ];

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

        <p className={`mt-[var(--s5)] max-w-[46ch] ${READ_MUTED}`}>
          This is a starter count, not an account. A structure for a specific nonprofit is produced on the{" "}
          <Link href={mountHome()} className={LINK}>
            front page
          </Link>
          , from that organisation&rsquo;s own website, and shown there. Nothing is written into a Google Ads account.
        </p>
      </article>
    </>
  );
}
