import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";
import type { Connection, QueryHistoryItem, SchemaSnapshot } from "../type";
import {
  ArrowLeft, ArrowRight, BarChart3, Clock, Database, Gauge, Lightbulb, LogOut,
  MessageSquarePlus, Plus, Search, Settings, Table2, TrendingUp, Zap,
} from "lucide-react";
import { PhantomLogo } from "./PhantomLogo";
import { useThemeTokens } from "../utils/useThemeTokens";
import {
  Button, Card, CodeBlock, EmptyState, Menu, MenuItem, MenuSeparator,
  SectionHeading, Skeleton,
} from "./ui";
import { EXAMPLE_QUESTIONS } from "../utils/sql";

interface Props {
  userName: string;
  connections: Connection[];
  connectionsLoading: boolean;
  onSelectConnection: (id: string) => void;
  onNewConnection: () => void;
  onGoToQuery: () => void;
  onGoToProfile: () => void;
  onLogout: () => void;
}

export default function Dashboard({
  userName, connections, connectionsLoading, onSelectConnection, onNewConnection,
  onGoToQuery, onGoToProfile, onLogout,
}: Props) {
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [stats, setStats] = useState<{
    queries_executed: number; total_rows_retrieved: number; avg_duration_ms: number;
  } | null>(null);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"dashboard" | "history">("dashboard");
  const colors = useThemeTokens();

  useEffect(() => {
    Promise.all([api.getQueryHistory(), api.getQueryStats()])
      .then(([h, s]) => {
        setHistory(h);
        setStats(s);
      })
      .catch(() => {
        /* the panels below each render their own empty state */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    connections.forEach((c) => {
      api
        .getSchema(c.id)
        .then((snapshot: SchemaSnapshot) => {
          setTableCounts((prev) => ({ ...prev, [c.id]: snapshot.tables.length }));
        })
        .catch(() => {});
    });
  }, [connections]);

  const activityData = useMemo(() => buildActivityData(history), [history]);
  const lastUsedByConnection = useMemo(() => buildLastUsed(history), [history]);
  const isNewUser = !connectionsLoading && connections.length === 0 && history.length === 0;

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

  const firstName = userName?.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="min-h-dvh w-full bg-ink text-primary">
      <DashboardHeader
        userName={userName}
        onGoToQuery={onGoToQuery}
        onGoToProfile={onGoToProfile}
        onLogout={onLogout}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary tracking-tight">
              {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
            </h1>
            <p className="text-sm text-muted mt-1">
              Ask a question about your data, and review the SQL before it runs.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" icon={<Plus size={15} />} onClick={onNewConnection}>
              Connect database
            </Button>
            <Button
              variant="primary"
              icon={<MessageSquarePlus size={15} />}
              onClick={onGoToQuery}
              disabled={connections.length === 0}
              title={connections.length === 0 ? "Connect a database first" : undefined}
            >
              New query
            </Button>
          </div>
        </header>

        {isNewUser ? (
          <OnboardingCard onNewConnection={onNewConnection} />
        ) : (
          <div className="space-y-8">
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={<Database size={15} />}
                label="Databases"
                value={connectionsLoading ? null : connections.length}
                hint="Connected in this workspace"
                onClick={onGoToQuery}
              />
              <StatCard
                icon={<Zap size={15} />}
                label="Queries run"
                value={loading ? null : stats?.queries_executed ?? 0}
                hint="View full history"
                onClick={() => setView("history")}
              />
              <StatCard
                icon={<BarChart3 size={15} />}
                label="Rows retrieved"
                value={loading ? null : formatCount(stats?.total_rows_retrieved)}
                hint="Across all queries"
              />
              <StatCard
                icon={<Gauge size={15} />}
                label="Avg. duration"
                value={loading ? null : stats ? `${Math.round(stats.avg_duration_ms)}ms` : "—"}
                hint="Per executed query"
              />
            </section>

            <section>
              <SectionHeading>Query activity</SectionHeading>
              <Card className="p-4">
                <div className="h-52">
                  {loading ? (
                    <Skeleton className="h-full w-full" />
                  ) : activityData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted">
                      Run a query and your activity shows up here.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activityData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                        <XAxis dataKey="date" stroke={colors.axis} fontSize={11} tickLine={false} />
                        <YAxis
                          stroke={colors.axis}
                          fontSize={11}
                          tickLine={false}
                          allowDecimals={false}
                          width={32}
                        />
                        <Tooltip
                          contentStyle={{
                            background: colors.elevated,
                            border: `1px solid ${colors.grid}`,
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Queries"
                          stroke={colors.accent}
                          strokeWidth={2}
                          dot={{ r: 2.5, strokeWidth: 0, fill: colors.accent }}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section>
                <SectionHeading
                  action={
                    history.length > 5 && (
                      <Button size="sm" variant="link" onClick={() => setView("history")}>
                        View all
                      </Button>
                    )
                  }
                >
                  Recent questions
                </SectionHeading>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full rounded-lg" />
                    <Skeleton className="h-14 w-full rounded-lg" />
                  </div>
                ) : history.length === 0 ? (
                  <Card className="px-4 py-6">
                    <p className="text-sm text-muted">
                      No questions asked yet. Try something like “
                      {EXAMPLE_QUESTIONS[0]}”
                    </p>
                  </Card>
                ) : (
                  <ul className="space-y-2">
                    {history.slice(0, 5).map((h) => (
                      <li key={h.id}>
                        <RecentQueryCard
                          item={h}
                          onOpen={() => {
                            onSelectConnection(h.connection_id);
                            onGoToQuery();
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionHeading>Databases</SectionHeading>
                {connectionsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full rounded-lg" />
                    <Skeleton className="h-14 w-full rounded-lg" />
                  </div>
                ) : connections.length === 0 ? (
                  <Card className="px-4 py-6 text-center">
                    <p className="text-sm text-muted">No databases connected yet.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={13} />}
                      onClick={onNewConnection}
                      className="mt-3"
                    >
                      Connect a database
                    </Button>
                  </Card>
                ) : (
                  <ul className="space-y-2">
                    {connections.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <DatabaseCard
                          connection={c}
                          tableCount={tableCounts[c.id]}
                          lastUsed={lastUsedByConnection[c.id]}
                          onClick={() => {
                            onSelectConnection(c.id);
                            onGoToQuery();
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section>
              <SectionHeading>Insights</SectionHeading>
              <Card className="px-4 py-3.5">
                <ul className="space-y-2.5">
                  {buildInsights(history, connections, stats).map((insight, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-secondary">
                      <span className="text-accent shrink-0 mt-0.5" aria-hidden>
                        {insight.icon}
                      </span>
                      {insight.text}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- header -- */

function DashboardHeader({
  userName, onGoToQuery, onGoToProfile, onLogout,
}: {
  userName: string;
  onGoToQuery: () => void;
  onGoToProfile: () => void;
  onLogout: () => void;
}) {
  const initials = userName
    ? userName.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 h-14 px-4 sm:px-6 border-b border-border-subtle bg-panel/95 backdrop-blur">
      <PhantomLogo className="h-6 w-auto text-primary" />
      <div className="flex items-center gap-1">
        <div className="hidden sm:block">
          <Button variant="ghost" size="sm" onClick={onGoToQuery}>
            Workspace
          </Button>
        </div>
        <Menu
          trigger={(props) => (
            <button
              {...props}
              aria-label="Account menu"
              className="w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-[11px] font-semibold text-accent-text hover:border-accent/60 transition-colors"
            >
              {initials}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-3 py-2 border-b border-border-subtle">
                <p className="text-sm font-medium text-primary truncate">{userName || "Account"}</p>
              </div>
              <MenuItem icon={<ArrowRight size={14} />} onClick={() => { close(); onGoToQuery(); }}>
                Go to workspace
              </MenuItem>
              <MenuItem icon={<Settings size={14} />} onClick={() => { close(); onGoToProfile(); }}>
                Settings
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<LogOut size={14} />} onClick={() => { close(); onLogout(); }}>
                Log out
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- cards -- */

function StatCard({
  icon, label, value, hint, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
  hint?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-muted">
        <span className="text-accent" aria-hidden>{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      {value === null ? (
        <Skeleton className="h-8 w-16 mt-1.5" />
      ) : (
        <p className="text-2xl font-semibold text-primary mt-1 tabular-nums">{value}</p>
      )}
      {hint && <p className="text-[11px] text-faint mt-0.5">{hint}</p>}
    </>
  );

  if (!onClick) {
    return <Card className="px-4 py-3.5">{content}</Card>;
  }

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-accent/45 hover:bg-hover"
    >
      {content}
    </button>
  );
}

function RecentQueryCard({ item, onOpen }: { item: QueryHistoryItem; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left px-3.5 py-3 hover:bg-hover transition-colors"
      >
        <p className="text-sm text-secondary line-clamp-2">{item.question}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-faint mt-1">
          <Clock size={11} aria-hidden />
          {timeAgo(item.executed_at)} · {item.row_count.toLocaleString()} rows · {item.duration_ms}ms
        </p>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2 animate-fade-in">
          <CodeBlock code={item.sql} maxHeight="12rem" />
          <Button size="sm" variant="secondary" iconRight={<ArrowRight size={13} />} onClick={onOpen}>
            Open in workspace
          </Button>
        </div>
      )}
    </Card>
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
      className="w-full text-left px-3.5 py-3 rounded-xl border border-line bg-panel hover:border-accent/45 hover:bg-hover transition-colors"
    >
      <div className="flex items-center gap-2">
        <Database size={14} className="text-accent shrink-0" aria-hidden />
        <p className="text-sm font-medium text-primary truncate">{connection.name}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-faint mt-1">
        <span className="font-mono truncate">{connection.database}@{connection.host}</span>
        {tableCount !== undefined && (
          <span className="inline-flex items-center gap-1">
            <Table2 size={10} aria-hidden /> {tableCount} tables
          </span>
        )}
        {lastUsed && <span>Last used {timeAgo(lastUsed)}</span>}
      </p>
    </button>
  );
}

function OnboardingCard({ onNewConnection }: { onNewConnection: () => void }) {
  const STEPS = [
    {
      title: "Connect a database",
      body: "Point Phantom Query at Postgres or MySQL. Use a read-only role if you have one — a read-only session is enforced either way.",
    },
    {
      title: "Ask in plain English",
      body: "Describe what you want to know. Phantom Query reads your schema and writes the SQL for you.",
    },
    {
      title: "Review, then run",
      body: "Every statement is safety-checked and shown to you first. Nothing touches your data until you press Run.",
    },
  ];

  return (
    <Card className="px-5 sm:px-8 py-8 max-w-2xl mx-auto mt-6">
      <h2 className="text-lg font-semibold text-primary">Get started with Phantom Query</h2>
      <p className="text-sm text-muted mt-1">Three steps, about two minutes.</p>

      <ol className="mt-6 space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3.5">
            <span
              className="shrink-0 w-6 h-6 rounded-full bg-accent/12 border border-accent/30 flex items-center justify-center text-[11px] font-semibold text-accent-text"
              aria-hidden
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-primary">{step.title}</p>
              <p className="text-sm text-muted mt-0.5 leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Button
        variant="primary"
        icon={<Plus size={15} />}
        onClick={onNewConnection}
        className="mt-7"
      >
        Connect your first database
      </Button>
    </Card>
  );
}

/* --------------------------------------------------------------- history -- */

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
    <div className="min-h-dvh w-full bg-ink text-primary">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack} className="-ml-3">
          Dashboard
        </Button>

        <h1 className="text-xl font-semibold text-primary mt-3">Query history</h1>
        <p className="text-sm text-muted mt-1">
          {history.length.toLocaleString()} quer{history.length === 1 ? "y" : "ies"} you have run.
        </p>

        {history.length === 0 ? (
          <Card className="mt-6">
            <EmptyState
              icon={<Clock size={18} />}
              title="No queries yet"
              description="Once you run a query it will be recorded here with its row count and duration."
            />
          </Card>
        ) : (
          <ul className="mt-6 space-y-2">
            {history.map((h) => {
              const conn = connections.find((c) => c.id === h.connection_id);
              return (
                <li key={h.id}>
                  <button
                    onClick={() => {
                      onSelectConnection(h.connection_id);
                      onGoToQuery();
                    }}
                    className="w-full text-left px-3.5 py-3 rounded-xl border border-line bg-panel hover:border-accent/45 hover:bg-hover transition-colors"
                  >
                    <p className="text-sm text-secondary">{h.question}</p>
                    <p className="text-[11px] text-faint mt-1">
                      {conn?.name ?? "Deleted connection"} · {h.row_count.toLocaleString()} rows ·{" "}
                      {h.duration_ms}ms · {timeAgo(h.executed_at)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- helpers -- */

function formatCount(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
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

/** Observations derived entirely from data already on this page -- no extra
 *  request, and nothing claimed that the numbers above don't already support. */
function buildInsights(
  history: QueryHistoryItem[],
  connections: Connection[],
  stats: { avg_duration_ms: number } | null
): { icon: React.ReactNode; text: string }[] {
  if (history.length === 0) {
    return [
      {
        icon: <Lightbulb size={14} />,
        text: "Run a few queries and patterns in your usage will show up here.",
      },
    ];
  }

  const insights: { icon: React.ReactNode; text: string }[] = [];

  const connectionCounts = new Map<string, number>();
  for (const h of history) {
    connectionCounts.set(h.connection_id, (connectionCounts.get(h.connection_id) ?? 0) + 1);
  }
  const mostActiveId = [...connectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostActiveConn = connections.find((c) => c.id === mostActiveId);
  if (mostActiveConn && mostActiveId) {
    insights.push({
      icon: <Search size={14} />,
      text: `${mostActiveConn.name} is your most queried database (${connectionCounts.get(mostActiveId)} queries).`,
    });
  }

  if (stats) {
    insights.push({
      icon: <Zap size={14} />,
      text: `Queries take ${Math.round(stats.avg_duration_ms)}ms on average.`,
    });
  }

  insights.push({
    icon: <TrendingUp size={14} />,
    text: `You've run ${history.length} quer${history.length !== 1 ? "ies" : "y"} in total.`,
  });

  return insights;
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
