import * as XLSX from "xlsx-js-style";
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

interface ExcelExportContext {
  question: string;
  sql: string;
  dbType?: string;
}

const ACCENT_COLOR = "22C55E";
const MUTED_GRAY = "6B7280";
const LIGHT_FILL = "F3F4F6";
const BORDER_COLOR = "D1D5DB";

const thinBorder = { style: "thin", color: { rgb: BORDER_COLOR } };

export function exportToExcel(
  results: ExecuteQueryResponse,
  context: ExcelExportContext,
  filename = "query_results.xlsx"
) {
  const now = new Date();
  const generatedLabel = now.toLocaleString(undefined, {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  // ---- Build the "Results" sheet as an array-of-arrays so we control
  // exactly which row holds what (title, metadata block, spacer, table). ----
  const metaRows = [
    ["Field", "Value"],
    ["Question", context.question],
    ["Generated", generatedLabel],
    ["Database", context.dbType ?? "—"],
    ["Rows", results.row_count],
  ];

  const titleRowIdx = 0;
  const subtitleRowIdx = 1;
  const metaStartIdx = 3;
  const metaEndIdx = metaStartIdx + metaRows.length - 1;
  const tableHeaderIdx = metaEndIdx + 2;

  const aoa: unknown[][] = [
    ["Phantom Query"],
    ["Query Results"],
    [],
    ...metaRows,
    [],
    results.columns,
    ...results.rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // ---- Styling ----
  function setCellStyle(row: number, col: number, style: object) {
    const ref = XLSX.utils.encode_cell({ r: row, c: col });
    if (!worksheet[ref]) worksheet[ref] = { t: "s", v: "" };
    worksheet[ref].s = style;
  }

  // Title
  setCellStyle(titleRowIdx, 0, {
    font: { bold: true, sz: 16, color: { rgb: "1F2937" } },
    border: { bottom: { style: "medium", color: { rgb: ACCENT_COLOR } } },
  });
  // Subtitle
  setCellStyle(subtitleRowIdx, 0, {
    font: { sz: 11, color: { rgb: MUTED_GRAY }, italic: true },
  });

  // Metadata block: labels bold+muted, values plain
  for (let i = 0; i < metaRows.length; i++) {
    const r = metaStartIdx + i;
    setCellStyle(r, 0, { font: { bold: true, sz: 10, color: { rgb: MUTED_GRAY } } });
    setCellStyle(r, 1, { font: { sz: 10, color: { rgb: "1F2937" } } });
  }

  // Data table header row: bold, light fill, border, all columns
  for (let c = 0; c < results.columns.length; c++) {
    setCellStyle(tableHeaderIdx, c, {
      font: { bold: true, sz: 10, color: { rgb: "1F2937" } },
      fill: { fgColor: { rgb: LIGHT_FILL } },
      border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
      alignment: { vertical: "center" },
    });
  }

  // Data rows: thin borders for a clean, print-friendly grid
  for (let r = 0; r < results.rows.length; r++) {
    for (let c = 0; c < results.columns.length; c++) {
      setCellStyle(tableHeaderIdx + 1 + r, c, {
        font: { sz: 10, color: { rgb: "1F2937" } },
        border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
      });
    }
  }

  // Column widths: auto-fit based on the widest value in each column (capped)
  const colWidths = results.columns.map((col, i) => {
    const headerLen = String(col).length;
    const maxDataLen = results.rows.reduce((max, row) => {
      const len = String(row[i] ?? "").length;
      return len > max ? len : max;
    }, 0);
    return { wch: Math.min(Math.max(headerLen, maxDataLen) + 2, 40) };
  });
  worksheet["!cols"] = colWidths;

  // Freeze panes just below the table header row, so it stays visible on scroll
  worksheet["!freeze"] = { xSplit: 0, ySplit: tableHeaderIdx + 1 };

  // ---- "Query" sheet: the SQL, for technical users / auditability ----
  const queryAoa: unknown[][] = [
    ["Phantom Query — Generated SQL"],
    [],
    ["Question", context.question],
    ["Generated", generatedLabel],
    [],
    [context.sql],
  ];
  const querySheet = XLSX.utils.aoa_to_sheet(queryAoa);
  const queryTitleStyle = {
    font: { bold: true, sz: 14, color: { rgb: "1F2937" } },
    border: { bottom: { style: "medium", color: { rgb: ACCENT_COLOR } } },
  };
  querySheet["A1"].s = queryTitleStyle;
  querySheet["A6"].s = { font: { name: "Consolas", sz: 10 }, alignment: { wrapText: true, vertical: "top" } };
  querySheet["!cols"] = [{ wch: 100 }];

  // ---- Assemble workbook ----
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
  XLSX.utils.book_append_sheet(workbook, querySheet, "Query");
  XLSX.writeFile(workbook, filename);
}