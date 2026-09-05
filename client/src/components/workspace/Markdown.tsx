import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Agent output is untrusted text. Raw HTML stays off (no rehype-raw), links are
 * forced out of the app, and fenced code is rendered by `pre` reading the child
 * `code` element's props — react-markdown 9 dropped the `inline` flag, so this
 * is the reliable way to tell a block from an inline span.
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
    <div className="my-3 overflow-hidden rounded-md border border-card-border bg-card">
      <div className="flex items-center justify-between border-b border-card-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{language ?? "code"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent min-h-8 px-3 text-muted-foreground"
          data-testid="button-copy-code"
        >
          {copied ? <Check className="text-accent" /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto px-3 py-3">
        <code className="font-mono text-[13px] leading-6">{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-4 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="scrollbar-thin my-3 overflow-x-auto rounded-md border border-card-border">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-card-border last:border-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
  img: ({ src, alt }) => (
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-3 max-w-full rounded-md" />
  ),
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked === true} readOnly className="mr-1.5 align-middle accent-primary" />
    ) : null,
  code: ({ children }) => (
    <code className="rounded border border-card-border bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
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
    <div className={cn("text-[15px] leading-7 text-foreground [word-break:break-word]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
