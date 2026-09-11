import { useState, useEffect, useRef } from "react";
import {
  Bookmark, ChevronDown, Copy, MessageCircleQuestion, MoreHorizontal, Pencil,
  RotateCw, ShieldAlert, ShieldCheck, Sparkles, Trash2,
} from "lucide-react";
import type { ChatTurn, ValidationResult, ExecuteQueryResponse } from "../type";
import { api } from "../api/client";
import ResultsTable from "./ResultsTable";
import SqlReview from "./SqlReview";
import Composer from "./Composer";
import {
  Alert, Badge, Button, Dialog, Input, Menu, MenuItem, MenuSeparator, Skeleton,
} from "./ui";
import { EXAMPLE_QUESTIONS } from "../utils/sql";
import { resolveComposerMode } from "../utils/composerMode";

interface Props {
  chatId: string;
  connectionId: string;
  workspaceId: string;
  workspaceType: "personal" | "team";
  connectionName?: string;
  dbType?: string;
  initialQuestion?: string;
  currentUserId: string;
  onQuerySaved?: () => void;
}

export default function ChatThread({
  chatId, connectionId, workspaceId, workspaceType, connectionName, dbType,
  initialQuestion, currentUserId, onQuerySaved
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<ChatTurn[]>([]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    setLoading(true);
    api
      .getChatTurns(chatId)
      .then(setTurns)
      .finally(() => setLoading(false));
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      const current = turnsRef.current;
      const since = current.length > 0 ? current[current.length - 1].created_at : undefined;
      try {
        const incoming = await api.getChatTurns(chatId, since);
        if (cancelled || incoming.length === 0) return;
        setTurns((existing) => {
          const existingIds = new Set(existing.map((t) => t.id));
          const genuinelyNew = incoming.filter((t) => !existingIds.has(t.id));
          return genuinelyNew.length > 0 ? [...existing, ...genuinelyNew] : existing;
        });
      } catch {
        // ignore poll errors
      }
    }

    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatId]);

  async function handleAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setAskError(null);
    try {
      const turn = await api.addTurn(chatId, question);
      setTurns((prev) => [...prev, turn]);
      setQuestion("");
    } catch (err) {
      setAskError(
        err instanceof Error ? err.message : "Failed to send. Please try again."
      );
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

  /** Example chips prefill with the slash a team workspace needs, so the
   *  suggestion actually reaches Phantom Query rather than the team. */
  function applyExample(example: string) {
    setQuestion(workspaceType === "team" ? `/${example}` : example);
  }

  const composerMode = resolveComposerMode(question, workspaceType);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto w-full max-w-3xl px-3 sm:px-6 py-5 sm:py-6">
          {loading ? (
            <ThreadSkeleton />
          ) : turns.length === 0 ? (
            <EmptyThread
              workspaceType={workspaceType}
              connectionName={connectionName}
              onPickExample={applyExample}
            />
          ) : (
            <ol className="space-y-6">
              {turns.map((turn) => (
                <li key={turn.id}>
                  <TurnBlock
                    turn={turn}
                    connectionId={connectionId}
                    workspaceId={workspaceId}
                    dbType={dbType}
                    currentUserId={currentUserId}
                    onQuerySaved={onQuerySaved}
                    onUpdate={(t) =>
                      setTurns((prev) => prev.map((p) => (p.id === t.id ? t : p)))
                    }
                    onDelete={() => handleDeleteTurn(turn.id)}
                    onEdited={handleTurnEdited}
                  />
                </li>
              ))}
            </ol>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        value={question}
        onChange={setQuestion}
        onSubmit={handleAsk}
        workspaceType={workspaceType}
        connectionName={connectionName}
        busy={asking}
        error={askError}
        onDismissError={() => setAskError(null)}
      />

      {/* Announces the pending state to assistive tech without stealing focus. */}
      <p className="sr-only" role="status" aria-live="polite">
        {asking
          ? composerMode === "query"
            ? "Phantom Query is writing SQL for your question."
            : "Sending your message."
          : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- skeleton -- */

function ThreadSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading conversation">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-2/3 rounded-2xl" />
      </div>
      <div className="rounded-xl border border-line bg-panel p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- empty state -- */

function EmptyThread({
  workspaceType, connectionName, onPickExample,
}: {
  workspaceType: "personal" | "team";
  connectionName?: string;
  onPickExample: (example: string) => void;
}) {
  return (
    <div className="py-6 sm:py-10">
      <div className="flex items-center gap-2.5 mb-2">
        <span
          className="w-8 h-8 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center text-accent"
          aria-hidden
        >
          <Sparkles size={15} />
        </span>
        <h2 className="text-base font-semibold text-primary">
          Ask a question about {connectionName ?? "your data"}
        </h2>
      </div>

      <p className="text-sm text-muted leading-relaxed max-w-xl">
        Describe what you want to know in plain English. Phantom Query writes the SQL,
        checks it is read-only, and shows it to you — nothing touches the database until
        you press Run.
        {workspaceType === "team" && (
          <>
            {" "}
            In this shared workspace, start your message with{" "}
            <code className="font-mono text-accent-text">/</code> to ask Phantom Query;
            anything else goes to your teammates.
          </>
        )}
      </p>

      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2.5">
          Try one of these
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <li key={example}>
              <button
                onClick={() => onPickExample(example)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-line bg-panel
                  text-sm text-secondary hover:border-accent/45 hover:text-primary hover:bg-hover
                  transition-colors"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ one turn -- */

function TurnBlock({
  turn, connectionId, workspaceId, dbType, currentUserId, onUpdate, onDelete, onEdited, onQuerySaved
}: {
  turn: ChatTurn;
  connectionId: string;
  workspaceId: string;
  dbType?: string;
  currentUserId: string;
  onUpdate: (t: ChatTurn) => void;
  onDelete: () => void;
  onEdited: (t: ChatTurn) => void;
  onQuerySaved?: () => void;
}) {
  const isMessage = turn.kind === "message";
  const isOwn = !turn.author_user_id || turn.author_user_id === currentUserId;

  // — Query-only state —
  // Proposals open by default: the review is the point of the card, so it has
  // to be seen before it can be folded away.
  const [collapsed, setCollapsed] = useState(false);
  const [sql, setSql] = useState(turn.edited_sql || turn.generated_sql || "");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [results, setResults] = useState<ExecuteQueryResponse | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  // — Shared state —
  const [deleting, setDeleting] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editText, setEditText] = useState(turn.question);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (isMessage) return;
    setSql(turn.edited_sql || turn.generated_sql || "");
    setResults(null);
    setRunError(null);
    setExplanation(null);
  }, [turn.generated_sql, turn.edited_sql, isMessage]);

  useEffect(() => {
    if (isMessage || !sql) return;
    setValidating(true);
    const timeout = setTimeout(() => {
      api
        .validateSql(connectionId, sql)
        .then(setValidation)
        .catch(() => setValidation(null))
        .finally(() => setValidating(false));
    }, 400);
    return () => clearTimeout(timeout);
  }, [sql, isMessage, connectionId]);

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await api.executeSql(connectionId, sql, turn.question);
      setResults(res);
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

   async function handleSaveQuery(name: string) {
    await api.saveQuery(connectionId, workspaceId, name, turn.question, sql);
    setSaved(true);
    setSaveDialogOpen(false);
    onQuerySaved?.();
  }

  async function handleDeleteTurn() {
    if (!confirm("Delete this message? This can't be undone.")) return;
    setDeleting(true);
    try {
      await api.deleteTurn(turn.id);
      onDelete();
    } catch {
      setDeleting(false);
    }
  }

  async function handleSaveEdit() {
    if (!editText.trim()) return;
    if (!confirm("This regenerates the answer and removes everything after it. Continue?")) return;
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

  /* ------------------------------------------------- plain team message -- */
  if (isMessage) {
    return (
      <div className={deleting ? "opacity-40 pointer-events-none" : undefined}>
        <MessageBubble
          author={isOwn ? "You" : turn.author_name ?? "Unknown"}
          isOwn={isOwn}
          text={turn.question}
          timestamp={turn.created_at}
          onDelete={isOwn ? handleDeleteTurn : undefined}
        />
      </div>
    );
  }

  /* ------------------------------------------------------- query turn -- */
  return (
    <div className={`space-y-3 ${deleting ? "opacity-40 pointer-events-none" : ""}`}>
      {/* The question, prominent -- it is what the user actually cares about. */}
      {editingQuestion ? (
        <div className="rounded-xl border border-accent/45 bg-panel p-3 space-y-2.5">
          <label htmlFor={`edit-${turn.id}`} className="block text-xs font-medium text-secondary">
            Rewrite your question
          </label>
          <textarea
            id={`edit-${turn.id}`}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-md bg-raised border border-line px-3 py-2 text-sm
              text-primary focus:outline-none focus:border-accent resize-y"
          />
          {editError && <p className="text-xs text-danger">{editError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingQuestion(false);
                setEditText(turn.question);
                setEditError(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={savingEdit} onClick={handleSaveEdit}>
              Regenerate
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-faint mb-1">
              {isOwn ? "You asked" : `${turn.author_name ?? "Someone"} asked`}
            </p>
            <h2 className="text-base sm:text-lg font-semibold text-primary leading-snug wrap-break-word">
              {turn.question}
            </h2>
          </div>

          <Menu
            trigger={(props) => (
              <button
                {...props}
                aria-label="Query actions"
                className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center
                  text-faint hover:text-primary hover:bg-hover transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<Copy size={14} />}
                  onClick={() => { navigator.clipboard.writeText(turn.question); close(); }}
                >
                  Copy question
                </MenuItem>
                <MenuItem
                  icon={<Copy size={14} />}
                  onClick={() => { navigator.clipboard.writeText(sql); close(); }}
                >
                  Copy SQL
                </MenuItem>
                <MenuItem
                  icon={<Pencil size={14} />}
                  onClick={() => { close(); setEditingQuestion(true); }}
                >
                  Edit question
                </MenuItem>
                <MenuItem
                  icon={<Bookmark size={14} />}
                  onClick={() => { close(); setSaveDialogOpen(true); }}
                >
                  {saved ? "Saved" : "Save query"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Trash2 size={14} />}
                  onClick={() => { close(); handleDeleteTurn(); }}
                >
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}

      {/* Phantom's proposal. */}
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        {/* The whole bar toggles. Collapsed, it still reports the safety
            verdict and row count -- folding a proposal away should never hide
            whether it passed review or what it returned. */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls={`proposal-${turn.id}`}
          className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-hover
            transition-colors ${collapsed ? "" : "border-b border-border-subtle"}`}
        >
          <ChevronDown
            size={13}
            className={`text-faint shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden
          />
          <span
            className="w-5 h-5 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0"
            aria-hidden
          >
            <Sparkles size={11} />
          </span>
          <span className="text-xs font-medium text-primary">Phantom Query</span>
          <span className="text-xs text-faint truncate">
            {turn.executed ? "ran this query" : "proposed this query"}
          </span>

          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            {collapsed && validation?.is_safe && (
              <Badge tone="accent" icon={<ShieldCheck size={9} />}>Read-only</Badge>
            )}
            {collapsed && validation && !validation.is_safe && (
              <Badge tone="danger" icon={<ShieldAlert size={9} />}>Blocked</Badge>
            )}
            {turn.executed && (
              <Badge tone="neutral">
                {turn.row_count ?? 0} row{turn.row_count === 1 ? "" : "s"}
                {turn.duration_ms != null && ` · ${turn.duration_ms}ms`}
              </Badge>
            )}
          </span>
        </button>

        <div id={`proposal-${turn.id}`} className="p-4" hidden={collapsed}>
          <SqlReview
            sql={sql}
            onSqlChange={setSql}
            validation={validation}
            validating={validating}
            dbType={dbType}
            running={running}
            hasRun={turn.executed}
            onRun={handleRun}
            actions={
              <Button
                variant="secondary"
                icon={<MessageCircleQuestion size={14} />}
                loading={explaining}
                onClick={handleExplain}
              >
                Explain
              </Button>
            }
          />

          {explanation && (
            <div className="mt-3">
              <Alert tone="info" title="What this query does">
                {explanation}
              </Alert>
            </div>
          )}

          {runError && (
            <div className="mt-3">
              <Alert
                tone="danger"
                title="The database rejected this query"
                action={
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<RotateCw size={13} />}
                    loading={retrying}
                    onClick={handleRetryWithAI}
                  >
                    Fix with AI
                  </Button>
                }
              >
                {runError}
              </Alert>
            </div>
          )}
        </div>

        {results && !collapsed && (
          <div className="border-t border-border-subtle bg-ink/40">
            <ResultsTable
              results={results}
              question={turn.question}
              sql={sql}
              dbType={dbType}
            />
          </div>
        )}
      </div>

      {saveDialogOpen && (
        <SaveQueryDialog
          defaultName={turn.question.slice(0, 60)}
          onSave={handleSaveQuery}
          onClose={() => setSaveDialogOpen(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------- team message -- */

function MessageBubble({
  author, isOwn, text, timestamp, onDelete,
}: {
  author: string;
  isOwn: boolean;
  text: string;
  timestamp: string;
  onDelete?: () => void;
}) {
  const initials = author
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`group flex items-start gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      <span
        className="shrink-0 w-7 h-7 rounded-full bg-raised border border-line flex items-center justify-center text-[10px] font-semibold text-muted"
        aria-hidden
      >
        {initials || "?"}
      </span>

      <div className={`min-w-0 max-w-[85%] ${isOwn ? "text-right" : ""}`}>
        <p className="text-[11px] text-faint mb-1 px-1">
          {author} · {formatTime(timestamp)}
        </p>
        <div
          className={`inline-block text-left px-3.5 py-2 rounded-2xl ${
            isOwn
              ? "bg-accent/12 border border-accent/20 rounded-br-sm"
              : "bg-panel border border-line rounded-bl-sm"
          }`}
        >
          <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap wrap-break-word">
            {text}
          </p>
        </div>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label="Delete message"
          className="shrink-0 mt-6 w-7 h-7 rounded flex items-center justify-center text-faint
            opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100
            hover:text-danger hover:bg-hover transition-all"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------- save query dialog -- */

function SaveQueryDialog({
  defaultName, onSave, onClose,
}: {
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this query.");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title="Save this query"
      description="It appears under Saved queries for everyone in this workspace."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => handleSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
          required
        />
      </form>
    </Dialog>
  );
}

function formatTime(isoString: string): string {
  return new Date(isoString + "Z").toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
