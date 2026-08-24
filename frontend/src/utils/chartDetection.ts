import type { ExecuteQueryResponse } from "../type";

export type ChartType = "bar" | "line" | "scatter" | "pie";

export interface ChartDefaults {
  chartType: ChartType;
  xColumn: string;
  yColumn: string;
  numericColumns: string[];
  canChart: boolean;
}

function looksNumeric(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string" && value.trim() !== "") {
    return !isNaN(Number(value));
  }
  return false;
}

function looksDateLike(columnName: string, value: unknown): boolean {
  const nameHints = /date|time|created|updated|_at$/i;
  if (nameHints.test(columnName)) return true;
  if (typeof value === "string") {
    // crude check for ISO-ish date strings, e.g. "2025-04-01"
    return /^\d{4}-\d{2}-\d{2}/.test(value);
  }
  return false;
}

export function detectChartDefaults(results: ExecuteQueryResponse): ChartDefaults {
  const { columns, rows } = results;

  if (rows.length === 0 || columns.length < 2) {
    return { chartType: "bar", xColumn: columns[0] ?? "", yColumn: "", numericColumns: [], canChart: false };
  }

  const sampleRow = rows[0];

  const numericColumns = columns.filter((_, i) => looksNumeric(sampleRow[i]));
  const dateColumns = columns.filter((col, i) => looksDateLike(col, sampleRow[i]));
  const nonNumericColumns = columns.filter((col) => !numericColumns.includes(col));

  // Need at least one numeric column to plot anything meaningful on the Y-axis
  if (numericColumns.length === 0) {
    return { chartType: "bar", xColumn: columns[0], yColumn: "", numericColumns: [], canChart: false };
  }

  const yColumn = numericColumns[0];

  // Prefer a date-like column for X if one exists -> line chart suits trends over time
  if (dateColumns.length > 0) {
    return {
      chartType: "line",
      xColumn: dateColumns[0],
      yColumn,
      numericColumns,
      canChart: true,
    };
  }

  // Two numeric columns and enough rows -> scatter can reveal correlation
  if (numericColumns.length >= 2 && rows.length > 8) {
    return {
      chartType: "scatter",
      xColumn: numericColumns[0],
      yColumn: numericColumns[1],
      numericColumns,
      canChart: true,
    };
  }

  // Default: bar chart against the first non-numeric (categorical) column, if one exists
  const xColumn = nonNumericColumns[0] ?? columns[0];
  return {
    chartType: "bar",
    xColumn,
    yColumn,
    numericColumns,
    canChart: true,
  };
}