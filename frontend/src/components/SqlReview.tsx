import { useState } from "react";
import {
  AlertTriangle, ChevronDown, Loader2, Pencil, Play, ShieldAlert, ShieldCheck, Table2,
} from "lucide-react";
import type { ValidationResult } from "../type";
import { Badge, Button, CodeBlock } from "./ui";
import { dialectLabel, extractSqlTables } from "../utils/sql";

interface Props {
  sql: string;
  onSqlChange: (sql: string) => void;
  validation: ValidationResult | null;
  /** True while the debounce window or the validate call is still open. */
  validating: boolean;
  dbType?: string;
  running: boolean;
  hasRun: boolean;
  onRun: () => void;
  /** Extra buttons for the action row, e.g. Explain. */
  actions?: React.ReactNode;
}

/**
 * The review surface. Its whole job is to let someone decide whether to run a
 * statement, so it answers three questions in descending order of importance:
 *
 *   1. What will this read?        -- tables, in plain sight, above the SQL
 *   2. Did the safety check pass?  -- one line, one colour, no jargon
 *   3. Do I want to run it?        -- one explicit, primary action
 *
 * The technical detail behind the safety verdict is real and available, but
 * folded away by default: a green line a reviewer trusts beats a paragraph of
 * database security terminology they learn to scroll past.
 */
export default function SqlReview({
  sql, onSqlChange, validation, validating, dbType, running, hasRun, onRun, actions,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const tables = extractSqlTables(sql);
  const safe = validation?.is_safe === true;
  const blocked = validation !== null && !validation.is_safe;

  return (
    <div className="space-y-3">
      {tables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
            <Table2 size={11} aria-hidden />
            Reads from
          </span>
          {tables.map((t) => (
            <code
              key={t}
              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-raised border border-line text-secondary"
            >
              {t}
            </code>
          ))}
        </div>
      )}

      {editing ? (
        <div className="rounded-lg border border-accent/50 bg-raised overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border-subtle bg-hover/40">
            <span className="text-[11px] font-medium uppercase tracking-wider text-accent-text">
              Editing {dialectLabel(dbType)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Done
            </Button>
          </div>
          <label htmlFor="sql-editor" className="sr-only">
            Edit the proposed SQL
          </label>
          <textarea
            id="sql-editor"
            value={sql}
            onChange={(e) => onSqlChange(e.target.value)}
            rows={Math.min(14, Math.max(5, sql.split("\n").length + 1))}
            spellCheck={false}
            autoFocus
            className="w-full bg-transparent px-3 py-2.5 text-xs font-mono leading-relaxed
              text-primary focus:outline-none resize-y"
          />
        </div>
      ) : (
        <CodeBlock code={sql} language={dialectLabel(dbType)} maxHeight="22rem" />
      )}

      {/* -------------------------------------------------- safety verdict -- */}
      <div
        className={`rounded-lg border ${
          blocked
            ? "border-danger/35 bg-danger/8"
            : safe
              ? "border-accent/25 bg-accent/8"
              : "border-line bg-raised"
        }`}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {validating || !validation ? (
            <>
              <Loader2 size={15} className="text-muted animate-spin shrink-0" aria-hidden />
              <p className="text-xs text-muted">Running safety check…</p>
            </>
          ) : blocked ? (
            <>
              <ShieldAlert size={15} className="text-danger shrink-0" aria-hidden />
              <p className="text-xs font-medium text-danger flex-1 min-w-0">
                Blocked — this query didn't pass safety validation
              </p>
            </>
          ) : (
            <>
              <ShieldCheck size={15} className="text-accent shrink-0" aria-hidden />
              <p className="text-xs font-medium text-accent-text flex-1 min-w-0">
                Passed safety validation
              </p>
              <Badge tone="accent">Read-only</Badge>
            </>
          )}

          {validation && validation.reasons.length > 0 && (
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary transition-colors"
            >
              Details
              <ChevronDown
                size={12}
                className={`transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
          )}
        </div>

        {detailsOpen && validation && validation.reasons.length > 0 && (
          <ul className="px-3 pb-3 pt-0 space-y-1 animate-fade-in">
            {validation.reasons.map((reason, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-[11px] leading-relaxed ${
                  blocked ? "text-danger/90" : "text-muted"
                }`}
              >
                <span className="mt-1.5 w-1 h-1 rounded-full bg-current shrink-0" aria-hidden />
                <span className="font-mono break-words">{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {blocked && validation.reasons.length === 0 && (
        <p className="flex items-start gap-2 text-xs text-danger">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden />
          Phantom Query won't run this statement. Edit it, or rephrase your question.
        </p>
      )}

      {/* ------------------------------------------------------ execution -- */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button
          variant="primary"
          icon={<Play size={14} />}
          disabled={!safe}
          loading={running}
          onClick={onRun}
          title={!safe ? "This query has to pass the safety check before it can run" : undefined}
        >
          {running ? "Running…" : hasRun ? "Run again" : "Run query"}
        </Button>

        <Button
          variant="secondary"
          icon={<Pencil size={14} />}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Done editing" : "Edit SQL"}
        </Button>

        {actions}

        {!running && (
          <p className="text-[11px] text-faint ml-auto hidden sm:block">
            {safe
              ? "Runs only when you choose to."
              : "Nothing runs until the safety check passes."}
          </p>
        )}
      </div>
    </div>
  );
}
