import { useEffect } from "react";
import { Link } from "wouter";

import { POSTS } from "@shared/blog";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import { HEADING, LINK, META, PAGE, READ_MUTED } from "@/components/site/doors/quiet";

/* ---------------------------------------------------------------------------
 * THE BLOG INDEX
 *
 * Five posts, at the addresses they already have on top-rated.team. This page
 * exists so those URLs keep answering when this application moves to the apex.
 * Newest first, because that is the only order five dated posts have. There is
 * no search box and no tag filter: five posts do not need finding.
 * ------------------------------------------------------------------------- */

const TITLE = "Blog — Top-Rated Team";
const DESCRIPTION = `${POSTS.length} posts, newest first.`;

/** Printed from the source date, in UTC, so a timezone cannot move the day. */
function publishedOn(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Blog() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLE;

    let created = false;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
      created = true;
    }
    const element = meta;
    const previousDescription = element.content;
    element.content = DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <section className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
          <p className={META}>Blog</p>
          <h1 className="type-display m-0 mt-[var(--s2)]" data-testid="text-blog-headline">
            {POSTS.length} posts, newest first.
          </h1>
          <p className={`mt-[var(--s3)] max-w-[62ch] ${READ_MUTED}`}>
            Each one is at the address it was published at.
          </p>

          <ol className="mt-[var(--s5)] list-none p-0">
            {POSTS.map((post) => (
              <li key={post.slug} className="border-t border-border py-[var(--s3)] last:border-b">
                <article>
                  <p className={META}>
                    <time dateTime={post.date}>{publishedOn(post.date)}</time>
                  </p>
                  <h2 className={`${HEADING} mt-[var(--s1)]`}>
                    <Link
                      href={`/blog/${post.slug}`}
                      data-testid="link-blog-post"
                      className={`${LINK} focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
                    >
                      {post.title}
                    </Link>
                  </h2>
                  {post.description ? (
                    <p className={`mt-[var(--s2)] max-w-[62ch] ${READ_MUTED}`}>{post.description}</p>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
