import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, LINK, META } from "@/components/workspace/room-style";

/**
 * Agent output is untrusted text. Raw HTML stays off (no rehype-raw), links are
 * forced out of the app, and fenced code is rendered by `pre` reading the child
 * `code` element's props — react-markdown 9 dropped the `inline` flag, so this
 * is the reliable way to tell a block from an inline span.
 *
 * Nothing in here sets a size or a colour. The caller does, once, and the whole
 * message inherits it: an answer is ink, a question is soft ink, and both are
 * the reading size. That is what keeps a markdown answer from quietly
 * introducing a fourth type size into a room that has three.
 *
 * Code is the one exception, and it is a face rather than a step in the scale:
 * monospace against a serif is contrast enough, so inline code has no box, no
 * border and no colour, and a fenced block is marked by a rule down its left
 * edge instead of by a card.
 *
 * The `0.9em` on inline code is the one number in this file, and it is an
 * optical correction rather than a fourth size: JetBrains Mono has a taller
 * x-height than Newsreader, so `event_id` set at the paragraph's own 17px reads
 * a size larger than the words either side of it. Measured in the rendered
 * room it is 15.3px, and it is the only value there that is not 11, 13 or 17 —
 * worth knowing before somebody counts the sizes and finds four.
 */

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = useCallback(() => {
    void copyText(code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1_600);
    });
  }, [code]);

  return (
    <div className="my-4 border-l border-border pl-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn(META, "font-mono uppercase tracking-[0.09em] text-muted-foreground")}>
          {language ?? "code"}
        </span>
        <button type="button" onClick={onCopy} className={ACTION_QUIET} data-testid="button-copy-code">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scrollbar-thin mt-1.5 overflow-x-auto">
        <code className={cn(CHROME, "font-mono leading-6")}>{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  ),
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-5 font-medium first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 font-medium first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-4 font-medium first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-4 font-medium first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-5 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="scrollbar-thin my-4 overflow-x-auto">
      <table className={cn(CHROME, "w-full border-collapse text-left")}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
  th: ({ children }) => <th className="py-1.5 pr-4 font-medium last:pr-0">{children}</th>,
  td: ({ children }) => <td className="py-1.5 pr-4 align-top last:pr-0">{children}</td>,
  img: ({ src, alt }) => (
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-4 max-w-full" />
  ),
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked === true} readOnly className="mr-1.5 align-middle accent-current" />
    ) : null,
  code: ({ children }) => <code className="font-mono text-[0.9em]">{children}</code>,
  pre: ({ children }) => {
    const child = Children.toArray(children)[0];
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
      return <CodeBlock code={textOf(children)} />;
    }
    const language = /language-([\w-]+)/.exec(child.props.className ?? "")?.[1];
    return <CodeBlock code={textOf(child.props.children).replace(/\n$/, "")} language={language} />;
  },
};

export interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("[word-break:break-word]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
