import { MessageSquare, ShieldCheck, BarChart3 } from "lucide-react";

interface Props {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: Props) {
  return (
    <div className="min-h-screen bg-[#fafafa] relative overflow-hidden flex flex-col items-center justify-center px-6">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-24 w-md h-112 bg-indigo-100/60 rounded-full blur-3xl" />

      <div className="relative max-w-3xl text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-medium tracking-wide uppercase mb-5">
          <img src="/logo.jpeg" alt="Phantom Query" className="h-20 w-auto mx-auto mb-6" />
          Read-only, always
        </span>

        <h1 className="text-4xl sm:text-5xl font-semibold text-slate-900 tracking-tight leading-tight">
          A controlled AI interface for your database
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
          Ask questions in plain English. Phantom Query proposes the SQL — you review it,
          a safety layer validates it, and nothing executes until you say so.
        </p>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
          <Feature
            icon={<MessageSquare size={20} />}
            title="Ask, don't write SQL"
            body="Describe what you want in plain words. Phantom Query translates it into readable SQL you can inspect before running."
          />
          <Feature
            icon={<ShieldCheck size={20} />}
            title="AI proposes, you decide"
            body="Every query is parsed, validated, and enforced read-only before it ever touches your data — and nothing runs without your explicit go-ahead."
          />
          <Feature
            icon={<BarChart3 size={20} />}
            title="Built for teams"
            body="Role-based access, per-connection permissions, and a full audit trail — so the whole team can ask questions safely, not just the developer."
          />
        </div>

        <p className="mt-8 text-sm text-slate-500">
          Results come back as clean tables, charts, or exports — ready to share.
        </p>

        <button
          onClick={onGetStarted}
          className="mt-8 px-7 py-3.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all hover:-translate-y-0.5"
        >
          Get Started
        </button>
        <p className="mt-3 text-sm text-slate-500">
          Connect your own Postgres or MySQL database. Free to try.
        </p>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
      <div className="text-indigo-600 mb-2">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600">{body}</p>
    </div>
  );
}