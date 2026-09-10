import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Button, Dialog, Input, Select } from "./ui";

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

const DEFAULT_PORTS = { postgres: 5432, mysql: 3306 } as const;

export default function ConnectionForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState<number>(DEFAULT_PORTS.postgres);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dbType, setDbType] = useState<"postgres" | "mysql">("postgres");
  // Once someone edits the port themselves, switching engine shouldn't quietly
  // overwrite their value.
  const [portTouched, setPortTouched] = useState(false);

  useEffect(() => {
    if (!portTouched) setPort(DEFAULT_PORTS[dbType]);
  }, [dbType, portTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name, host, port, database, username, password, db_type: dbType });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title="Connect a database"
      description="Phantom Query reads your schema so it can write accurate SQL."
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" form="connection-form" type="submit" loading={submitting}>
            {submitting ? "Connecting…" : "Connect"}
          </Button>
        </>
      }
    >
      <form id="connection-form" onSubmit={handleSubmit} className="space-y-4">
        <Alert tone="success" title="Read-only, enforced">
          Use a read-only database role if you have one. Phantom Query opens a read-only
          session either way, regardless of the role&rsquo;s actual privileges.
        </Alert>

        <Input
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production replica"
          hint="How this database appears in your sidebar."
          required
        />

        <Select
          label="Engine"
          value={dbType}
          onChange={(e) => setDbType(e.target.value as "postgres" | "mysql")}
        >
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
        </Select>

        <div className="flex gap-3">
          <Input
            containerClassName="flex-1 min-w-0"
            label="Host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="db.example.com"
            required
          />
          <Input
            containerClassName="w-24 shrink-0"
            label="Port"
            type="number"
            inputMode="numeric"
            value={String(port)}
            onChange={(e) => {
              setPortTouched(true);
              setPort(Number(e.target.value) || DEFAULT_PORTS[dbType]);
            }}
            required
          />
        </div>

        <Input
          label="Database"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
          placeholder="analytics"
          required
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            containerClassName="flex-1 min-w-0"
            label="Username"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            containerClassName="flex-1 min-w-0"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <Alert tone="danger" title="Couldn't connect">
            {error}
          </Alert>
        )}

        <p className="flex items-start gap-1.5 text-[11px] text-faint">
          <ShieldCheck size={12} className="text-accent shrink-0 mt-px" aria-hidden />
          Credentials are stored encrypted and used only to open read-only sessions on
          your behalf.
        </p>
      </form>
    </Dialog>
  );
}
