import { useState } from "react";
import { Mail, Lock } from "lucide-react";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onSwitchToSignup: () => void;
}

export default function LoginPage({ onLogin, onSwitchToSignup }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div className="flex justify-center mb-2">
        <img src="/logo.jpeg" alt="Phantom Query" className="h-12 w-auto rounded-md" />
        </div>
    <div>
    <h1 className="text-xl font-semibold text-slate-100">Welcome back</h1>
    <p className="text-sm text-slate-500 mt-1">Log in to Phantom Query</p>
  </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} icon={<Mail size={14} />} />
        <Field label="Password" type="password" value={password} onChange={setPassword} icon={<Lock size={14} />} />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2.5 rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50 transition-colors"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          Don't have an account?{" "}
          <button type="button" onClick={onSwitchToSignup} className="text-accent-hover hover:underline">
            Sign up
          </button>
        </p>
      </form>
    </div>
  );
}

function Field({
  label, type, value, onChange, icon,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full rounded-md bg-panel border border-line pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/60"
        />
      </div>
    </label>
  );
}