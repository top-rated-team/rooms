import { Link } from "wouter";

import { DISPLAY, HEADING, LINK, META, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { Meta } from "@/components/adgrant/Meta";
import { mountHome } from "@/components/adgrant/links";

export function Missing({ title }: { title: string }) {
  return (
    <>
      <Meta title={`${title} — AdGrant.AI`} description="That page is not in this library." />
      <section className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
        <p className={META}>Not in this library</p>
        <h1 className={`mt-[var(--s2)] ${DISPLAY}`}>{title}</h1>
        <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}>
          There is no page at this address in the glossary, case studies, tips and tricks, or starter templates.
        </p>
        <p className={`mt-[var(--s3)] ${HEADING}`}>
          <Link href={mountHome()} className={LINK}>
            AdGrant.AI
          </Link>
        </p>
      </section>
    </>
  );
}
