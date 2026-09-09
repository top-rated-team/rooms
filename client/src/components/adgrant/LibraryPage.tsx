import { Link, useRoute } from "wouter";

import { PAGE_BY_SLUG, type AdGrantCorrection, type RelatedLink } from "@shared/adgrant";
import { DISPLAY, HEADING, LINK, META, META_PLAIN, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { Meta } from "@/components/adgrant/Meta";
import { Missing } from "@/components/adgrant/Missing";
import { AdGrantMarkdown } from "@/components/adgrant/Markdown";
import { adgrantHref, isInternalAdgrantHref, leafPath, sectionPath } from "@/components/adgrant/links";
import { SECTION_BY_SEGMENT, type AdGrantSection } from "@/components/adgrant/sections";

export function LibraryPage({ segment }: { segment: Exclude<AdGrantSection["segment"], "templates"> }) {
  const section = SECTION_BY_SEGMENT[segment];
  const [, params] = useRoute<{ slug: string }>(leafPath(segment, ":slug"));
  const slug = params?.slug;
  const page = slug ? PAGE_BY_SLUG[slug] : undefined;

  if (!slug || !page || page.category !== section.category) {
    return <Missing title="This page is not in the library" />;
  }

  const title = page.metaTitle?.trim() || page.title;
  const description = page.metaDescription?.trim() || page.excerpt || page.title;
  const related = page.relatedLinks;

  return (
    <>
      <Meta title={title} description={description} />
      <article className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
        <p className={META}>
          <Link href={sectionPath(segment)} className={LINK}>
            {section.name}
          </Link>
        </p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`} data-testid="text-adgrant-leaf-title">
          {page.title}
        </h1>
        {page.topic && page.topic !== page.title ? (
          <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}>{page.topic}</p>
        ) : null}

        <div className="mt-[var(--s5)] max-w-[62ch]">
          <AdGrantMarkdown>{page.bodyMarkdown}</AdGrantMarkdown>
        </div>

        {related.length > 0 ? (
          <RelatedLinks links={related} />
        ) : null}

        {page.corrections.length > 0 ? <Corrections items={page.corrections} /> : null}
      </article>
    </>
  );
}

function RelatedLinks({ links }: { links: RelatedLink[] }) {
  return (
    <section className="mt-[var(--s6)] max-w-[62ch]" data-testid="block-adgrant-related">
      <h2 className={HEADING}>Related</h2>
      <ul className="mt-[var(--s3)]">
        {links.map((link) => {
          const href = adgrantHref(link.href);
          const internal = isInternalAdgrantHref(link.href);
          return (
            <li key={`${link.href}:${link.title}`} className="border-t border-border py-[var(--s2)] last:border-b">
              {internal ? (
                <Link href={href} className={`${LINK} ${READ}`}>
                  {link.title}
                </Link>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" className={`${LINK} ${READ}`}>
                  {link.title}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Corrections({ items }: { items: AdGrantCorrection[] }) {
  return (
    <section className="mt-[var(--s5)] max-w-[62ch]" data-testid="block-adgrant-corrections">
      <h2 className={HEADING}>Corrected against Google&rsquo;s current documentation</h2>
      <ul className="mt-[var(--s3)]">
        {items.map((item) => (
          <li key={item.what} className="border-t border-border py-[var(--s2)] last:border-b">
            <p className={READ}>{item.what}</p>
            <p className={`mt-[var(--s1)] ${META_PLAIN}`}>
              <a href={item.against} target="_blank" rel="noopener noreferrer" className={LINK}>
                {item.against.replace(/^https:\/\//, "")}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
