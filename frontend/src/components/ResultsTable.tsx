import { useMemo, useState } from "react";
import {
  BarChart3, ChevronDown, Download, FileJson, FileSpreadsheet, Sheet, Sparkles, Table2,
} from "lucide-react";
import type { ExecuteQueryResponse } from "../type";
import { exportToCsv, exportToExcel, exportToJson } from "../utils/export";
import { api } from "../api/client";
import ChartView from "./ChartView";
import { Alert, Badge, Button, EmptyState, Menu, MenuItem, SegmentedControl } from "./ui";

interface Props {
  results: ExecuteQueryResponse;
  question?: string;
  sql?: string;
  dbType?: string;
}

const PAGE_SIZE = 50;

/** Right-aligning numbers is what makes a column of figures comparable at a
 *  glance; everything else stays left-aligned. Decided per column from the
 *  first non-null value so a single null doesn't flip the alignment. */
function isNumericColumn(rows: unknown[][], index: number): boolean {
  for (const row of rows) {
    const cell = row[index];
    if (cell === null || cell === undefined || cell === "") continue;
    return typeof cell === "number" || (typeof cell === "string" && cell.trim() !== "" && !isNaN(Number(cell)));
  }
  return false;
}

export default function ResultsTable({ results, question, sql, dbType }: Props) {
  const [view, setView] = useState<"table" | "chart">("table");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const visibleRows = results.rows.slice(0, visibleCount);
  const hasMore = visibleCount < results.rows.length;
  const canSummarize = Boolean(question && sql);

  const numericColumns = useMemo(
    () => results.columns.map((_, i) => isNumericColumn(results.rows, i)),
    [results]
  );

  async function handleSummarize() {
    if (!question || !sql) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await api.summarizeResults(question, sql, results.columns, results.rows);
      setSummary(res.summary);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Couldn't summarise these results.");
    } finally {
      setSummarizing(false);
    }
  }

  if (results.rows.length === 0) {
    return (
      <EmptyState
        icon={<Table2 size={18} />}
        title="No rows matched"
        description="The query ran successfully against the database and came back empty. Try widening the question — a different date range, or fewer filters."
        className="py-8"
      />
    );
  }

  return (
    <div className="min-w-0">
      {/* ------------------------------------------------------- toolbar -- */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs text-muted whitespace-nowrap">
            <span className="font-medium text-primary tabular-nums">
              {results.row_count.toLocaleString()}
            </span>{" "}
            row{results.row_count !== 1 ? "s" : ""}
          </p>
          {results.truncated && (
            <Badge tone="warn" title="The server capped this result set">
              Truncated
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <SegmentedControl
            label="Result view"
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: <><Table2 size={12} aria-hidden /> Table</>, title: "Table view" },
              { value: "chart", label: <><BarChart3 size={12} aria-hidden /> Chart</>, title: "Chart view" },
            ]}
          />

          {canSummarize && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkles size={13} />}
              loading={summarizing}
              onClick={handleSummarize}
              aria-label="Summarise these results"
            >
              <span className="hidden sm:inline">Summarise</span>
            </Button>
          )}

          <Menu
            trigger={(props) => (
              <Button
                size="sm"
                variant="secondary"
                icon={<Download size={13} />}
                iconRight={<ChevronDown size={12} />}
                aria-label="Export results"
                {...props}
              >
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<Sheet size={14} />}
                  onClick={() => { exportToCsv(results); close(); }}
                >
                  CSV
                </MenuItem>
                {canSummarize && (
                  <MenuItem
                    icon={<FileSpreadsheet size={14} />}
                    onClick={() => {
                      exportToExcel(results, { question: question!, sql: sql!, dbType });
                      close();
                    }}
                  >
                    Excel
                  </MenuItem>
                )}
                <MenuItem
                  icon={<FileJson size={14} />}
                  onClick={() => { exportToJson(results); close(); }}
                >
                  JSON
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {(summary || summaryError) && (
        <div className="px-3 sm:px-4 pt-3">
          {summaryError ? (
            <Alert tone="danger" title="Summary unavailable">{summaryError}</Alert>
          ) : (
            <Alert tone="success" title="Summary">{summary}</Alert>
          )}
        </div>
      )}

      {view === "chart" ? (
        <ChartView results={results} />
      ) : (
        <div className="p-3 sm:p-4">
          {/* The scroll container is the only thing allowed to overflow --
              a wide result must never push the whole page sideways. */}
          <div className="rounded-lg border border-line overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <caption className="sr-only">
                Query results, {results.row_count} rows across {results.columns.length} columns
              </caption>
              <thead>
                <tr className="bg-raised">
                  {results.columns.map((col, i) => (
                    <th
                      key={col}
                      scope="col"
                      className={`sticky top-0 px-3 py-2 font-mono font-medium text-[11px] text-muted
                        border-b border-line whitespace-nowrap bg-raised
                        ${numericColumns[i] ? "text-right" : "text-left"}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-0 hover:bg-hover transition-colors">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-3 py-2 font-mono align-top max-w-xs truncate
                          ${numericColumns[j] ? "text-right tabular-nums text-primary" : "text-secondary"}`}
                        title={cell === null ? undefined : String(cell)}
                      >
                        {cell === null || cell === undefined ? (
                          <span className="text-faint italic">null</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(hasMore || visibleCount > PAGE_SIZE) && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
              <p className="text-[11px] text-faint tabular-nums">
                Showing {Math.min(visibleCount, results.rows.length).toLocaleString()} of{" "}
                {results.rows.length.toLocaleString()}
              </p>
              <div className="flex gap-2">
                {hasMore && (
                  <Button size="sm" variant="secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, results.rows.length - visibleCount)} more
                  </Button>
                )}
                {visibleCount > PAGE_SIZE && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setVisibleCount((n) => Math.max(PAGE_SIZE, n - PAGE_SIZE))}
                  >
                    Show less
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
