import { useState } from "react";

interface Props {
  disabled: boolean;
  onAsk: (question: string) => Promise<void>;
}

export default function QueryPanel({ disabled, onAsk }: Props) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || disabled) return;
    setAsking(true);
    try {
      await onAsk(question);
    } finally {
      setAsking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-line">
      <label className="text-xs text-slate-500 block mb-1.5">Ask a question</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            disabled
              ? "Select a connection first…"
              : "e.g. What were the top 5 orders by amount last month?"
          }
          disabled={disabled || asking}
          className="flex-1 rounded-md bg-ink border border-line px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || asking || !question.trim()}
          className="px-4 py-2 text-sm rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-40 disabled:hover:bg-accent transition-colors"
        >
          {asking ? "Thinking…" : "Ask"}
        </button>
      </div>
    </form>
  );
}