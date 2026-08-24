import { useState, useEffect } from "react";
import type { NLQueryResponse, ValidationResult } from "../type";

interface Props {
  nlResult: NLQueryResponse;
  executionError: string | null;
  onValidate: (sql: string) => Promise<ValidationResult>;
  onRun: (sql: string) => Promise<void>;
  onRetry: (failedSql: string, errorMessage: string) => Promise<void>;
}

export default function SqlPreview({ nlResult,executionError, onValidate, onRun, onRetry }: Props) {
  const [retrying, setRetrying ] = useState(false);
  const [sql, setSql] = useState(nlResult.sql);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [running, setRunning] = useState(false);

  // Re-validate whenever the SQL text changes (including the initial load)
  useEffect(() => {
    setSql(nlResult.sql);
  }, [nlResult]);

  useEffect(() => {
    if (!sql.trim()) {
      setValidation(null);
      return;
    }
    const timeout = setTimeout(() => {
      onValidate(sql).then(setValidation).catch(() => setValidation(null));
    }, 400); // debounce so we're not validating on every keystroke
    return () => clearTimeout(timeout);
  }, [sql]);

  async function handleRun() {
    setRunning(true);
    try {
      await onRun(sql);
    } finally {
      setRunning(false);
    }
  }

  async function handleRetry() {
  if (!executionError) return;
  setRetrying(true);
  try {
    await onRetry(sql, executionError);
  } finally {
    setRetrying(false);
  }
}

  return (
    <div className="p-4 border-b border-line space-y-2">
      {nlResult.explanation && (
        <p className="text-sm text-slate-400">{nlResult.explanation}</p>
      )}

      {nlResult.warnings.length > 0 && (
        <div className="text-xs text-warn bg-warn/10 border border-warn/30 rounded-md px-3 py-2">
          {nlResult.warnings.join(" · ")}
        </div>
      )}

      {nlResult.warnings.includes("retry") && (
        <div className="text-xs text-accent-hover bg-accent/10 border border-accent/30 rounded-md px-3 py-2">
        ↻ Retried after a failed execution
        </div>
      )}

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={6}
        spellCheck={false}
        className="w-full rounded-md bg-ink border border-line px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-accent/60 resize-y"
      />

      <div className="flex items-center justify-between">
        <div className="text-xs">
          {validation === null && sql.trim() && (
            <span className="text-slate-600">Checking…</span>
          )}
          {validation && validation.is_safe && (
            <span className="text-emerald-400">✓ Safe to run</span>
          )}
          {validation && !validation.is_safe && (
            <span className="text-red-400">{validation.reasons.join(" · ")}</span>
          )}
          {executionError && (
  <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-md px-3 py-2 flex items-center justify-between gap-3">
    <span>{executionError}</span>
    <button
      onClick={handleRetry}
      disabled={retrying}
      className="shrink-0 px-2.5 py-1 rounded-md bg-red-900/60 hover:bg-red-900 text-red-200 disabled:opacity-50 transition-colors"
    >
      {retrying ? "Retrying…" : "Retry with AI"}
    </button>
  </div>
)}
      
        </div>

        <button
          onClick={handleRun}
          disabled={!validation?.is_safe || running}
          className="px-4 py-1.5 text-sm rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-40 disabled:hover:bg-accent transition-colors"
        >
          {running ? "Running…" : "Run query"}
        </button>
      </div>
    </div>
  );
}