import { ShieldCheck } from "lucide-react";
import { PhantomLogo } from "./PhantomLogo";

/**
 * Shared frame for log in and sign up. Deliberately plain: a person arriving
 * here wants to get in, not to read a pitch. The single trust line at the
 * bottom is the one thing worth saying before someone hands over a database.
 */
export default function AuthLayout({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-ink flex flex-col items-center justify-center px-5 py-10">
      <main className="w-full max-w-sm">
        <div className="flex justify-center mb-7">
          <PhantomLogo className="h-8 w-auto text-primary" />
        </div>

        <div className="rounded-xl border border-line bg-panel p-6 sm:p-7">
          <h1 className="text-lg font-semibold text-primary">{title}</h1>
          <p className="text-sm text-muted mt-1">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="text-sm text-muted text-center mt-5">{footer}</p>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-faint mt-7">
          <ShieldCheck size={12} className="text-accent shrink-0" aria-hidden />
          Read-only database sessions, always
        </p>
      </main>
    </div>
  );
}
