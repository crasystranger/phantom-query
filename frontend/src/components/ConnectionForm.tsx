import { useState, useEffect } from "react";

interface Props {
  onSubmit: (payload: {
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    db_type: "postgres" | "mysql"; 
  }) => Promise<void>;
  onCancel: () => void;
  
}

export default function ConnectionForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dbType, setDbType] = useState<"postgres" | "mysql">("postgres");

  useEffect(() => {
  setPort(dbType === "mysql" ? 3306 : 5432);
}, [dbType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name, host, port, database, username, password, db_type: dbType });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-panel border border-line rounded-lg w-105 p-5 space-y-3 shadow-xl"
      >
        <h2 className="text-sm font-medium text-slate-100">New connection</h2>
        <p className="text-xs text-slate-500">
          Use a read-only database role if you have one. Phantom Query also enforces a
          read-only session automatically, regardless of the role's actual privileges.
        </p>

        <Field label="Name" value={name} onChange={setName} placeholder="Production replica" />

        <label className="block">
          <span className="text-xs text-slate-500">Database type</span>
          <select
            value={dbType}
            onChange={(e) => setDbType(e.target.value as "postgres" | "mysql")}
            className="mt-1 w-full rounded-md bg-ink border border-line px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none"
          >
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            </select>
            </label>

        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Host" value={host} onChange={setHost} />
          </div>
          <div className="w-24">
            <Field label="Port" value={String(port)} onChange={(v) => setPort(Number(v) || 5432)} />
          </div>
        </div>

        <Field label="Database" value={database} onChange={setDatabase} />
        <Field label="Username" value={username} onChange={setUsername} />
        <Field label="Password" value={password} onChange={setPassword} type="password" />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50 transition-colors"
          >
            {submitting ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required
        className="mt-1 w-full rounded-md bg-ink border border-line px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none "
      />
    </label>
  );
}