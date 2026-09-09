import { Link } from "wouter";

import { pagesIn, type AdGrantCategory, type AdGrantPage } from "@shared/adgrant";
import { DISPLAY, HEADING, LINK, META, NUMERAL, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { Meta } from "@/components/adgrant/Meta";
import { leafPath } from "@/components/adgrant/links";
import { SECTION_BY_SEGMENT, type AdGrantSection } from "@/components/adgrant/sections";

function byTitle(a: AdGrantPage, b: AdGrantPage): number {
  return a.title.localeCompare(b.title, "en");
}

export function LibraryIndex({ segment }: { segment: AdGrantSection["segment"] }) {
  const section = SECTION_BY_SEGMENT[segment];
  const category = section.category;
  if (!category) return null;
  return <CategoryIndex section={section} category={category} />;
}

function CategoryIndex({
  section,
  category,
}: {
  section: AdGrantSection;
  category: AdGrantCategory;
}) {
  const pages = pagesIn(category).slice().sort(byTitle);
  const description = section.subtitle ? `${section.subtitle}. ${section.line}` : section.line;

  return (
    <>
      <Meta title={`${section.name} — AdGrant.AI`} description={description} />
      <section className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
        <p className={META}>{section.subtitle ?? section.name}</p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`} data-testid={`text-adgrant-${section.segment}-headline`}>
          {section.name}
        </h1>
        <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}>{section.line}</p>

        <ol className="mt-[var(--s5)] list-none p-0">
          {pages.map((page, index) => (
            <li
              key={page.slug}
              data-testid={`item-adgrant-${section.segment}`}
              className="grid items-baseline gap-x-[var(--s3)] gap-y-[var(--s1)] border-t border-border py-[var(--s3)] last:border-b lg:grid-cols-[3rem_minmax(0,1fr)]"
            >
              <span className={NUMERAL} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className={HEADING}>
                  <Link href={leafPath(section.segment, page.slug)} className={LINK}>
                    {page.title}
                  </Link>
                </h2>
                {page.excerpt ? (
                  <p className={`mt-[var(--s1)] max-w-[62ch] ${READ_MUTED}`}>{page.excerpt}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
