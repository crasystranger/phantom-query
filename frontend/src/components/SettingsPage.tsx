import { useEffect, useState } from "react";
import { api } from "../api/client";
import { loadTheme, saveTheme, darken, type ThemeState } from "../theme";
import type { AuditLog } from "../type";
import {
  ArrowLeft, Bell, Check, Clock, Construction, Database, FileClock, FileText,
  FolderKanban, Globe, KeyRound, Keyboard, Lock, Menu as MenuIcon, Monitor,
  Paintbrush, Palette, Plug, Puzzle, Settings, ShieldCheck, Trash2, Upload,
  User, Webhook, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PhantomLogo } from "./PhantomLogo";
import {
  Alert, Badge, Button, Card, EmptyState, Input, SectionHeading, Select, Skeleton,
} from "./ui";

interface Props {
  onBack: () => void;
  workspaceId: string | null;
}

type SectionId =
  | "account" | "personal" | "workspace"
  | "appearance" | "notifications" | "language" | "shortcuts"
  | "password" | "sessions" | "2fa" | "api-keys"
  | "connections" | "history" | "exports" | "data-controls"
  | "audit-logs"
  | "api" | "webhooks" | "integrations"
  | "delete-account";

interface NavGroup {
  label: string;
  items: { id: SectionId; label: string; icon: LucideIcon; ready: boolean }[];
}

const NAV: NavGroup[] = [
  {
    label: "Profile",
    items: [
      { id: "account", label: "Account", icon: User, ready: true },
      { id: "personal", label: "Personal information", icon: FileText, ready: true },
      { id: "workspace", label: "Workspace", icon: FolderKanban, ready: false },
    ],
  },
  {
    label: "Preferences",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette, ready: true },
      { id: "notifications", label: "Notifications", icon: Bell, ready: false },
      { id: "language", label: "Language", icon: Globe, ready: false },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, ready: false },
    ],
  },
  {
    label: "Security",
    items: [
      { id: "password", label: "Password", icon: KeyRound, ready: true },
      { id: "sessions", label: "Sessions", icon: Monitor, ready: false },
      { id: "2fa", label: "Two-factor auth", icon: ShieldCheck, ready: false },
      { id: "api-keys", label: "API keys", icon: Lock, ready: false },
    ],
  },
  {
    label: "Data & connections",
    items: [
      { id: "connections", label: "Database connections", icon: Plug, ready: true },
      { id: "history", label: "Query history", icon: Clock, ready: true },
      { id: "audit-logs", label: "Activity log", icon: FileClock, ready: true },
      { id: "exports", label: "Exported data", icon: Upload, ready: false },
      { id: "data-controls", label: "Data controls", icon: Database, ready: false },
    ],
  },
  {
    label: "Developer",
    items: [
      { id: "api", label: "API", icon: Settings, ready: false },
      { id: "webhooks", label: "Webhooks", icon: Webhook, ready: false },
      { id: "integrations", label: "Integrations", icon: Puzzle, ready: false },
    ],
  },
];

const ALL_ITEMS = [
  ...NAV.flatMap((g) => g.items),
  { id: "delete-account" as SectionId, label: "Delete account", icon: Trash2, ready: false },
];

