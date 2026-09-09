import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "wouter";

import { CODE, HEADING, LINK, READ, READ_MUTED } from "@/components/site/doors/quiet";
import { adgrantHref, isInternalAdgrantHref } from "@/components/adgrant/links";

/**
 * Library bodies from shared/adgrant.ts. Internal `/glossary/<slug>` (and
 * sibling) links stay inside this tree; /nonprofits… goes to adgrant.ai;
 * everything else that is a URL opens in a new tab.
 */
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
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    const to = adgrantHref(href);
    if (isInternalAdgrantHref(href)) {
      return (
        <Link href={to} className={LINK}>
          {children}
        </Link>
      );
    }
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={LINK}>
        {children}
      </a>
    );
  },
  code: ({ children }) => <code className={CODE}>{children}</code>,
  pre: ({ children }) => (
    <pre className="my-[var(--s3)] overflow-x-auto border-l border-border pl-[var(--s3)] font-mono text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-[var(--s3)] overflow-x-auto">
      <table className={`${READ} w-full text-left`}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border py-[var(--s1)] pr-[var(--s3)] font-sans text-sm font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border py-[var(--s1)] pr-[var(--s3)] align-top">{children}</td>,
};

export function AdGrantMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
      {children}
    </ReactMarkdown>
  );
}
