import { useState, useEffect, useRef } from "react";
import { Copy, Pencil, Trash2, Sparkles, MoreHorizontal, Play, Check, AlertTriangle, ChevronDown, ChevronRight, MessageCircleQuestion, Bookmark } from "lucide-react";
import type { ChatTurn, ValidationResult, ExecuteQueryResponse } from "../type";
import { api } from "../api/client";
import ResultsTable from "./ResultsTable";


interface Props {
  chatId: string;
  connectionId: string;
  workspaceId: string;
  dbType?: string;
  initialQuestion?: string;
  onHeaderVisibilityChange?: (visible: boolean) => void;
}
export default function ChatThread({ chatId, connectionId, workspaceId, dbType, initialQuestion, onHeaderVisibilityChange }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    setLoading(true);
    api.getChatTurns(chatId)
      .then(setTurns)
      .finally(() => setLoading(false));
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function handleScroll() {
      const currentY = container!.scrollTop;
      if (currentY <= 10) {
        onHeaderVisibilityChange?.(true);
      } else if (currentY < lastScrollY.current) {
        onHeaderVisibilityChange?.(true);
      } else if (currentY > lastScrollY.current) {
        onHeaderVisibilityChange?.(false);
      }
      lastScrollY.current = currentY;
    }

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [onHeaderVisibilityChange]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAskError(null);
    try {
      const turn = await api.addTurn(chatId, question);
      setTurns((prev) => [...prev, turn]);
      setQuestion("");
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Failed to generate SQL. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  function handleDeleteTurn(turnId: string) {
    setTurns((prev) => prev.filter((t) => t.id !== turnId));
  }

  function handleTurnEdited(editedTurn: ChatTurn) {
    setTurns((prev) => {
      const index = prev.findIndex((t) => t.id === editedTurn.id);
      if (index === -1) return prev;
      return [...prev.slice(0, index), editedTurn];
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="px-6 py-6">
          {loading ? (
            <p className="text-sm text-muted">Loading conversation…</p>
          ) : turns.length === 0 ? (
            <p className="text-sm text-muted">Ask a question to start this chat.</p>
          ) : (
            turns.map((turn, i) => (
              <TurnBlock
                key={turn.id}
                turn={turn}
                connectionId={connectionId}
                workspaceId={workspaceId}
                isFirst={i === 0}
                dbType={dbType}
                onUpdate={(t) => setTurns((prev) => prev.map((p) => (p.id === t.id ? t : p)))}
                onDelete={() => handleDeleteTurn(turn.id)}
                onEdited={handleTurnEdited}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border-subtle shrink-0">
        <form onSubmit={handleAsk} className="px-6 py-4 space-y-2">
          {askError && <p className="text-xs text-danger">{askError}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Phantom about your data..."
              disabled={asking}
              className="flex-1 rounded-full bg-panel border border-border-subtle px-4 py-2.5 text-sm text-primary placeholder:text-faint focus:outline-none focus:border-accent/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="px-5 py-2.5 text-sm rounded-full bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-40 transition-colors"
            >
              {asking ? "Thinking…" : "Ask"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TurnBlock({
  turn, connectionId, workspaceId, dbType, isFirst, onUpdate, onDelete, onEdited,
}: {
  turn: ChatTurn;
  connectionId: string;
  workspaceId: string;
  dbType?: string;
  isFirst: boolean;
  onUpdate: (t: ChatTurn) => void;
  onDelete: () => void;
  onEdited: (t: ChatTurn) => void;
}) {
  const isMessage = turn.kind === "message";

  // — Query-only state —
  const [resultsCollapsed, setResultsCollapsed] = useState(true);
  const [sql, setSql] = useState(turn.edited_sql || turn.generated_sql || "");
  const [editingSql, setEditingSql] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [results, setResults] = useState<ExecuteQueryResponse | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // — Shared state —
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editText, setEditText] = useState(turn.question);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSaveQuery() {
    const name = prompt("Name this saved query:", turn.question.slice(0, 50));
    if (!name) return;
    setSaving(true);
    try {
      await api.saveQuery(connectionId, workspaceId, name, turn.question, sql);
      setSaved(true);
      setMenuOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save query.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExplain() {
    setExplaining(true);
    try {
      const res = await api.explainSql(sql);
      setExplanation(res.explanation);
    } catch (err) {
      setExplanation(err instanceof Error ? err.message : "Failed to explain query.");
    } finally {
      setExplaining(false);
    }
  }

  useEffect(() => {
    if (isMessage) return;
    setSql(turn.edited_sql || turn.generated_sql || "");
    setResults(null);
    setRunError(null);
    setEditingSql(false);
    setExplanation(null);
  }, [turn.generated_sql, turn.edited_sql, isMessage]);

  useEffect(() => {
    if (isMessage || !sql) return;
    const timeout = setTimeout(() => {
      api.validateSql(connectionId, sql).then(setValidation).catch(() => setValidation(null));
    }, 400);
    return () => clearTimeout(timeout);
  }, [sql, isMessage]);

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await api.executeSql(connectionId, sql, turn.question);
      setResults(res);
      setResultsCollapsed(false);
      const updated = await api.updateTurn(turn.id, {
        edited_sql: sql !== turn.generated_sql ? sql : undefined,
        executed: true,
        row_count: res.row_count,
      });
      onUpdate(updated);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Query execution failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleRetryWithAI() {
    if (!runError) return;
    setRetrying(true);
    try {
      const retried = await api.retrySql(connectionId, turn.question, sql, runError);
      setSql(retried.sql);
      setRunError(null);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleDeleteTurn() {
    if (!confirm("Delete this message?")) return;
    setDeleting(true);
    try {
      await api.deleteTurn(turn.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  function handleCopySql () {
    navigator.clipboard.writeText(sql);
    setMenuOpen(false);
  }

  function handleCopyQuestion() {
    navigator.clipboard.writeText(turn.question);
    setMenuOpen(false);
  }

  async function handleSaveEdit() {
    if (!editText.trim()) return;
    if (!confirm("This will regenerate this message and remove everything after it. Continue?")) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await api.editTurn(turn.id, editText);
      onEdited(updated);
      setEditingQuestion(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to regenerate. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  const displayName = turn.author_name ?? "You";

  return (
    <div className={`${!isFirst ? "pt-6 mt-6 border-t border-border-subtle" : ""} ${deleting ? "opacity-40 pointer-events-none" : ""}`}>
      {/* User bubble */}
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%]">
          {editingQuestion && !isMessage ? (
            <div className="bg-panel border border-border-subtle rounded-2xl rounded-br-sm px-4 py-3 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="w-full bg-transparent text-sm text-primary focus:outline-none resize-none"
              />
              <div className="flex gap-3 items-center justify-end">
                {editError && <p className="text-xs text-danger mr-auto">{editError}</p>}
                <button onClick={() => { setEditingQuestion(false); setEditText(turn.question); setEditError(null); }} className="text-xs text-muted hover:text-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveEdit} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
                  {savingEdit ? "Regenerating…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-panel rounded-2xl rounded-br-sm px-4 py-2.5">
              <p className="text-[11px] text-faint font-medium mb-0.5">{displayName}</p>
              <p className="text-sm text-primary leading-relaxed">{turn.question}</p>
            </div>
          )}
        </div>
      </div>

      {/* Message turns: no Phantom response box */}
      {isMessage ? (
        <></>
      ) : (
        /* Query turns: full Phantom response */
        <div className="relative rounded-2xl rounded-tl-sm border border-border-subtle bg-panel px-5 py-4">
          <div className="absolute right-3 top-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="text-faint hover:text-secondary p-1">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-6 z-50 bg-elevated border border-border-subtle rounded-lg shadow-lg py-1 min-w-36">
                  <button onClick={handleCopyQuestion} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover">
                    <Copy size={14} /> Copy question
                  </button>
                  <button onClick={handleCopySql} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover">
                    <Copy size={14} /> Copy SQL
                  </button>
                  <button onClick={() => { setMenuOpen(false); setEditingQuestion(true); }} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover">
                    <Pencil size={14} /> Edit
                  </button>
                  <button onClick={handleSaveQuery} disabled={saving} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover disabled:opacity-50">
                    <Bookmark size={14} /> {saved ? "Saved" : saving ? "Saving…" : "Save query"}
                  </button>
                  <div className="my-1 border-t border-border-subtle" />
                  <button onClick={() => { setMenuOpen(false); handleDeleteTurn(); }} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-danger hover:bg-hover">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-hover">
              <Sparkles size={11} />
            </span>
            <span className="text-[13px] font-medium text-primary">Phantom</span>
            {validation?.is_safe && (
              <span className="flex items-center gap-1 text-[11px] text-accent-hover">
                <Check size={12} /> READ-ONLY
              </span>
            )}
            {validation && !validation.is_safe && (
              <span className="flex items-center gap-1 text-[11px] text-danger">
                <AlertTriangle size={12} /> BLOCKED
              </span>
            )}
            {turn.executed && <span className="text-[11px] text-faint">· ran</span>}
          </div>

          <p className="text-sm text-secondary leading-relaxed mb-3">
            {turn.executed ? "Here's the query I ran to answer that." : "I've generated the query below. Review it, then run it when you're ready."}
          </p>

          <div className="rounded-lg border border-border-subtle bg-ink overflow-hidden mb-3">
            <div className="px-3 py-1.5 border-b border-border-subtle text-[11px] text-faint">SQL Query</div>
            {editingSql ? (
              <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={5} spellCheck={false} className="w-full bg-transparent px-3 py-2.5 text-xs font-mono text-primary focus:outline-none resize-y" autoFocus />
            ) : (
              <pre className="px-3 py-2.5 text-xs font-mono text-primary whitespace-pre-wrap wrap-break-word">{sql}</pre>
            )}
          </div>

          {explanation && (
            <div className="rounded-md bg-accent/10 border border-accent/30 px-3 py-2 mb-3">
              <p className="text-xs text-secondary leading-relaxed">{explanation}</p>
            </div>
          )}

          {validation && !validation.is_safe && (
            <p className="text-xs text-danger mb-3">{validation.reasons.join(" · ")}</p>
          )}

          {runError && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-danger/10 border border-danger/30 px-3 py-2 mb-3">
              <span className="text-xs text-danger">{runError}</span>
              <button onClick={handleRetryWithAI} disabled={retrying} className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-danger/20 hover:bg-danger/30 text-danger disabled:opacity-50">
                {retrying ? "Retrying…" : "Retry with AI"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleRun} disabled={!validation?.is_safe || running} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-40 transition-colors">
              <Play size={13} /> {running ? "Running…" : "Run Query"}
            </button>
            <button onClick={() => setEditingSql(!editingSql)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border border-border-subtle text-secondary hover:bg-hover transition-colors">
              <Pencil size={13} /> {editingSql ? "Done Editing" : "Edit Query"}
            </button>
            <button onClick={handleCopySql} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border border-border-subtle text-secondary hover:bg-hover transition-colors">
              <Copy size={13} /> Copy SQL
            </button>
            <button onClick={handleExplain} disabled={explaining} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border border-border-subtle text-secondary hover:bg-hover transition-colors disabled:opacity-50">
              <MessageCircleQuestion size={13} /> {explaining ? "Explaining…" : "Explain Query"}
            </button>
          </div>

          {results && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <button onClick={() => setResultsCollapsed(!resultsCollapsed)} className="text-xs font-medium text-primary hover:text-accent-hover flex items-center gap-1.5 mb-2">
                {resultsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                View Results ({results.row_count} rows)
              </button>
              {!resultsCollapsed && (
                <div className="-mx-1 rounded-lg border border-border-subtle bg-ink">
                  <ResultsTable results={results} question={turn.question} sql={sql} dbType={dbType} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}