export default function SettingsPage({ onBack, workspaceId }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("account");
  const [navOpen, setNavOpen] = useState(false);

  const activeLabel = ALL_ITEMS.find((i) => i.id === activeSection)?.label ?? "Settings";

  return (
    <div className="min-h-dvh w-full bg-ink text-primary">
      {/* Mobile bar: the current section is the title, and the whole nav is one
          tap away rather than a squeezed-in rail. */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b border-border-subtle bg-panel">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open settings navigation"
          className="w-9 h-9 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors"
        >
          <MenuIcon size={17} />
        </button>
        <span className="text-sm font-semibold text-primary truncate">{activeLabel}</span>
        <Button variant="ghost" size="sm" onClick={onBack} className="ml-auto">
          Done
        </Button>
      </div>

      {navOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden animate-fade-in"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex">
        <aside
          aria-label="Settings navigation"
          className={`fixed lg:sticky inset-y-0 left-0 top-0 z-50 lg:z-10 h-dvh w-72 shrink-0
            border-r border-border-subtle bg-panel flex flex-col
            transition-transform duration-200 ease-out
            ${navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div className="flex items-center justify-between gap-2 h-14 px-4 border-b border-border-subtle shrink-0">
            <PhantomLogo className="h-5 w-auto text-primary" />
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Close settings navigation"
              className="lg:hidden w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-3 py-3 border-b border-border-subtle shrink-0">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={14} />}
              onClick={onBack}
              fullWidth
              className="justify-start"
            >
              Back to workspace
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            {NAV.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NavButton
                        item={item}
                        active={activeSection === item.id}
                        onClick={() => {
                          setActiveSection(item.id);
                          setNavOpen(false);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="pt-2 border-t border-border-subtle">
              <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger/70">
                Danger zone
              </p>
              <NavButton
                item={{ id: "delete-account", label: "Delete account", icon: Trash2, ready: false }}
                active={activeSection === "delete-account"}
                danger
                onClick={() => {
                  setActiveSection("delete-account");
                  setNavOpen(false);
                }}
              />
            </div>
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
            <SectionContent section={activeSection} workspaceId={workspaceId} />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavButton({
  item, active, danger, onClick,
}: {
  item: { id: SectionId; label: string; icon: LucideIcon; ready: boolean };
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors border-r-2 ${
        active
          ? danger
            ? "bg-danger/10 text-danger border-danger"
            : "bg-accent/10 text-primary border-accent font-medium"
          : `border-transparent hover:bg-hover ${danger ? "text-muted hover:text-danger" : "text-secondary hover:text-primary"}`
      }`}
    >
      <Icon size={15} className="shrink-0" aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {!item.ready && (
        <span className="text-[10px] text-faint shrink-0 font-normal">Soon</span>
      )}
    </button>
  );
}

function SectionContent({ section, workspaceId }: { section: SectionId; workspaceId: string | null }) {
  switch (section) {
    case "account":
      return <AccountSection />;
    case "personal":
      return <PersonalInfoSection />;
    case "appearance":
      return <AppearanceSection />;
    case "connections":
      return <ConnectionsSection workspaceId={workspaceId} />;
    case "history":
      return <HistorySection />;
    case "password":
      return <PasswordSection />;
    case "audit-logs":
      return <AuditLogsSection workspaceId={workspaceId} />;
    default:
      return <ComingSoon section={section} />;
  }
}

/** Consistent page furniture, so every section starts the same way. */
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-lg font-semibold text-primary">{title}</h1>
      <p className="text-sm text-muted mt-1">{description}</p>
    </header>
  );
}

function ComingSoon({ section }: { section: SectionId }) {
  const label = ALL_ITEMS.find((i) => i.id === section)?.label ?? "This section";

  return (
    <Card>
      <EmptyState
        icon={<Construction size={18} />}
        title={label}
        description="This isn't built yet. It's listed here so you can see what's planned."
      />
    </Card>
  );
}

/* -------------------------------------------------------------- account -- */

