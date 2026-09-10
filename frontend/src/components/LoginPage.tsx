import { useState } from "react";
import { Lock, Mail } from "lucide-react";
import AuthLayout from "./AuthLayout";
import { Alert, Button, Input } from "./ui";

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
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your Phantom Query workspace."
      footer={
        <>
          Don&rsquo;t have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="text-accent-text hover:underline underline-offset-2 font-medium"
          >
            Sign up
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail size={14} />}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock size={14} />}
          required
        />

        {error && (
          <Alert tone="danger" title="Couldn't sign you in">
            {error}
          </Alert>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
