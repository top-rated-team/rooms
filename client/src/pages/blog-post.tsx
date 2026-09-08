import { useEffect } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useRoute } from "wouter";

import { POST_BY_SLUG, type BlogPost } from "@shared/blog";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import { CODE, HEADING, LINK, META, PAGE, READ, READ_MUTED } from "@/components/site/doors/quiet";
import NotFound from "@/pages/not-found";

/* ---------------------------------------------------------------------------
 * ONE POST
 *
 * The slug in the address is the slug in the frontmatter, including the two
 * that look cut off — those are the live URLs. What is on the page is the
 * title, the date, and the markdown, set in the site's reading type. There is
 * no hero, no author box, no share buttons, no related-posts rail and no
 * newsletter form: those would be furniture around a text that already has a
 * beginning and an end.
 * ------------------------------------------------------------------------- */

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

/**
 * The page already prints the frontmatter title as the heading. One of the
 * five files also opens the body with that same title as an h1; leaving it
 * would print the title twice.
 */
function readingBody(post: BlogPost): string {
  const match = post.body.match(/^\s*#\s+(.+)\n+/);
  if (match && match[1].trim() === post.title.trim()) {
    return post.body.slice(match[0].length);
  }
  return post.body;
}

function isInternal(href: string | undefined): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
}

const MARKDOWN: Components = {
  h1: ({ children }) => <h2 className={`${HEADING} mt-[var(--s4)] first:mt-0`}>{children}</h2>,
  h2: ({ children }) => <h2 className={`${HEADING} mt-[var(--s4)] first:mt-0`}>{children}</h2>,
  h3: ({ children }) => <h3 className={`${HEADING} mt-[var(--s3)] first:mt-0`}>{children}</h3>,
  h4: ({ children }) => <h4 className={`${HEADING} mt-[var(--s3)] first:mt-0`}>{children}</h4>,
  p: ({ children }) => <p className={`${READ} my-[var(--s3)] first:mt-0 last:mb-0`}>{children}</p>,
  ul: ({ children }) => (
    <ul className={`${READ} my-[var(--s3)] list-disc space-y-[var(--s1)] pl-[var(--s4)] marker:text-muted-foreground`}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className={`${READ} my-[var(--s3)] list-decimal space-y-[var(--s1)] pl-[var(--s4)] marker:text-muted-foreground`}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-[var(--s1)]">{children}</li>,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-[var(--s4)] border-border" />,
  blockquote: ({ children }) => (
    <blockquote className={`${READ_MUTED} my-[var(--s3)] border-l border-border pl-[var(--s3)]`}>{children}</blockquote>
  ),
  a: ({ href, children }) =>
    isInternal(href) ? (
      <Link href={href} className={LINK}>
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
        {children}
      </a>
    ),
  code: ({ children }) => <code className={CODE}>{children}</code>,
  pre: ({ children }) => (
    <pre className="my-[var(--s3)] overflow-x-auto border-l border-border pl-[var(--s3)] font-mono">{children}</pre>
  ),
};

function PostMarkdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>{children}</ReactMarkdown>;
}

function setPageMeta(title: string, description: string | null) {
  const previousTitle = document.title;
  document.title = title;

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
  element.content = description ?? "";

  return () => {
    document.title = previousTitle;
    if (created) element.remove();
    else element.content = previousDescription;
  };
}

function PostView({ post }: { post: BlogPost }) {
  useEffect(() => setPageMeta(post.title, post.description), [post.title, post.description]);

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <article className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`} data-testid="article-blog-post">
          <p className={META}>
            <Link
              href="/blog"
              data-testid="link-blog-index"
              className={`${LINK} focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
            >
              Blog
            </Link>
          </p>
          <p className={`${META} mt-[var(--s3)]`}>
            <time dateTime={post.date}>{publishedOn(post.date)}</time>
          </p>
          <h1 className="type-display m-0 mt-[var(--s2)]" data-testid="text-blog-post-title">
            {post.title}
          </h1>
          <div className="mt-[var(--s5)] max-w-[62ch]">
            <PostMarkdown>{readingBody(post)}</PostMarkdown>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

export default function BlogPostPage() {
  const [, params] = useRoute<{ slug: string }>("/blog/:slug");
  const post = params?.slug ? POST_BY_SLUG[params.slug] : undefined;
  if (!post) return <NotFound />;
  return <PostView post={post} />;
}
