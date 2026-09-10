import { ArrowRight, BarChart3, MessageSquare, Play, ShieldCheck, Users } from "lucide-react";
import { PhantomLogo } from "./PhantomLogo";
import { Badge, Button } from "./ui";
import { SqlText } from "./ui/CodeBlock";

interface Props {
  onGetStarted: () => void;
}

const SAMPLE_SQL = `select p.name, sum(oi.quantity) as units_sold
from order_items oi
join products p on p.id = oi.product_id
join orders o on o.id = oi.order_id
where o.placed_at >= date_trunc('month', now() - interval '1 month')
group by p.name
order by units_sold desc
limit 10;`;

/**
 * The landing page now speaks the product's own language -- same dark surface,
 * same accent, same type -- so signing in doesn't feel like walking into a
 * different application. The centrepiece is a real review card rather than a
 * stock illustration: the clearest way to explain "AI proposes, you decide" is
 * to show the moment where the user decides.
 */
export default function LandingPage({ onGetStarted }: Props) {
  return (
    <div className="min-h-dvh bg-ink text-primary flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 h-16 shrink-0">
        <PhantomLogo className="h-6 w-auto text-primary" />
        <Button variant="secondary" size="sm" onClick={onGetStarted}>
          Log in
        </Button>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-5 sm:px-8 py-8 sm:py-14">
        <div className="max-w-2xl">
          <Badge tone="accent" icon={<ShieldCheck size={10} />}>
            Read-only, always
          </Badge>

          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-[1.1]">
            A controlled AI interface
            <br className="hidden sm:block" /> to your operational database.
          </h1>

          <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
            Ask questions in plain English. Phantom Query proposes the SQL, a safety layer
            validates it, and nothing executes until you say so.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" iconRight={<ArrowRight size={16} />} onClick={onGetStarted}>
              Get started
            </Button>
            <p className="text-sm text-faint">
              Connect your own Postgres or MySQL database.
            </p>
          </div>
        </div>

        {/* The product's central moment, shown rather than described. */}
        <section
          aria-label="How a query is reviewed before it runs"
          className="mt-12 sm:mt-16 rounded-xl border border-line bg-panel overflow-hidden"
        >
          <div className="px-4 sm:px-5 py-3.5 border-b border-border-subtle">
            <p className="text-[11px] font-medium text-faint mb-1">You asked</p>
            <p className="text-sm sm:text-base font-medium text-primary">
              What were our top-selling products last month?
            </p>
          </div>

          <div className="p-4 sm:p-5 space-y-3">
            <div className="rounded-lg border border-line bg-raised overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border-subtle bg-hover/40">
                <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  PostgreSQL
                </span>
              </div>
              <pre className="px-3 py-2.5 text-[11px] sm:text-xs font-mono leading-relaxed whitespace-pre-wrap break-words overflow-x-auto">
                <code>
                  <SqlText sql={SAMPLE_SQL} />
                </code>
              </pre>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2.5">
              <ShieldCheck size={15} className="text-accent shrink-0" aria-hidden />
              <p className="text-xs font-medium text-accent-text flex-1">
                Passed safety validation
              </p>
              <Badge tone="accent">Read-only</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-accent text-accent-fg text-sm font-medium">
                <Play size={14} aria-hidden /> Run query
              </span>
              <p className="text-[11px] text-faint">Runs only when you choose to.</p>
            </div>
          </div>
        </section>

        <section className="mt-12 sm:mt-16 grid gap-4 sm:grid-cols-3">
          <Feature
            icon={<MessageSquare size={18} />}
            title="Ask, don't write SQL"
            body="Describe what you want in plain words. Phantom Query reads your schema and writes readable SQL you can inspect line by line."
          />
          <Feature
            icon={<ShieldCheck size={18} />}
            title="AI proposes, you decide"
            body="Every statement is parsed, validated and forced read-only before it can touch your data — and it still waits for your explicit go-ahead."
          />
          <Feature
            icon={<Users size={18} />}
            title="Built for teams"
            body="Shared workspaces, per-connection permissions and a full audit trail, so the whole team can ask questions safely."
          />
        </section>

        <section className="mt-12 sm:mt-16 flex flex-col sm:flex-row sm:items-center justify-between gap-5 rounded-xl border border-line bg-panel px-5 sm:px-7 py-6">
          <div>
            <h2 className="text-lg font-semibold text-primary">Ready to ask your first question?</h2>
            <p className="text-sm text-muted mt-1">
              Results come back as clean tables, charts or exports — ready to share.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            iconRight={<ArrowRight size={16} />}
            onClick={onGetStarted}
            className="shrink-0"
          >
            Get started
          </Button>
        </section>
      </main>

      <footer className="shrink-0 px-5 sm:px-8 py-6 border-t border-border-subtle">
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <BarChart3 size={12} className="text-accent shrink-0" aria-hidden />
          Phantom Query — ask your data, keep control of what runs.
        </p>
      </footer>
    </div>
  );
}

function Feature({
  icon, title, body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <span
        className="inline-flex w-9 h-9 rounded-lg bg-accent/12 border border-accent/25 items-center justify-center text-accent"
        aria-hidden
      >
        {icon}
      </span>
      <h3 className="mt-3.5 text-sm font-semibold text-primary">{title}</h3>
      <p className="mt-1.5 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}
