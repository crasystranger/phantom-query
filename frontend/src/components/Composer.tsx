import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Database, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Alert } from "./ui";
import { resolveComposerMode } from "../utils/composerMode";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Personal workspaces send every message to Phantom Query; team workspaces
   *  route on a leading slash. This is presentation of the rule the server
   *  already applies in chats.py -- it is not the rule itself. */
  workspaceType: "personal" | "team";
  connectionName?: string;
  busy: boolean;
  error?: string | null;
  onDismissError?: () => void;
}

const MAX_ROWS_HEIGHT = 200;

/**
 * One input, two jobs, and the UI never leaves you guessing which one is armed.
 *
 * In a team workspace the composer is a team chat box by default and visibly
 * becomes a Phantom Query box the moment you type "/" -- accent border, a mode
 * chip, and a footer that names the database the question will run against.
 * That distinction is the product's philosophy made visible: talking to your
 * teammates should never accidentally talk to an AI about your production data.
 */
export default function Composer({
  value, onChange, onSubmit, workspaceType, connectionName, busy, error, onDismissError,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const mode = resolveComposerMode(value, workspaceType);
  const isQuery = mode === "query";
  const canSubmit = value.trim().length > 0 && !busy;

  // Grow with the content up to a cap, then scroll. Runs in a layout effect so
  // the height is right before paint and the box never visibly jumps.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  const placeholder = isQuery
    ? "Ask about your data…"
    : "Message your team…  (type / to ask Phantom Query)";

  return (
    <div className="shrink-0 border-t border-border-subtle bg-panel">
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-6 py-3 sm:py-4 space-y-2.5">
        {error && (
          <Alert
            tone="danger"
            title="Couldn't send that"
            action={
              onDismissError && (
                <button
                  onClick={onDismissError}
                  className="text-xs text-muted hover:text-primary"
                >
                  Dismiss
                </button>
              )
            }
          >
            {error}
          </Alert>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }}
          className={`rounded-xl border bg-raised transition-colors ${
            isQuery && workspaceType === "team"
              ? "border-accent/55 ring-1 ring-accent/20"
              : focused
                ? "border-accent/50"
                : "border-line"
          }`}
        >
          {workspaceType === "team" && (
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
              {isQuery ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-text">
                  <Sparkles size={11} aria-hidden />
                  Asking Phantom Query
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
                  <MessageSquare size={11} aria-hidden />
                  Message to your team
                </span>
              )}
              {isQuery && connectionName && (
                <span className="inline-flex items-center gap-1 text-[11px] text-faint min-w-0">
                  <span aria-hidden>·</span>
                  <Database size={10} className="shrink-0" aria-hidden />
                  <span className="truncate">{connectionName}</span>
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 pb-2.5 pt-2">
            <label htmlFor="phq-composer" className="sr-only">
              {isQuery ? "Ask Phantom Query about your data" : "Message your team"}
            </label>
            <textarea
              id="phq-composer"
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={busy}
              placeholder={placeholder}
              aria-describedby="phq-composer-hint"
              className="flex-1 min-w-0 bg-transparent text-sm text-primary placeholder:text-faint
                resize-none focus:outline-none disabled:opacity-60 leading-relaxed max-h-50"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={isQuery ? "Ask Phantom Query" : "Send message"}
              className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                disabled:opacity-35 disabled:pointer-events-none
                ${isQuery
                  ? "bg-accent text-accent-fg hover:bg-accent-hover"
                  : "bg-raised border border-line text-secondary hover:bg-hover hover:text-primary"}`}
            >
              {busy ? (
                <span
                  className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden
                />
              ) : (
                <ArrowUp size={17} />
              )}
            </button>
          </div>
        </form>

        <p
          id="phq-composer-hint"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint"
        >
          {isQuery ? (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-accent shrink-0" aria-hidden />
              Phantom Query proposes SQL. Nothing runs until you approve it.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare size={11} className="shrink-0" aria-hidden />
              Sent to your teammates only — Phantom Query won't see it.
            </span>
          )}
          <span className="hidden sm:inline">
            <kbd className="px-1 py-0.5 rounded border border-line bg-raised font-sans">Enter</kbd> to
            send · <kbd className="px-1 py-0.5 rounded border border-line bg-raised font-sans">Shift</kbd>
            +<kbd className="px-1 py-0.5 rounded border border-line bg-raised font-sans">Enter</kbd> for
            a new line
          </span>
        </p>
      </div>
    </div>
  );
}