function AccountSection() {
  const [profile, setProfile] = useState<{ name: string; email: string; created_at: string } | null>(null);
  const [usage, setUsage] = useState<{
    total_tokens: number; daily_limit: number; remaining: number;
    prompt_tokens: number; completion_tokens: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProfile(), api.getUsage()])
      .then(([p, u]) => { setProfile(p); setUsage(u); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <SectionHeader title="Account" description="Your profile and AI usage." />
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </>
    );
  }

  if (!profile || !usage) {
    return (
      <>
        <SectionHeader title="Account" description="Your profile and AI usage." />
        <Alert tone="danger" title="Couldn't load your account">
          Refresh the page to try again.
        </Alert>
      </>
    );
  }

  const usagePercent = Math.min(100, (usage.total_tokens / usage.daily_limit) * 100);
  const promptPercent = Math.min(100, (usage.prompt_tokens / usage.daily_limit) * 100);
  const completionPercent = Math.min(100, (usage.completion_tokens / usage.daily_limit) * 100);
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = usagePercent >= 100;
  const initials = profile.name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <SectionHeader title="Account" description="Your profile and AI usage." />

      <div className="flex items-center gap-4 mb-7">
        <div
          className="w-14 h-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-lg font-semibold text-accent-text shrink-0"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-primary truncate">{profile.name}</h2>
          <p className="text-sm text-muted truncate">{profile.email}</p>
        </div>
      </div>

      <section>
        <SectionHeading>AI usage today</SectionHeading>
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
                <Zap size={12} className="text-accent" aria-hidden /> Tokens used
              </p>
              <p className="flex items-baseline gap-1.5">
                <span
                  className={`text-3xl font-semibold tabular-nums ${isOverLimit ? "text-danger" : "text-primary"}`}
                >
                  {usage.total_tokens.toLocaleString()}
                </span>
                <span className="text-sm text-muted tabular-nums">
                  / {usage.daily_limit.toLocaleString()}
                </span>
              </p>
            </div>
            <Badge tone={isOverLimit ? "danger" : isNearLimit ? "warn" : "accent"}>
              {isOverLimit ? "Limit reached" : isNearLimit ? "Near limit" : "On track"}
            </Badge>
          </div>

          <div
            className="w-full h-2 rounded-full bg-raised overflow-hidden flex mt-4"
            role="progressbar"
            aria-valuenow={Math.round(usagePercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Daily AI token usage"
          >
            <div className="h-full bg-accent transition-all" style={{ width: `${promptPercent}%` }} />
            <div className="h-full bg-accent-hover transition-all" style={{ width: `${completionPercent}%` }} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs">
            <div className="flex flex-wrap gap-4">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="w-2 h-2 rounded-full bg-accent" aria-hidden />
                Prompt <span className="tabular-nums text-secondary">{usage.prompt_tokens.toLocaleString()}</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <span className="w-2 h-2 rounded-full bg-accent-hover" aria-hidden />
                Completion <span className="tabular-nums text-secondary">{usage.completion_tokens.toLocaleString()}</span>
              </span>
            </div>
            <span className="text-muted tabular-nums">{usage.remaining.toLocaleString()} left</span>
          </div>

          <p className="text-[11px] text-faint mt-4 pt-3 border-t border-border-subtle">
            Resets daily at midnight UTC.
          </p>
        </Card>
      </section>
    </>
  );
}

function PersonalInfoSection() {
  const [profile, setProfile] = useState<{ name: string; email: string; created_at: string } | null>(null);

  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
  }, []);

  return (
    <>
      <SectionHeader title="Personal information" description="Details on your account." />
      {!profile ? (
        <Skeleton className="h-36 w-full rounded-xl" />
      ) : (
        <Card className="divide-y divide-border-subtle">
          <DetailRow label="Name" value={profile.name} />
          <DetailRow label="Email" value={profile.email} />
          <DetailRow
            label="Member since"
            value={new Date(profile.created_at + "Z").toLocaleDateString(undefined, {
              year: "numeric", month: "long", day: "numeric",
            })}
          />
        </Card>
      )}
    </>
  );
}

/* ----------------------------------------------------------- appearance -- */

