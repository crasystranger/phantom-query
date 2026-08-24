import { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";

import type { ExecuteQueryResponse } from "../type";
import { detectChartDefaults, type ChartType } from "../utils/chartDetection";

interface Props {
  results: ExecuteQueryResponse;
}

const MAX_CHART_POINTS = 500;
const MAX_PIE_SLICES = 8;

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatNumber(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value ?? "");
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function truncateLabel(value: unknown, maxLen = 12): string {
  const str = String(value ?? "");
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

export default function ChartView({ results }: Props) {
  const defaults = detectChartDefaults(results);

  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [chartType, setChartType] = useState<ChartType>(defaults.chartType);
  const [xColumn, setXColumn] = useState(defaults.xColumn);
  const [yColumn, setYColumn] = useState(defaults.yColumn);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = detectChartDefaults(results);
    setChartType(d.chartType);
    setXColumn(d.xColumn);
    setYColumn(d.yColumn);
  }, [results]);

  // Theme-aware colors, read once per render rather than hardcoded --
  // this is what makes the chart respect light mode and custom accent colors.
  const colors = useMemo(() => ({
    accent: getCssVar("--color-accent", "#22C55E"),
    accentHover: getCssVar("--color-accent-hover", "#16A34A"),
    gridLine: getCssVar("--color-border-subtle", "rgba(255,255,255,0.08)"),
    axisText: getCssVar("--color-faint", "#6e7681"),
    tooltipBg: getCssVar("--color-elevated", "#1C2128"),
    tooltipBorder: getCssVar("--color-border-subtle", "rgba(255,255,255,0.08)"),
  }), []);

  if (!results.rows || results.rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        No rows to chart.
      </div>
    );
  }

  if (!defaults.canChart) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        This result doesn't have a numeric column to chart — try the table view instead.
      </div>
    );
  }

  const effectiveChartType = mode === "auto" ? defaults.chartType : chartType;
  const effectiveXColumn = mode === "auto" ? defaults.xColumn : xColumn;
  const effectiveYColumn = mode === "auto" ? defaults.yColumn : yColumn;

  const xIndex = results.columns.indexOf(effectiveXColumn);
  const yIndex = results.columns.indexOf(effectiveYColumn);

  const isCapped = results.rows.length > MAX_CHART_POINTS;

  // Filter out rows where Y isn't a real number (NaN would otherwise silently
  // plot as a broken/zero point) and cap the point count for render performance.
  const { chartData, droppedCount } = useMemo(() => {
    let dropped = 0;
    const data: Record<string, unknown>[] = [];
    for (const row of results.rows) {
      if (data.length >= MAX_CHART_POINTS) break;
      const rawY = row[yIndex];
      const y = typeof rawY === "number" ? rawY : Number(rawY);
      if (Number.isNaN(y)) {
        dropped++;
        continue;
      }
      data.push({ [effectiveXColumn]: row[xIndex], [effectiveYColumn]: y });
    }
    return { chartData: data, droppedCount: dropped };
  }, [results.rows, xIndex, yIndex, effectiveXColumn, effectiveYColumn]);

  // Pie: cap to top N slices by value, bucket the rest into "Other" so a
  // 500-row result doesn't render 500 illegible pie slivers.
  const pieData = useMemo(() => {
    if (effectiveChartType !== "pie") return [];
    const raw = results.rows
      .map((row) => ({ name: truncateLabel(row[xIndex], 20), value: Number(row[yIndex]) }))
      .filter((d) => !Number.isNaN(d.value))
      .sort((a, b) => b.value - a.value);

    if (raw.length <= MAX_PIE_SLICES) return raw;
    const top = raw.slice(0, MAX_PIE_SLICES - 1);
    const otherTotal = raw.slice(MAX_PIE_SLICES - 1).reduce((sum, d) => sum + d.value, 0);
    return [...top, { name: "Other", value: otherTotal }];
  }, [effectiveChartType, results.rows, xIndex, yIndex]);

  function handleExportImage() {
    const svg = chartContainerRef.current?.querySelector("svg");
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2; // export at 2x for crisper output
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Fill background so the exported PNG isn't transparent-on-white-looking-wrong
      ctx.fillStyle = getCssVar("--color-panel", "#161B22");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "chart.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    };
    img.src = url;
  }

  const tooltipStyle = {
    background: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
  };

  const axisProps = { stroke: colors.axisText, fontSize: 11 };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select label="Mode" value={mode} onChange={(v) => setMode(v as "auto" | "manual")}>
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </Select>

        {mode === "manual" && (
          <>
            <Select label="Chart" value={chartType} onChange={(v) => setChartType(v as ChartType)}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="scatter">Scatter</option>
              <option value="pie">Pie</option>
            </Select>

            <Select label="X-axis" value={xColumn} onChange={setXColumn}>
              {results.columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </Select>

            {defaults.numericColumns.length > 0 ? (
              <Select label="Y-axis" value={yColumn} onChange={setYColumn}>
                {defaults.numericColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </Select>
            ) : (
              <span className="text-xs text-danger">No numeric columns available for Y-axis.</span>
            )}
          </>
        )}

        <button
          onClick={handleExportImage}
          className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-line text-muted hover:text-accent-hover hover:border-accent/50 transition-colors"
        >
          <Download size={13} /> Export PNG
        </button>
      </div>

      {(isCapped || droppedCount > 0) && (
        <p className="text-[11px] text-faint mb-2">
          {isCapped && `Showing first ${MAX_CHART_POINTS.toLocaleString()} of ${results.rows.length.toLocaleString()} rows. `}
          {droppedCount > 0 && `${droppedCount} row${droppedCount !== 1 ? "s" : ""} skipped (non-numeric value).`}
        </p>
      )}

      <div ref={chartContainerRef} className="h-80 bg-panel border border-line rounded-md p-3">
        {chartData.length === 0 && effectiveChartType !== "pie" ? (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            No valid numeric data to chart for this column.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {effectiveChartType === "bar" ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridLine} />
                <XAxis
                  dataKey={effectiveXColumn}
                  {...axisProps}
                  tickFormatter={(v) => truncateLabel(v)}
                  angle={chartData.length > 8 ? -30 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 50 : 30}
                />
                <YAxis {...axisProps} tickFormatter={formatNumber} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatNumber(v)} />
                <Bar dataKey={effectiveYColumn} fill={colors.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : effectiveChartType === "line" ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridLine} />
                <XAxis
                  dataKey={effectiveXColumn}
                  {...axisProps}
                  tickFormatter={(v) => truncateLabel(v)}
                />
                <YAxis {...axisProps} tickFormatter={formatNumber} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatNumber(v)} />
                <Line
                  type="monotone"
                  dataKey={effectiveYColumn}
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={chartData.length <= 50}
                />
              </LineChart>
            ) : effectiveChartType === "pie" ? (
              pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted">
                  No valid numeric data to chart.
                </div>
              ) : (
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatNumber(v)} />
                </PieChart>
              )
            ) : (
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridLine} />
                <XAxis dataKey={effectiveXColumn} {...axisProps} tickFormatter={formatNumber} />
                <YAxis dataKey={effectiveYColumn} {...axisProps} tickFormatter={formatNumber} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatNumber(v)} />
                <Scatter data={chartData} fill={colors.accent} />
              </ScatterChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Select({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs text-muted flex items-center gap-2">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md bg-ink border border-line px-2 py-1 text-primary text-xs focus:outline-none focus:border-accent/60"
      >
        {children}
      </select>
    </label>
  );
}