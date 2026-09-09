import { Link } from "wouter";

import { TEMPLATES } from "@shared/adgrant";
import { DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { Meta } from "@/components/adgrant/Meta";
import { leafPath } from "@/components/adgrant/links";
import { SECTION_BY_SEGMENT } from "@/components/adgrant/sections";

const SECTION = SECTION_BY_SEGMENT.templates;

export function TemplatesIndex() {
  const description = SECTION.line;

  return (
    <>
      <Meta title={`${SECTION.name} — AdGrant.AI`} description={description} />
      <section className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
        <p className={META}>{SECTION.name}</p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`} data-testid="text-adgrant-templates-headline">
          {SECTION.name}
        </h1>
        <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}>{SECTION.line}</p>

        <ol className="mt-[var(--s5)] list-none p-0">
          {TEMPLATES.map((template, index) => (
            <li
              key={template.slug}
              data-testid="item-adgrant-templates"
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className={HEADING}>
                  <Link href={leafPath("templates", template.slug)} className={LINK}>
                    {template.title}
                  </Link>
                </h2>
                <p className={`mt-[var(--s1)] max-w-[62ch] ${READ_MUTED}`}>{template.summary}</p>
                <p className={`mt-[var(--s1)] ${META}`}>
                  {template.stats.campaigns} campaigns, {template.stats.adGroups} ad groups, {template.stats.keywords}{" "}
                  keywords, {template.stats.ads} ads
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
