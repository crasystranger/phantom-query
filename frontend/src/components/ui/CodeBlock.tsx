import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { TOKEN_CLASS, tokenizeSql } from "../../utils/sqlTokenize";

export function SqlText({ sql }: { sql: string }) {
  return (
    <>
      {tokenizeSql(sql).map((token, i) =>
        token.kind === "plain" ? (
          <span key={i}>{token.text}</span>
        ) : (
          <span key={i} className={TOKEN_CLASS[token.kind]}>
            {token.text}
          </span>
        )
      )}
    </>
  );
}

/** Copy button with a two-second confirmed state. Used wherever SQL or a
 *  question can be lifted out of the UI. */
export function CopyButton({
  value, label = "Copy", className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the button simply doesn't confirm.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors
        ${copied ? "text-accent-text" : "text-muted hover:text-primary hover:bg-hover"} ${className}`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span className="hidden sm:inline">{copied ? "Copied" : label}</span>
    </button>
  );
}

interface CodeBlockProps {
  code: string;
  /** Shown top-left, e.g. "PostgreSQL". */
  language?: string;
  /** Extra controls for the header bar, right-aligned next to Copy. */
  actions?: React.ReactNode;
  /** Caps the height and scrolls; use for long statements in dense contexts. */
  maxHeight?: string;
  className?: string;
}

/**
 * The SQL well. Sits on `raised` so it reads as a distinct artefact inside a
 * panel, wraps rather than scrolling horizontally (a reviewer should never
 * have to scroll sideways to see what a query touches), and always offers copy.
 */
export default function CodeBlock({
  code, language, actions, maxHeight, className = "",
}: CodeBlockProps) {
  return (
    <div className={`rounded-lg border border-line bg-raised overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border-subtle bg-hover/40">
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint truncate">
          {language ?? "SQL"}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {actions}
          <CopyButton value={code} label="Copy" />
        </div>
      </div>
      <pre
        className="px-3 py-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words overflow-y-auto"
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={0}
      >
        <code>
          <SqlText sql={code} />
        </code>
      </pre>
    </div>
  );
}
