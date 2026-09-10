import { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { BarChart3, Download, SlidersHorizontal } from "lucide-react";

import type { ExecuteQueryResponse } from "../type";
import { detectChartDefaults, type ChartType } from "../utils/chartDetection";
import { useThemeTokens } from "../utils/useThemeTokens";
import { Button, EmptyState, SegmentedControl } from "./ui";

interface Props {
  results: ExecuteQueryResponse;
}

const MAX_CHART_POINTS = 500;
const MAX_PIE_SLICES = 8;

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
  const defaults = useMemo(() => detectChartDefaults(results), [results]);
  const colors = useThemeTokens();

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
    if (yIndex === -1) return { chartData: data, droppedCount: 0 };
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
    if (effectiveChartType !== "pie" || yIndex === -1) return [];
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

    const svgString = new XMLSerializer().serializeToString(svg);
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
      // Fill the background so the exported PNG isn't transparent, which reads
      // as broken when dropped into a light document.
      ctx.fillStyle = colors.surface;
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

  if (!results.rows || results.rows.length === 0) {
    return <EmptyState icon={<BarChart3 size={18} />} title="Nothing to chart" className="py-8" />;
  }

  if (!defaults.canChart) {
    return (
      <EmptyState
        icon={<BarChart3 size={18} />}
        title="This result can't be charted"
        description="A chart needs at least one numeric column to measure. Switch back to the table to read these results."
        className="py-8"
      />
    );
  }

  const tooltipStyle = {
    background: colors.elevated,
    border: `1px solid ${colors.grid}`,
    borderRadius: 8,
    fontSize: 12,
    color: colors.text,
  };
  const axisProps = { stroke: colors.axis, fontSize: 11, tickLine: false } as const;

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SegmentedControl
          label="Chart configuration mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "auto", label: "Auto" },
            { value: "manual", label: <><SlidersHorizontal size={11} aria-hidden /> Custom</> },
          ]}
        />

        {mode === "manual" && (
          <>
            <InlineSelect label="Type" value={chartType} onChange={(v) => setChartType(v as ChartType)}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="scatter">Scatter</option>
              <option value="pie">Pie</option>
            </InlineSelect>

            <InlineSelect label="X" value={xColumn} onChange={setXColumn}>
              {results.columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </InlineSelect>

            {defaults.numericColumns.length > 0 ? (
              <InlineSelect label="Y" value={yColumn} onChange={setYColumn}>
                {defaults.numericColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </InlineSelect>
            ) : (
              <span className="text-xs text-danger">No numeric column to plot.</span>
            )}
          </>
        )}

        <Button
          size="sm"
          variant="secondary"
          icon={<Download size={13} />}
          onClick={handleExportImage}
          aria-label="Export chart as PNG"
          className="ml-auto"
        >
          <span className="hidden sm:inline">PNG</span>
        </Button>
      </div>

      {(isCapped || droppedCount > 0) && (
        <p className="text-[11px] text-faint mb-2">
          {isCapped &&
            `Charting the first ${MAX_CHART_POINTS.toLocaleString()} of ${results.rows.length.toLocaleString()} rows. `}
          {droppedCount > 0 &&
            `${droppedCount} row${droppedCount !== 1 ? "s" : ""} skipped — the value wasn't numeric.`}
        </p>
      )}

      <div
        ref={chartContainerRef}
        className="h-72 sm:h-80 rounded-lg border border-line bg-panel p-3"
      >
        {chartData.length === 0 && effectiveChartType !== "pie" ? (
          <div className="h-full flex items-center justify-center text-sm text-muted text-center px-4">
            No numeric values in “{effectiveYColumn}” to plot.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {effectiveChartType === "bar" ? (
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey={effectiveXColumn}
                  {...axisProps}
                  tickFormatter={(v) => truncateLabel(v)}
                  angle={chartData.length > 8 ? -30 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 54 : 30}
                />
                <YAxis {...axisProps} tickFormatter={formatNumber} width={56} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: colors.grid, opacity: 0.35 }}
                  formatter={(v: unknown) => formatNumber(v)}
                />
                <Bar dataKey={effectiveYColumn} fill={colors.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : effectiveChartType === "line" ? (
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey={effectiveXColumn} {...axisProps} tickFormatter={(v) => truncateLabel(v)} />
                <YAxis {...axisProps} tickFormatter={formatNumber} width={56} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatNumber(v)} />
                <Line
                  type="monotone"
                  dataKey={effectiveYColumn}
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={chartData.length <= 50 ? { r: 2.5, strokeWidth: 0, fill: colors.accent } : false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            ) : effectiveChartType === "pie" ? (
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="78%"
                  stroke={colors.surface}
                  strokeWidth={2}
                  label={(entry: { name?: string }) => truncateLabel(entry.name, 14)}
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={colors.categorical[index % colors.categorical.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatNumber(v)} />
              </PieChart>
            ) : (
              <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis dataKey={effectiveXColumn} {...axisProps} tickFormatter={formatNumber} />
                <YAxis dataKey={effectiveYColumn} {...axisProps} tickFormatter={formatNumber} width={56} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatNumber(v)} />
                <Scatter data={chartData} fill={colors.accent} />
              </ScatterChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function InlineSelect({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-faint">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md bg-raised border border-line px-2 text-xs text-primary
          focus:outline-none focus:border-accent max-w-32 truncate"
      >
        {children}
      </select>
    </label>
  );
}
