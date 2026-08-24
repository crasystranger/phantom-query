import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";
import type { Connection, QueryHistoryItem, SchemaSnapshot } from "../type";
import {
  Database, Zap, BarChart3, Star, Brain, Search, TrendingUp, Lightbulb, Plus, MessageSquarePlus,
} from "lucide-react";

interface Props {
  userName: string;
  connections: Connection[];
  onSelectConnection: (id: string) => void;
  onNewConnection: () => void;
  onGoToQuery: () => void;
}

export default function Dashboard({
  userName,
  connections,
  onSelectConnection,
  onNewConnection,
  onGoToQuery,
}: Props) {
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [stats, setStats] = useState<{ queries_executed: number; total_rows_retrieved: number; avg_duration_ms: number } | null>(null);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"dashboard" | "history">("dashboard");

  useEffect(() => {
    Promise.all([api.getQueryHistory(), api.getQueryStats()])
      .then(([h, s]) => {
        setHistory(h);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    connections.forEach((c) => {
      api.getSchema(c.id).then((snapshot: SchemaSnapshot) => {
        setTableCounts((prev) => ({ ...prev, [c.id]: snapshot.tables.length }));
      }).catch(() => {});
    });
  }, [connections]);

  const activityData = useMemo(() => buildActivityData(history), [history]);
  const lastUsedByConnection = useMemo(() => buildLastUsed(history), [history]);
  const isNewUser = connections.length === 0 && history.length === 0;

  if (view === "history") {
    return (
      <HistoryPage
        history={history}
        connections={connections}
        onBack={() => setView("dashboard")}
        onSelectConnection={onSelectConnection}
        onGoToQuery={onGoToQuery}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-ink text-slate-200">
      <div className="w-full px-8 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Welcome back, {userName}</h1>
            <p className="text-slate-500 mt-1">Ready to explore your data?</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onNewConnection}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <Plus size={15} /> Connect Database
            </button>
            <button
              onClick={onGoToQuery}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-line text-slate-300 hover:border-accent/50 hover:text-accent-hover text-sm font-medium transition-colors"
            >
              <MessageSquarePlus size={15} /> New Query
            </button>
          </div>
        </header>

        {isNewUser ? (
          <OnboardingCard onNewConnection={onNewConnection} />
        ) : (
          <>
            <section className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={<Database size={16} />} label="Databases" value={connections.length} onClick={onGoToQuery} />
              <StatCard icon={<Zap size={16} />} label="Queries" value={stats?.queries_executed ?? "—"} onClick={() => setView("history")} />
              <StatCard icon={<BarChart3 size={16} />} label="Rows Retrieved" value={formatCount(stats?.total_rows_retrieved)} disabled />
              <StatCard icon={<Star size={16} />} label="Saved Queries" value="—" disabled />
            </section>

            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Query Activity</h2>
              <div className="h-56 bg-panel border border-line rounded-lg p-4">
                {activityData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-600">
                    Run some queries to see activity here.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262b35" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #262b35" }} />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <section>
                <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Recent Queries</h2>
                {loading ? (
                  <p className="text-sm text-slate-600">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-600">No queries yet — ask your first question to get started.</p>
                ) : (
                  <div className="space-y-1.5">
                    {history.slice(0, 5).map((h) => (
                      <RecentQueryCard
                        key={h.id}
                        item={h}
                        expanded={expandedQueryId === h.id}
                        onToggleExpand={() => setExpandedQueryId(expandedQueryId === h.id ? null : h.id)}
                        onOpen={() => {
                          onSelectConnection(h.connection_id);
                          onGoToQuery();
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Recent Databases</h2>
                {connections.length === 0 ? (
                  <p className="text-sm text-slate-600">No connections yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {connections.slice(0, 5).map((c) => (
                      <DatabaseCard
                        key={c.id}
                        connection={c}
                        tableCount={tableCounts[c.id]}
                        lastUsed={lastUsedByConnection[c.id]}
                        onClick={() => {
                          onSelectConnection(c.id);
                          onGoToQuery();
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section>
              <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
                AI Insights <span className="normal-case text-slate-600">(preview)</span>
              </h2>
              <div className="rounded-lg border border-line bg-panel px-4 py-4">
                <ul className="space-y-2 text-sm text-slate-400">
                  {buildInsights(history, connections, stats).map((insight, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {insight.icon}
                      {insight.text}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, onClick, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className={`text-left rounded-lg border border-line bg-panel px-4 py-3 transition-colors ${
        disabled ? "opacity-50 cursor-default" : "hover:border-accent/50 hover:bg-panel/70 cursor-pointer"
      }`}
    >
      <div className="flex items-center gap-2 text-accent-hover">
        {icon}
        <p className="text-2xl font-semibold text-slate-100">{value}</p>
      </div>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </button>
  );
}

function RecentQueryCard({
  item, expanded, onToggleExpand, onOpen,
}: {
  item: QueryHistoryItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-md border border-line hover:border-accent/50 transition-colors">
      <button onClick={onToggleExpand} className="w-full text-left px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-sm text-slate-300 truncate">
          <Brain size={13} className="text-accent-hover shrink-0" /> {item.question}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          Generated SQL available · {timeAgo(item.executed_at)}
        </p>
      </button>
      {expanded && (
        <div className="px-3 pb-2.5">
          <pre className="text-xs font-mono text-slate-400 bg-ink border border-line rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
            {item.sql}
          </pre>
          <button onClick={onOpen} className="mt-2 text-xs text-accent-hover hover:underline">
            Open in query workspace →
          </button>
        </div>
      )}
    </div>
  );
}

function DatabaseCard({
  connection, tableCount, lastUsed, onClick,
}: {
  connection: Connection;
  tableCount: number | undefined;
  lastUsed: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-md border border-line hover:border-accent/50 hover:bg-panel transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <p className="text-sm text-slate-300">{connection.name}</p>
      </div>
      <p className="text-xs text-slate-600 mt-0.5">
        PostgreSQL · {tableCount !== undefined ? `${tableCount} tables` : "…"}
        {lastUsed && ` · Last used ${timeAgo(lastUsed)}`}
      </p>
    </button>
  );
}

function OnboardingCard({ onNewConnection }: { onNewConnection: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-6 py-8 text-center max-w-lg mx-auto mt-12">
      <h2 className="text-lg font-medium text-slate-100">Welcome to Phantom Query</h2>
      <ol className="mt-4 text-sm text-slate-400 space-y-1.5 text-left inline-block">
        <li>1. Connect a database</li>
        <li>2. Ask your first question</li>
        <li>3. View insights here</li>
      </ol>
      <button
        onClick={onNewConnection}
        className="mt-6 flex items-center gap-1.5 mx-auto px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
      >
        <Plus size={15} /> Connect Database
      </button>
    </div>
  );
}

function HistoryPage({
  history, connections, onBack, onSelectConnection, onGoToQuery,
}: {
  history: QueryHistoryItem[];
  connections: Connection[];
  onBack: () => void;
  onSelectConnection: (id: string) => void;
  onGoToQuery: () => void;
}) {
  return (
    <div className="min-h-screen w-full bg-ink text-slate-200 px-8 py-8">
      <button onClick={onBack} className="text-xs text-slate-500 hover:text-accent-hover mb-4">
        ← Dashboard
      </button>
      <h1 className="text-xl font-semibold text-slate-100 mb-4">Query History</h1>
      <div className="space-y-1.5 max-w-2xl">
        {history.map((h) => {
          const conn = connections.find((c) => c.id === h.connection_id);
          return (
            <button
              key={h.id}
              onClick={() => {
                onSelectConnection(h.connection_id);
                onGoToQuery();
              }}
              className="w-full text-left px-3 py-2.5 rounded-md border border-line hover:border-accent/50 hover:bg-panel transition-colors"
            >
              <p className="flex items-center gap-1.5 text-sm text-slate-300">
                <Brain size={13} className="text-accent-hover shrink-0" /> {h.question}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {conn?.name ?? "Unknown DB"} · {h.row_count} rows · {h.duration_ms}ms · {timeAgo(h.executed_at)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatCount(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString + "Z").getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function buildActivityData(history: QueryHistoryItem[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const h of history) {
    const day = h.executed_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date: date.slice(5), count }));
}

function buildLastUsed(history: QueryHistoryItem[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of history) {
    if (!result[h.connection_id] || h.executed_at > result[h.connection_id]) {
      result[h.connection_id] = h.executed_at;
    }
  }
  return result;
}

function buildInsights(
  history: QueryHistoryItem[],
  connections: Connection[],
  stats: { avg_duration_ms: number } | null
): { icon: React.ReactNode; text: string }[] {
  if (history.length === 0) {
    return [{ icon: <Lightbulb size={14} className="text-accent-hover" />, text: "Run a few queries and insights will start showing up here." }];
  }

  const insights: { icon: React.ReactNode; text: string }[] = [];

  const connectionCounts = new Map<string, number>();
  for (const h of history) {
    connectionCounts.set(h.connection_id, (connectionCounts.get(h.connection_id) ?? 0) + 1);
  }
  const mostActiveId = [...connectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostActiveConn = connections.find((c) => c.id === mostActiveId);
  if (mostActiveConn) {
    insights.push({
      icon: <Search size={14} className="text-accent-hover" />,
      text: `Most active database: ${mostActiveConn.name} (${connectionCounts.get(mostActiveId!)} queries)`,
    });
  }

  if (stats) {
    insights.push({ icon: <Zap size={14} className="text-accent-hover" />, text: `Average execution time: ${stats.avg_duration_ms}ms` });
  }

  insights.push({ icon: <TrendingUp size={14} className="text-accent-hover" />, text: `You've run ${history.length} quer${history.length !== 1 ? "ies" : "y"} total.` });

  return insights;
}