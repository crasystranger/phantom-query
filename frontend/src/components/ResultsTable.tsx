import { useState } from "react";
import type { ExecuteQueryResponse } from "../type";
import { exportToCsv, exportToExcel, exportToJson } from "../utils/export";
import { api } from "../api/client";
import ChartView from "./ChartView";

interface Props {
  results: ExecuteQueryResponse;
  question?: string;
  sql?: string;
  dbType?: string;
}

const PAGE_SIZE = 50;

export default function ResultsTable({ results, question, sql, dbType }: Props) {
  const [view, setView] = useState<"table" | "chart">("table");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const visibleRows = results.rows.slice(0, visibleCount);
  const hasMore = visibleCount < results.rows.length;

  async function handleSummarize() {
    if (!question || !sql) return;
    setSummarizing(true);
    try {
      const res = await api.summarizeResults(question, sql, results.columns, results.rows);
      setSummary(res.summary);
    } finally {
      setSummarizing(false);
    }
  }

  function handleExportExcel() {
    if (!question || !sql) return;
    exportToExcel(results, { question, sql, dbType });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 pb-0 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">
            {results.row_count} row{results.row_count !== 1 ? "s" : ""}
            {results.truncated && " (truncated)"}
          </p>

          <div className="flex rounded-md border border-line overflow-hidden">
            <button
              onClick={() => setView("table")}
              className={`text-xs px-2.5 py-1 transition-colors ${
                view === "table" ? "bg-accent text-white" : "text-slate-400 hover:bg-panel"
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setView("chart")}
              className={`text-xs px-2.5 py-1 transition-colors ${
                view === "chart" ? "bg-accent text-white" : "text-slate-400 hover:bg-panel"
              }`}
            >
              Chart
            </button>
          </div>
        </div>

        {results.rows.length > 0 && (
          <div className="flex gap-2">
            {question && sql && (
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="text-xs px-2.5 py-1 rounded-md border border-line text-slate-400 hover:text-accent-hover hover:border-accent/50 disabled:opacity-50 transition-colors"
              >
                {summarizing ? "Summarizing…" : "✨ Summarize"}
              </button>
            )}
            <button
              onClick={() => exportToCsv(results)}
              className="text-xs px-2.5 py-1 rounded-md border border-line text-slate-400 hover:text-accent-hover hover:border-accent/50 transition-colors"
            >
              Export CSV
            </button>
            {question && sql && (
              <button
                onClick={handleExportExcel}
                className="text-xs px-2.5 py-1 rounded-md border border-line text-slate-400 hover:text-accent-hover hover:border-accent/50 transition-colors"
              >
                Export Excel
              </button>
            )}
            <button
              onClick={() => exportToJson(results)}
              className="text-xs px-2.5 py-1 rounded-md border border-line text-slate-400 hover:text-accent-hover hover:border-accent/50 transition-colors"
            >
              Export JSON
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="mx-4 mt-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-slate-300">
          <span className="text-accent-hover font-medium">✨ Summary: </span>
          {summary}
        </div>
      )}

      {view === "chart" ? (
        <ChartView results={results} />
      ) : (
        <div className="p-4">
          {results.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No rows returned.</p>
          ) : (
            <>
              <div className="border border-line rounded-md overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-panel">
                      {results.columns.map((col) => (
                        <th key={col} className="text-left px-3 py-2 font-mono text-xs text-slate-400 font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, i) => (
                      <tr key={i} className="border-b border-line last:border-0 hover:bg-panel/50">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-slate-300 font-mono text-xs">
                            {cell === null ? <span className="text-slate-600 italic">null</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(hasMore || visibleCount > PAGE_SIZE) && (
                <div className="flex justify-center gap-2 mt-3">
                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                      className="text-xs px-4 py-1.5 rounded-md border border-line text-slate-400 hover:border-accent/50 hover:text-accent-hover transition-colors"
                    >
                      Show {Math.min(PAGE_SIZE, results.rows.length - visibleCount)} more
                      ({visibleCount} of {results.rows.length} shown)
                    </button>
                  )}
                  {visibleCount > PAGE_SIZE && (
                    <button
                      onClick={() => setVisibleCount(PAGE_SIZE)}
                      className="text-xs px-4 py-1.5 rounded-md border border-line text-slate-400 hover:border-accent/50 hover:text-accent-hover transition-colors"
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}