const ACCENT_PRESETS = [
  { name: "Green", accent: "#22C55E" },
  { name: "Blue", accent: "#3B82F6" },
  { name: "Purple", accent: "#A855F7" },
  { name: "Orange", accent: "#F97316" },
  { name: "Pink", accent: "#EC4899" },
];

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemeState>(() => loadTheme());

  function updateTheme(next: Partial<ThemeState>) {
    const merged = { ...theme, ...next };
    setTheme(merged);
    saveTheme(merged);
  }

  return (
    <>
      <SectionHeader title="Appearance" description="How Phantom Query looks on this device." />

      <section className="mb-8">
        <SectionHeading>Theme</SectionHeading>
        <div role="radiogroup" aria-label="Theme" className="flex gap-3">
          <ThemeOption
            label="Dark"
            active={theme.mode === "dark"}
            onClick={() => updateTheme({ mode: "dark" })}
            surface="#0B0E14"
            panel="#171C26"
          />
          <ThemeOption
            label="Light"
            active={theme.mode === "light"}
            onClick={() => updateTheme({ mode: "light" })}
            surface="#FFFFFF"
            panel="#F1F3F6"
          />
        </div>
      </section>

      <section>
        <SectionHeading>Accent colour</SectionHeading>
        <p className="text-xs text-muted mb-3 -mt-1">
          Used for primary actions, the safety check and chart series.
        </p>
        <div role="radiogroup" aria-label="Accent colour" className="flex gap-3 flex-wrap">
          {ACCENT_PRESETS.map((preset) => {
            const active = theme.accent.toLowerCase() === preset.accent.toLowerCase();
            return (
              <button
                key={preset.name}
                role="radio"
                aria-checked={active}
                aria-label={preset.name}
                onClick={() => updateTheme({ accent: preset.accent, accentHover: darken(preset.accent) })}
                className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                  active ? "border-primary" : "border-transparent"
                }`}
                style={{ backgroundColor: preset.accent }}
                title={preset.name}
              >
                {active && <Check size={14} className="text-white drop-shadow" aria-hidden />}
              </button>
            );
          })}

          <label
            className="relative w-9 h-9 rounded-full border-2 border-line flex items-center justify-center cursor-pointer text-muted hover:text-primary hover:border-accent/50 transition-colors"
            title="Custom colour"
          >
            <span className="sr-only">Custom accent colour</span>
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => updateTheme({ accent: e.target.value, accentHover: darken(e.target.value) })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Paintbrush size={14} aria-hidden />
          </label>
        </div>
      </section>
    </>
  );
}

function ThemeOption({
  label, active, onClick, surface, panel,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  surface: string;
  panel: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg border-2 p-2 transition-colors ${
        active ? "border-accent" : "border-line hover:border-faint"
      }`}
    >
      <span
        className="flex w-20 h-12 rounded-md overflow-hidden border border-line"
        style={{ backgroundColor: surface }}
        aria-hidden
      >
        <span className="w-1/3 h-full" style={{ backgroundColor: panel }} />
      </span>
      <span className="flex items-center justify-center gap-1 text-xs text-secondary mt-2">
        {active && <Check size={11} className="text-accent" aria-hidden />}
        {label}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------- connections -- */

function ConnectionsSection({ workspaceId }: { workspaceId: string | null }) {
  const [connections, setConnections] = useState<
    { id: string; name: string; database: string; host: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    api.listConnections(workspaceId)
      .then(setConnections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  return (
    <>
      <SectionHeader
        title="Database connections"
        description={
          loading
            ? "Loading your connections…"
            : `${connections.length} connected in this workspace.`
        }
      />
      {loading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : connections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plug size={18} />}
            title="No connections yet"
            description="Connect a database from your workspace to start asking questions about it."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border-subtle">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-primary truncate">{c.name}</p>
                <p className="text-xs text-muted font-mono truncate">
                  {c.database}@{c.host}
                </p>
              </div>
              <Badge tone="accent">Connected</Badge>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function HistorySection() {
  const [history, setHistory] = useState<
    { id: string; question: string; executed_at: string; row_count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getQueryHistory().then(setHistory).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <SectionHeader
        title="Query history"
        description={loading ? "Loading…" : `${history.length} queries you have run.`}
      />
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : history.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Clock size={18} />}
            title="No queries yet"
            description="Executed queries are recorded here with their row counts."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border-subtle">
          {history.slice(0, 20).map((h) => (
            <div key={h.id} className="px-4 py-3">
              <p className="text-sm text-secondary">{h.question}</p>
              <p className="text-xs text-faint mt-1 tabular-nums">
                {h.row_count.toLocaleString()} rows ·{" "}
                {new Date(h.executed_at + "Z").toLocaleString()}
              </p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/* ----------------------------------------------------------- audit logs -- */

const ACTION_LABELS: Record<string, string> = {
  "connection.created": "created connection",
  "connection.deleted": "deleted connection",
  "connection.moved": "moved connection",
  "connection.access_changed": "changed connection access",
  "connection.access_granted": "granted connection access",
  "connection.access_revoked": "revoked connection access",
  "folder.created": "created folder",
  "folder.deleted": "deleted folder",
  "chat.created": "started chat",
  "turn.deleted": "deleted a message",
  "turn.edited": "edited a message",
  "query.executed": "ran a query",
  "saved_query.created": "saved a query",
  "saved_query.deleted": "deleted a saved query",
  "workspace.created": "created this workspace",
  "member.invited": "invited a member",
  "member.removed": "removed a member",
  "member.role_changed": "changed a member's role",
  "auth.login": "logged in",
  "auth.password_changed": "changed their password",
};

function describeLog(log: AuditLog): string {
  const label = ACTION_LABELS[log.action] ?? log.action;
  const meta = log.metadata;
  if (!meta) return label;

  switch (log.action) {
    case "connection.created":
    case "connection.deleted":
    case "folder.created":
    case "folder.deleted":
    case "saved_query.created":
    case "saved_query.deleted":
      return `${label} "${meta.name}"`;
    case "connection.moved":
      return `moved "${meta.name}" to a different folder`;
    case "connection.access_changed":
      return meta.new_level === "restricted"
        ? `restricted access to "${meta.name}"`
        : `opened "${meta.name}" to the whole team`;
    case "connection.access_granted":
      return `gave ${meta.target_email ?? "a member"} access to "${meta.name}"`;
    case "connection.access_revoked":
      return `removed ${meta.target_email ?? "a member"}'s access to "${meta.name}"`;
    case "chat.created":
      return label;
    case "turn.deleted":
      return `${label}: "${String(meta.question ?? "").slice(0, 60)}"`;
    case "turn.edited":
      return `${label}: "${String(meta.old_question ?? "").slice(0, 40)}" → "${String(meta.new_question ?? "").slice(0, 40)}"`;
    case "query.executed":
      return `ran a query (${meta.row_count} rows, ${meta.duration_ms}ms): "${String(meta.question ?? "").slice(0, 60)}"`;
    case "member.invited":
      return `invited ${meta.invited_email}`;
    case "member.removed":
      return meta.removed_role
        ? `removed a member (was ${meta.removed_role})`
        : "removed a member";
    case "member.role_changed":
      return `changed ${meta.target_email ?? "a member"} from ${meta.previous_role} to ${meta.new_role}`;
    default:
      return label;
  }
}

function AuditLogsSection({ workspaceId }: { workspaceId: string | null }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>("");

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDenied(false);
    api.getAuditLogs(workspaceId, actionFilter || undefined)
      .then((result) => {
        if (!cancelled) setLogs(result);
      })
      .catch(() => {
        // Audit logs are admin-or-owner only (see app/permissions.py). An
        // ordinary member gets a 403 here, which is expected -- show them
        // why rather than an empty feed that looks like a loading bug.
        if (cancelled) return;
        setDenied(true);
        setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, actionFilter]);

  return (
    <>
      <SectionHeader title="Activity log" description="Who did what in this workspace." />

      {!denied && !loading && (
        <div className="mb-4 max-w-xs">
          <Select
            label="Filter by action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All actions</option>
            {Object.keys(ACTION_LABELS).map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </Select>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : denied ? (
        <Alert tone="info" title="Admin access required">
          The activity log records every member&rsquo;s actions in this workspace, so it&rsquo;s
          available to workspace admins and owners. Ask an admin if you need access.
        </Alert>
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileClock size={18} />}
            title="Nothing recorded yet"
            description={
              actionFilter
                ? "No activity matches this filter."
                : "Actions taken in this workspace will appear here."
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border-subtle">
          {logs.map((log) => (
            <div key={log.id} className="px-4 py-3">
              <p className="text-sm text-secondary">
                <span className="font-medium text-primary">{log.actor_name ?? "Unknown"}</span>{" "}
                {describeLog(log)}
              </p>
              <p className="text-xs text-faint mt-1">
                {new Date(log.created_at + "Z").toLocaleString()}
              </p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------- password -- */

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMismatch(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setMismatch("These passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SectionHeader title="Password" description="Change the password for your account." />

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={mismatch}
            required
          />

          {error && <Alert tone="danger" title="Couldn't change your password">{error}</Alert>}
          {success && <Alert tone="success" title="Password changed" />}

          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            {saving ? "Changing…" : "Change password"}
          </Button>
        </form>
      </Card>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="text-sm text-primary truncate">{value}</span>
    </div>
  );
}
