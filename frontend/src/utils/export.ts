import type { ExecuteQueryResponse } from "../type";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(results: ExecuteQueryResponse, filename = "query_results.csv") {
  const headerRow = results.columns.map(csvEscape).join(",");
  const dataRows = results.rows.map((row) => row.map(csvEscape).join(","));
  const csvContent = [headerRow, ...dataRows].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function exportToJson(results: ExecuteQueryResponse, filename = "query_results.json") {
  const rows = results.rows.map((row) =>
    Object.fromEntries(results.columns.map((col, i) => [col, row[i]]))
  );
  const json = JSON.stringify(rows, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// The Excel workbook is large enough to live on its own; re-exported here so
// the call site keeps importing everything export-related from one module.
export { exportToExcel } from "./excelExport";
export type { ExcelExportContext } from "./excelExport";
