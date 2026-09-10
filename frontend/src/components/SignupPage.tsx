import { useState } from "react";
import { Lock, Mail, User } from "lucide-react";
import AuthLayout from "./AuthLayout";
import { Alert, Button, Input } from "./ui";

interface Props {
  onSignup: (email: string, name: string, password: string) => Promise<void>;
  onSwitchToLogin: () => void;
}

export default function SignupPage({ onSignup, onSwitchToLogin }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSignup(email, name, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start asking questions about your data in plain English."
      footer={
        <>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-accent-text hover:underline underline-offset-2 font-medium"
          >
            Log in
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon={<User size={14} />}
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock size={14} />}
          required
        />

        {error && (
          <Alert tone="danger" title="Couldn't create your account">
            {error}
          </Alert>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
