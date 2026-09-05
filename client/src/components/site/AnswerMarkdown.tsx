import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

/**
 * Split out of AskWidget and loaded lazily: react-markdown plus remark-gfm is the
 * single heaviest thing on the landing page, and this page receives paid clicks.
 * Nothing here is needed until an answer starts streaming, and AskWidget warms the
 * chunk on focus so the wait is never visible.
 */

function childText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return childText(node.props.children);
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const source = childText(children);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard is blocked in some embedded contexts; the code is selectable anyway. */
    }
  }

  return (
    <div className="not-prose group relative my-3">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 rounded-md border border-card-border bg-card p-1.5 text-muted-foreground opacity-0 transition-opacity hover-elevate active-elevate-2 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-md border border-card-border bg-muted/60 p-3 pr-12 font-mono text-xs leading-relaxed scrollbar-thin">
        {children}
      </pre>
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  pre: CodeBlock,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] before:content-none after:content-none">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto scrollbar-thin">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
};

export function AnswerMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

export default AnswerMarkdown;
