import { useEffect, useState } from "react";
import { api } from "../api/client";
import { loadTheme, saveTheme, darken, type ThemeState } from "../theme";
import type { AuditLog } from "../type";
import {
  User, FileText, FolderKanban, Palette, Bell, Globe, Keyboard,
  KeyRound, Monitor, ShieldCheck, Lock, Plug, Clock, Upload, Database,
  Settings, Webhook, Puzzle, Trash2, Construction, Zap, Check, Paintbrush,
  FileClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
      { id: "2fa", label: "2FA", icon: ShieldCheck, ready: false },
      { id: "api-keys", label: "API keys", icon: Lock, ready: false },
    ],
  },
  {
    label: "Data & Connections",
    items: [
      { id: "connections", label: "Database connections", icon: Plug, ready: true },
      { id: "history", label: "Query history", icon: Clock, ready: true },
      { id: "exports", label: "Exported data", icon: Upload, ready: false },
      { id: "data-controls", label: "Data controls", icon: Database, ready: false },
    ],
  },
  {
    label: "Security & Compliance",
    items: [
      { id: "audit-logs", label: "Audit Logs", icon: FileClock, ready: true },
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

export default function SettingsPage({ onBack, workspaceId }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("account");

  return (
    <div className="min-h-screen w-full bg-ink text-slate-200 flex">
      <aside className="w-64 shrink-0 border-r border-line flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-line">
          <button onClick={onBack} className="text-xs text-slate-500 hover:text-accent-hover">
            ← Back
          </button>
          <h1 className="text-sm font-semibold text-slate-100 mt-2">Settings</h1>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${
                      activeSection === item.id
                        ? "bg-accent/10 text-slate-100 border-r-2 border-accent"
                        : "text-slate-400 hover:bg-hover"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!item.ready && (
                      <span className="text-[9px] text-slate-600 shrink-0">soon</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="mt-2 pt-2 border-t border-line">
            <p className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-danger/70">
              Danger zone
            </p>
            <button
              onClick={() => setActiveSection("delete-account")}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${
                activeSection === "delete-account"
                  ? "bg-danger/10 text-danger border-r-2 border-danger"
                  : "text-slate-500 hover:bg-hover"
              }`}
            >
              <Trash2 size={15} />
              <span className="flex-1">Delete account</span>
              <span className="text-[9px] text-slate-600">soon</span>
            </button>
          </div>
        </nav>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">
          <SectionContent section={activeSection} workspaceId={workspaceId} />
        </div>
      </div>
    </div>
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

function ComingSoon({ section }: { section: SectionId }) {
  const label = NAV.flatMap((g) => g.items)
    .concat([{ id: "delete-account", label: "Delete account", icon: Trash2, ready: false }])
    .find((i) => i.id === section)?.label ?? "This section";

  return (
    <div className="rounded-xl border border-line bg-panel px-6 py-12 text-center">
      <Construction size={28} className="mx-auto mb-2 text-slate-600" />
      <h2 className="text-sm font-medium text-slate-300">{label}</h2>
      <p className="text-xs text-slate-500 mt-1">Coming soon.</p>
    </div>
  );
}

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
      .finally(() => setLoading(false));
  }, []);

  if (loading || !profile || !usage) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  const usagePercent = Math.min(100, (usage.total_tokens / usage.daily_limit) * 100);
  const promptPercent = Math.min(100, (usage.prompt_tokens / usage.daily_limit) * 100);
  const completionPercent = Math.min(100, (usage.completion_tokens / usage.daily_limit) * 100);
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = usagePercent >= 100;
  const initials = profile.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Profile</h1>
        <p className="text-sm text-slate-500">Manage your account and preferences</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-lg font-semibold text-accent-hover shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">{profile.name}</h2>
          <p className="text-sm text-slate-500">{profile.email}</p>
        </div>
      </div>

      <section>
        <div className="rounded-xl border border-line bg-panel p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-500 mb-1">
                <Zap size={12} /> AI usage today
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-semibold ${isOverLimit ? "text-danger" : "text-slate-100"}`}>
                  {usage.total_tokens.toLocaleString()}
                </span>
                <span className="text-sm text-slate-500">/ {usage.daily_limit.toLocaleString()}</span>
              </div>
            </div>
            <span
              className={`text-[10px] px-2 py-1 rounded-full border ${
                isOverLimit
                  ? "bg-danger/10 text-danger border-danger/30"
                  : isNearLimit
                  ? "bg-warn/10 text-warn border-warn/30"
                  : "bg-accent/10 text-accent-hover border-accent/30"
              }`}
            >
              {isOverLimit ? "LIMIT REACHED" : isNearLimit ? "NEAR LIMIT" : "ON TRACK"}
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-ink overflow-hidden flex mt-4">
            <div className="h-full bg-accent transition-all" style={{ width: `${promptPercent}%` }} />
            <div className="h-full bg-accent-hover transition-all" style={{ width: `${completionPercent}%` }} />
          </div>

          <div className="flex items-center justify-between mt-3 text-xs">
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-accent" />
                Prompt {usage.prompt_tokens.toLocaleString()}
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-accent-hover" />
                Completion {usage.completion_tokens.toLocaleString()}
              </span>
            </div>
            <span className="text-slate-500">{usage.remaining.toLocaleString()} left</span>
          </div>

          <p className="text-[11px] text-slate-600 mt-3 pt-3 border-t border-line">
            Resets daily at midnight UTC
          </p>
        </div>
      </section>
    </div>
  );
}

function PersonalInfoSection() {
  const [profile, setProfile] = useState<{ name: string; email: string; created_at: string } | null>(null);

  useEffect(() => {
    api.getProfile().then(setProfile);
  }, []);

  if (!profile) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Personal information</h1>
        <p className="text-sm text-slate-500">Your account details</p>
      </div>
      <div className="rounded-xl border border-line bg-panel divide-y divide-line">
        <DetailRow label="Name" value={profile.name} />
        <DetailRow label="Email" value={profile.email} />
        <DetailRow
          label="Member since"
          value={new Date(profile.created_at + "Z").toLocaleDateString(undefined, {
            year: "numeric", month: "long", day: "numeric",
          })}
        />
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemeState>(() => loadTheme());

  function updateTheme(next: Partial<ThemeState>) {
    const merged = { ...theme, ...next };
    setTheme(merged);
    saveTheme(merged);
  }

  const ACCENT_PRESETS = [
    { name: "Green", accent: "#22C55E" },
    { name: "Blue", accent: "#3B82F6" },
    { name: "Purple", accent: "#A855F7" },
    { name: "Orange", accent: "#F97316" },
    { name: "Pink", accent: "#EC4899" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-primary">Appearance</h1>
        <p className="text-sm text-muted">How Phantom Query looks</p>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Theme</h2>
        <div className="flex gap-3">
          <ThemeOption
            label="Dark"
            active={theme.mode === "dark"}
            onClick={() => updateTheme({ mode: "dark" })}
            preview="bg-[#0D1117] border-[#262b35]"
          />
          <ThemeOption
            label="Light"
            active={theme.mode === "light"}
            onClick={() => updateTheme({ mode: "light" })}
            preview="bg-white border-[#d0d7de]"
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Accent color</h2>
        <div className="flex gap-3 flex-wrap">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => updateTheme({ accent: preset.accent, accentHover: darken(preset.accent) })}
              className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                theme.accent === preset.accent ? "border-primary" : "border-transparent"
              }`}
              style={{ backgroundColor: preset.accent }}
              title={preset.name}
            >
              {theme.accent === preset.accent && <Check size={14} className="text-white" />}
            </button>
          ))}
          <label
            className="w-9 h-9 rounded-full border-2 border-line flex items-center justify-center cursor-pointer overflow-hidden text-slate-400"
            title="Custom color"
          >
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => updateTheme({ accent: e.target.value, accentHover: darken(e.target.value) })}
              className="opacity-0 absolute w-9 h-9 cursor-pointer"
            />
            <Paintbrush size={14} />
          </label>
        </div>
      </section>
    </div>
  );
}

function ThemeOption({
  label, active, onClick, preview,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  preview: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-2 p-2 transition-colors ${
        active ? "border-accent" : "border-line hover:border-line"
      }`}
    >
      <div className={`w-16 h-10 rounded-md border ${preview}`} />
      <p className="text-xs text-secondary mt-1.5 text-center">{label}</p>
    </button>
  );
}

function ConnectionsSection({ workspaceId }: { workspaceId: string | null }) {
  const [connections, setConnections] = useState<{ id: string; name: string; database: string; host: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    api.listConnections(workspaceId).then(setConnections).finally(() => setLoading(false));
  }, [workspaceId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Database connections</h1>
        <p className="text-sm text-slate-500">{connections.length} connected</p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-slate-600">No connections yet.</p>
      ) : (
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-slate-200">{c.name}</p>
                <p className="text-xs text-slate-500 font-mono">{c.database}@{c.host}</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-accent" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistorySection() {
  const [history, setHistory] = useState<{ id: string; question: string; executed_at: string; row_count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getQueryHistory().then(setHistory).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Query history</h1>
        <p className="text-sm text-slate-500">{history.length} queries</p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-slate-600">No queries yet.</p>
      ) : (
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {history.slice(0, 20).map((h) => (
            <div key={h.id} className="px-4 py-3">
              <p className="text-sm text-slate-200 truncate">{h.question}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {h.row_count} rows · {new Date(h.executed_at + "Z").toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    if (!workspaceId) return;
    setLoading(true);
    setDenied(false);
    api.getAuditLogs(workspaceId, actionFilter || undefined)
      .then((result) => setLogs(result))
      .catch(() => {
        // Audit logs are admin-or-owner only (see app/permissions.py). An
        // ordinary member gets a 403 here, which is expected -- show them
        // why rather than an empty feed that looks like a loading bug.
        setDenied(true);
        setLogs([]);
      })
      .finally(() => setLoading(false));
  }, [workspaceId, actionFilter]);

  const actionOptions = Object.keys(ACTION_LABELS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Audit Logs</h1>
        <p className="text-sm text-slate-500">Who did what, in this workspace</p>
      </div>

      {!denied && (
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-md bg-ink border border-line px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="">All actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : denied ? (
        <div className="rounded-xl border border-line bg-panel px-4 py-3">
          <p className="text-sm text-slate-300">Admin access required</p>
          <p className="text-xs text-slate-500 mt-1">
            The activity log records every member's actions in this workspace, so it's
            available to workspace admins and owners. Ask an admin if you need access.
          </p>
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-600">No activity recorded yet.</p>
      ) : (
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {logs.map((log) => (
            <div key={log.id} className="px-4 py-3">
              <p className="text-sm text-slate-200">
                <span className="font-medium">{log.actor_name ?? "Unknown"}</span>{" "}
                {describeLog(log)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(log.created_at + "Z").toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
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
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Password</h1>
        <p className="text-sm text-slate-500">Change your account password</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-panel p-5 space-y-4 max-w-sm">
        <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField label="New password" value={newPassword} onChange={setNewPassword} />
        <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && (
          <p className="flex items-center gap-1.5 text-xs text-accent-hover">
            <Check size={13} /> Password changed successfully.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !currentPassword || !newPassword || !confirmPassword}
          className="px-4 py-2 text-sm rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-40 transition-colors"
        >
          {saving ? "Changing…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="mt-1 w-full rounded-md bg-ink border border-line px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/60"
      />
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  );
}