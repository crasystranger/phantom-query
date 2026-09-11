/**
 * Excel (.xlsx) export for Phantom Query.
 *
 * The workbook is built with `xlsx-js-style` (SheetJS community + cell styles),
 * which covers values, number formats, styling, formulas and auto-filters — but
 * it cannot write frozen panes, Excel tables (ListObjects) or charts. Those are
 * exactly the things that make a workbook feel like a real Excel report, so the
 * finished package is re-opened with `fflate` and the missing OOXML parts are
 * injected before the file reaches the browser (see `injectOoxmlParts`).
 *
 * Nothing here re-queries or reshapes the result set: the rows written are the
 * rows the API returned, in the order it returned them.
 */
import * as XLSX from "xlsx-js-style";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ExecuteQueryResponse } from "../type";

export interface ExcelExportContext {
  question: string;
  sql: string;
  dbType?: string;
}

/* ------------------------------------------------------------------ */
/* Palette, formats, layout constants                                  */
/* ------------------------------------------------------------------ */

const INK = "1F2937";
const MUTED = "6B7280";
const ACCENT = "22C55E"; // Phantom Query green, used only as a thin rule.
const TABLE_HEADER_FILL = "4472C4"; // matches TableStyleMedium2's header band
const CODE_FILL = "F5F6F8";
const RULE = "D6D9DE";
const SERIES_FILL = "4472C4";

const CURRENCY_FMT = '"GH₵"#,##0.00';
const CURRENCY_AXIS_FMT = '"GH₵"#,##0';
const INTEGER_FMT = "#,##0";
const DECIMAL_FMT = "#,##0.00";
const AVERAGE_FMT = "#,##0.0";
const ID_FMT = "0";
const DATE_FMT = "yyyy-mm-dd";
const DATETIME_FMT = "yyyy-mm-dd hh:mm";

const SHEET_RESULTS = "Query Results";
const SHEET_INFO = "Query Info";
const SHEET_SUMMARY = "Summary";

/** Excel row (1-based) holding the results table header. */
const HEADER_ROW = 6;
/** Excel row (1-based) of the first row in the Summary sheet's chart source. */
const TOP_N_HEADER_ROW = 12;
const TOP_N_LIMIT = 10;

type Style = Record<string, unknown>;

const accentRule = { bottom: { style: "medium", color: { rgb: ACCENT } } };
const thinRule = { bottom: { style: "thin", color: { rgb: RULE } } };

const metaStyle: Style = { font: { sz: 10, color: { rgb: MUTED } } };
const labelStyle: Style = {
  font: { bold: true, sz: 10, color: { rgb: MUTED } },
  alignment: { vertical: "top" },
};
const valueStyle: Style = {
  font: { sz: 10, color: { rgb: INK } },
  alignment: { vertical: "top", wrapText: true },
};
const sectionStyle: Style = {
  font: { bold: true, sz: 11, color: { rgb: INK } },
  border: thinRule,
};
const kpiLabelStyle: Style = { font: { sz: 10, color: { rgb: INK } } };
const kpiValueStyle: Style = {
  font: { bold: true, sz: 11, color: { rgb: INK } },
  alignment: { horizontal: "right" },
};
const kpiTextValueStyle: Style = {
  font: { bold: true, sz: 11, color: { rgb: INK } },
  alignment: { horizontal: "left" },
};
const codeStyle: Style = {
  font: { name: "Consolas", sz: 10, color: { rgb: INK } },
  fill: { patternType: "solid", fgColor: { rgb: CODE_FILL } },
  alignment: { vertical: "center" },
};

/* ------------------------------------------------------------------ */
/* Cell plumbing                                                       */
/* ------------------------------------------------------------------ */

interface CellSpec {
  v?: string | number | boolean;
  f?: string;
  t?: "s" | "n" | "b";
  z?: string;
  s?: Style;
}

/** Small sheet builder: writes cells by coordinate and tracks the used range. */
class SheetBuilder {
  readonly ws: XLSX.WorkSheet = {};
  private maxRow = 0;
  private maxCol = 0;

  /** `row` and `col` are 0-based. */
  set(row: number, col: number, cell: CellSpec) {
    const out: Record<string, unknown> = {};
    if (cell.f !== undefined) {
      out.f = cell.f;
      out.t = cell.t ?? "n";
    } else {
      const v = cell.v === undefined ? "" : cell.v;
      out.v = v;
      out.t =
        cell.t ?? (typeof v === "number" ? "n" : typeof v === "boolean" ? "b" : "s");
    }
    const style: Style = { ...(cell.s ?? {}) };
    if (cell.z) style.numFmt = cell.z;
    if (Object.keys(style).length) out.s = style;
    this.ws[XLSX.utils.encode_cell({ r: row, c: col })] = out as unknown as XLSX.CellObject;
    if (row > this.maxRow) this.maxRow = row;
    if (col > this.maxCol) this.maxCol = col;
  }

  /** Text in the first column, with the style carried across `span` columns so
   *  rules and fills read as a band rather than stopping mid-way. */
  band(row: number, span: number, text: string, style: Style) {
    for (let c = 0; c < Math.max(span, 1); c++) {
      this.set(row, c, { v: c === 0 ? text : "", s: style });
    }
  }

  reserve(row: number, col: number) {
    if (row > this.maxRow) this.maxRow = row;
    if (col > this.maxCol) this.maxCol = col;
  }

  finish(cols: XLSX.ColInfo[]): XLSX.WorkSheet {
    this.ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: this.maxRow, c: this.maxCol },
    });
    this.ws["!cols"] = cols;
    return this.ws;
  }
}

/* ------------------------------------------------------------------ */
/* Column analysis                                                     */
/* ------------------------------------------------------------------ */

type ColumnKind =
  | "id"
  | "integer"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "text";

interface ColumnMeta {
  /** De-duplicated, human-cased header written into the sheet. */
  header: string;
  /** Position in `results.columns` / each row array. */
  index: number;
  kind: ColumnKind;
  numFmt?: string;
  align: "left" | "right";
  width: number;
}

const ID_RE = /(^|[_\s])id$/i;
const COUNT_RE =
  /(count|qty|quantity|orders?|items?|units?|num(ber)?|distinct|visits?|clicks?)/i;
const CURRENCY_RE =
  /(amount|spend(ing)?|price|revenue|cost|sales|balance|payment|fee|salary|income|profit|total|value|gross|net|charge|refund|discount|subtotal)/i;
const NAME_RE =
  /(name|customer|client|title|label|category|product|user|company|region|city|country)/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const NUMERIC_RE = /^-?(\d+|\d*\.\d+)([eE][+-]?\d+)?$/;

const ENTITIES = [
  "customer", "client", "user", "product", "order", "employee", "supplier",
  "vendor", "account", "merchant", "student", "patient", "region", "category",
];

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && NUMERIC_RE.test(v.trim())) return Number(v.trim());
  return null;
}

/** Excel serial for a calendar instant (1900 date system, no local-TZ drift). */
function serial(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  return (Date.UTC(y, mo - 1, d, h, mi, s) - Date.UTC(1899, 11, 30)) / 86400000;
}

function asDateSerial(v: unknown): { value: number; withTime: boolean } | null {
  if (typeof v !== "string") return null;
  const str = v.trim();
  if (DATE_ONLY_RE.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    return { value: serial(y, m, d), withTime: false };
  }
  const m = DATETIME_RE.exec(str);
  if (!m) return null;
  if (m[7]) {
    // Explicit offset or Z: normalise to UTC so the shown value is unambiguous.
    const dt = new Date(str.replace(" ", "T"));
    if (Number.isNaN(dt.getTime())) return null;
    return {
      value: serial(
        dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(),
        dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds(),
      ),
      withTime: true,
    };
  }
  return {
    value: serial(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)),
    withTime: true,
  };
}

/** Short forms that read wrong in title case ("Customer Id"). */
const ACRONYMS = new Set([
  "id", "ids", "sql", "url", "uri", "api", "uuid", "ip", "kpi", "sku",
  "vat", "gst", "usd", "ghs", "eur", "gbp", "cpu", "utc", "pdf", "csv",
]);

/** `total_spending` -> `Total Spending`; names already cased are left alone. */
function humanise(header: string): string {
  const raw = String(header ?? "").trim();
  if (!raw) return "Column";
  if (/[a-z]/.test(raw) && /[A-Z]/.test(raw) && !raw.includes("_")) return raw;
  return raw
    .replace(/[_\s]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (ACRONYMS.has(w.toLowerCase())) return w.toUpperCase();
      if (w.length <= 3 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function detectKind(header: string, values: unknown[]): ColumnKind {
  const present = values.filter((v) => !isBlank(v));
  if (!present.length) return "text";

  const dates = present.map(asDateSerial);
  if (dates.every((d) => d !== null)) {
    return dates.some((d) => d!.withTime) ? "datetime" : "date";
  }

  const nums = present.map(asNumber);
  if (nums.every((n) => n !== null)) {
    if (ID_RE.test(header)) return "id";
    const allInts = nums.every((n) => Number.isInteger(n as number));
    // A whole-number column named like a tally is a count, not money — checked
    // first so `completed_orders` doesn't get currency formatting.
    if (allInts && COUNT_RE.test(header)) return "integer";
    if (CURRENCY_RE.test(header)) return "currency";
    return allInts ? "integer" : "number";
  }
  return "text";
}

function formatFor(kind: ColumnKind): string | undefined {
  switch (kind) {
    case "id": return ID_FMT;
    case "integer": return INTEGER_FMT;
    case "number": return DECIMAL_FMT;
    case "currency": return CURRENCY_FMT;
    case "date": return DATE_FMT;
    case "datetime": return DATETIME_FMT;
    default: return undefined;
  }
}

/** Rendered width of a value once its number format applies. */
function displayWidth(value: unknown, kind: ColumnKind): number {
  if (isBlank(value)) return 0;
  if (kind === "date") return 10;
  if (kind === "datetime") return 16;
  if (kind !== "text") {
    const n = asNumber(value);
    if (n !== null) {
      const body = Math.abs(n).toFixed(kind === "currency" || kind === "number" ? 2 : 0);
      const grouped = kind === "id" ? body : body.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return grouped.length + (n < 0 ? 1 : 0) + (kind === "currency" ? 4 : 0);
    }
  }
  return String(value).length;
}

function analyseColumns(results: ExecuteQueryResponse): ColumnMeta[] {
  const seen = new Set<string>();
  return results.columns.map((raw, index) => {
    const values = results.rows.map((row) => row[index]);
    const kind = detectKind(String(raw ?? ""), values);

    // Table column names must be unique, non-empty and identical to the header
    // cell, so the de-duplicated name is computed once and used for both.
    let header = humanise(String(raw ?? ""));
    if (seen.has(header.toLowerCase())) {
      let n = 2;
      while (seen.has(`${header} ${n}`.toLowerCase())) n++;
      header = `${header} ${n}`;
    }
    seen.add(header.toLowerCase());

    let widest = header.length;
    for (const v of values) {
      const w = displayWidth(v, kind);
      if (w > widest) widest = w;
    }
    return {
      header,
      index,
      kind,
      numFmt: formatFor(kind),
      align: kind === "text" ? "left" : "right",
      width: Math.min(Math.max(widest + 3, 11), 46),
    };
  });
}

/** The column the summary and the chart are built around. */
function pickMeasure(cols: ColumnMeta[]): ColumnMeta | undefined {
  return (
    cols.find((c) => c.kind === "currency" && /(spend|total|amount|revenue|sales)/i.test(c.header)) ??
    cols.find((c) => c.kind === "currency") ??
    cols.find((c) => c.kind === "number") ??
    cols.find((c) => c.kind === "integer")
  );
}

function pickCount(cols: ColumnMeta[], measure?: ColumnMeta): ColumnMeta | undefined {
  const candidates = cols.filter(
    (c) => c.kind === "integer" && c.index !== measure?.index,
  );
  return candidates.find((c) => COUNT_RE.test(c.header)) ?? candidates[0];
}

interface LabelSource {
  /** One column, or two joined with a space (first_name + last_name). */
  columns: ColumnMeta[];
  title: string;
}

function pickLabel(cols: ColumnMeta[]): LabelSource | undefined {
  const text = cols.filter((c) => c.kind === "text");
  const first = text.find((c) => /first[_\s]?name/i.test(c.header));
  const last = text.find((c) => /last[_\s]?name/i.test(c.header));
  if (first && last) return { columns: [first, last], title: "Name" };
  const named =
    text.find((c) => NAME_RE.test(c.header) && !/e-?mail/i.test(c.header)) ?? text[0];
  if (named) return { columns: [named], title: named.header };
  const id = cols.find((c) => c.kind === "id");
  return id ? { columns: [id], title: id.header } : undefined;
}

/** "customer" when the result set is clearly about customers, else undefined. */
function detectEntity(cols: ColumnMeta[]): string | undefined {
  const haystack = cols.map((c) => c.header.toLowerCase()).join(" ");
  return ENTITIES.find((e) => haystack.includes(e));
}

function plural(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function toCell(raw: unknown, kind: ColumnKind): CellSpec {
  if (isBlank(raw)) return { v: "", t: "s" };
  if (typeof raw === "boolean") return { v: raw, t: "b" };
  if (kind === "date" || kind === "datetime") {
    const d = asDateSerial(raw);
    if (d) return { v: d.value, t: "n" };
  }
  if (kind !== "text") {
    const n = asNumber(raw);
    if (n !== null) return { v: n, t: "n" };
  }
  if (typeof raw === "object") return { v: JSON.stringify(raw), t: "s" };
  return { v: String(raw), t: "s" };
}

/* ------------------------------------------------------------------ */
/* Sheet 1 — Query Results                                             */
/* ------------------------------------------------------------------ */

interface TableSpec {
  sheetIndex: number;
  ref: string;
  columns: string[];
}

function buildResultsSheet(
  results: ExecuteQueryResponse,
  cols: ColumnMeta[],
  question: string,
  exportedLabel: string,
): { ws: XLSX.WorkSheet; table?: TableSpec } {
  const b = new SheetBuilder();
  const span = Math.max(cols.length, 1);
  const headerIdx = HEADER_ROW - 1;

  // Compact metadata block above the table — four lines, no dashboard.
  b.band(0, span, "Phantom Query — Query Results", {
    font: { bold: true, sz: 14, color: { rgb: INK } },
    border: accentRule,
  });
  b.set(1, 0, { v: `Question: ${question || "—"}`, s: metaStyle });
  b.set(2, 0, { v: `Exported: ${exportedLabel}`, s: metaStyle });
  b.set(3, 0, {
    v:
      `Rows: ${results.row_count.toLocaleString()}` +
      (results.truncated ? " (truncated by the server row limit)" : ""),
    s: metaStyle,
  });

  // The header band is painted explicitly to the same colour TableStyleMedium2
  // uses, so it reads identically whether cell or table formatting wins.
  const headerFill: Style = {
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: TABLE_HEADER_FILL } },
  };
  if (cols.length) {
    cols.forEach((col, c) => {
      b.set(headerIdx, c, {
        v: col.header,
        s: { ...headerFill, alignment: { horizontal: col.align, vertical: "center" } },
      });
    });
  } else {
    b.set(headerIdx, 0, { v: "No columns returned", s: headerFill });
  }

  // Data cells carry only number format and alignment — no fills — so the
  // table style's row banding shows through.
  results.rows.forEach((row, r) => {
    cols.forEach((col, c) => {
      const cell = toCell(row[col.index], col.kind);
      b.set(headerIdx + 1 + r, c, {
        ...cell,
        z: cell.t === "n" ? col.numFmt : undefined,
        s: { font: { sz: 10 }, alignment: { horizontal: col.align, vertical: "center" } },
      });
    });
  });

  const ws = b.finish(cols.length ? cols.map((c) => ({ wch: c.width })) : [{ wch: 28 }]);
  const lastCol = XLSX.utils.encode_col(Math.max(cols.length - 1, 0));

  if (results.rows.length && cols.length) {
    // The ListObject owns the auto-filter; adding a sheet-level one over the
    // same range as well is what makes Excel offer to repair the file.
    return {
      ws,
      table: {
        sheetIndex: 0,
        ref: `A${HEADER_ROW}:${lastCol}${HEADER_ROW + results.rows.length}`,
        columns: cols.map((c) => c.header),
      },
    };
  }
  // An Excel table needs at least one data row, so an empty result set falls
  // back to a plain filtered header.
  ws["!autofilter"] = { ref: `A${HEADER_ROW}:${lastCol}${HEADER_ROW}` };
  return { ws };
}

/* ------------------------------------------------------------------ */
/* Sheet 2 — Query Info                                                */
/* ------------------------------------------------------------------ */

function buildInfoSheet(
  results: ExecuteQueryResponse,
  context: ExcelExportContext,
  exportedLabel: string,
): XLSX.WorkSheet {
  const b = new SheetBuilder();

  b.band(0, 3, "Phantom Query", {
    font: { bold: true, sz: 16, color: { rgb: INK } },
    border: accentRule,
  });
  b.set(1, 0, { v: "Natural-language database analytics", s: metaStyle });

  const facts: Array<[string, CellSpec]> = [
    ["Question:", { v: context.question || "—", s: valueStyle }],
    ["Database:", { v: context.dbType ? context.dbType : "—", s: valueStyle }],
    ["Query status:", { v: "EXECUTED", s: valueStyle }],
    ["Rows returned:", { v: results.row_count, t: "n", z: INTEGER_FMT, s: { font: { sz: 10, color: { rgb: INK } }, alignment: { horizontal: "left" } } }],
    ["Export format:", { v: "Excel (.xlsx)", s: valueStyle }],
    ["Export timestamp:", { v: exportedLabel, s: valueStyle }],
  ];
  if (results.truncated) {
    facts.push([
      "Note:",
      { v: "Results were truncated by the server row limit.", s: valueStyle },
    ]);
  }

  let row = 3;
  for (const [label, cell] of facts) {
    b.set(row, 0, { v: label, s: labelStyle });
    b.set(row, 1, cell);
    row++;
  }

  row += 1;
  b.band(row, 3, "Generated SQL", sectionStyle);
  row += 1;

  // One SQL line per row in column A. B and C are empty on these rows, so long
  // lines render in full while the shared fill reads as a code block.
  const sqlLines = (context.sql || "").replace(/\r\n/g, "\n").replace(/\t/g, "    ").split("\n");
  for (const line of sqlLines) {
    b.set(row, 0, { v: line, s: codeStyle });
    b.set(row, 1, { v: "", s: codeStyle });
    b.set(row, 2, { v: "", s: codeStyle });
    row++;
  }

  return b.finish([{ wch: 20 }, { wch: 78 }, { wch: 14 }]);
}

/* ------------------------------------------------------------------ */
/* Sheet 3 — Summary                                                   */
/* ------------------------------------------------------------------ */

interface ChartSpec {
  sheetIndex: number;
  title: string;
  seriesName: string;
  seriesRef: string;
  catRef: string;
  valRef: string;
  cats: string[];
  vals: number[];
  numFmt: string;
  axisFmt: string;
  from: { col: number; row: number };
  to: { col: number; row: number };
}

/** `'Query Results'!$E$7:$E$56` for a column of the results table. */
function resultsRange(col: ColumnMeta, cols: ColumnMeta[], rowCount: number): string {
  const letter = XLSX.utils.encode_col(cols.indexOf(col));
  return `'${SHEET_RESULTS}'!$${letter}$${HEADER_ROW + 1}:$${letter}$${HEADER_ROW + rowCount}`;
}

function buildSummarySheet(
  results: ExecuteQueryResponse,
  cols: ColumnMeta[],
): { ws: XLSX.WorkSheet; chart?: ChartSpec } {
  const b = new SheetBuilder();
  const rowCount = results.rows.length;
  const measure = pickMeasure(cols);
  const counter = pickCount(cols, measure);
  const label = pickLabel(cols);
  const entity = detectEntity(cols);
  const noun = entity ?? "row";

  b.band(0, 2, "Phantom Query — Summary", {
    font: { bold: true, sz: 14, color: { rgb: INK } },
    border: accentRule,
  });
  b.set(1, 0, { v: "Figures derived from the exported query results", s: metaStyle });
  b.band(3, 2, "Key figures", sectionStyle);

  const mRange = measure ? resultsRange(measure, cols, rowCount) : null;
  const cRange = counter ? resultsRange(counter, cols, rowCount) : null;
  const firstCol = XLSX.utils.encode_col(0);
  const rowsRange = `'${SHEET_RESULTS}'!$${firstCol}$${HEADER_ROW + 1}:$${firstCol}$${HEADER_ROW + rowCount}`;

  // Formulas so the summary really is derived from the Query Results sheet.
  // With no rows there is no valid range to point at, so literals stand in.
  const kpis: Array<{ label: string; cell: CellSpec }> = [];

  kpis.push({
    label: `Total ${plural(noun)} returned`,
    cell: rowCount
      ? { f: `ROWS(${rowsRange})`, t: "n", z: INTEGER_FMT, s: kpiValueStyle }
      : { v: 0, t: "n", z: INTEGER_FMT, s: kpiValueStyle },
  });

  if (measure && mRange) {
    kpis.push({
      label: `Sum of ${measure.header}`,
      cell: rowCount
        ? { f: `SUM(${mRange})`, t: "n", z: measure.numFmt, s: kpiValueStyle }
        : { v: 0, t: "n", z: measure.numFmt, s: kpiValueStyle },
    });
    kpis.push({
      label: `Average ${measure.header}`,
      cell: rowCount
        ? { f: `IFERROR(AVERAGE(${mRange}),0)`, t: "n", z: measure.numFmt, s: kpiValueStyle }
        : { v: 0, t: "n", z: measure.numFmt, s: kpiValueStyle },
    });

    const topLabel = `Top ${noun} by ${measure.header}`;
    if (rowCount && label) {
      const match = `MATCH(MAX(${mRange}),${mRange},0)`;
      const parts = label.columns.map((c) => `INDEX(${resultsRange(c, cols, rowCount)},${match})`);
      kpis.push({
        label: topLabel,
        cell: { f: `IFERROR(${parts.join('&" "&')},"—")`, t: "s", s: kpiTextValueStyle },
      });
    } else {
      kpis.push({ label: topLabel, cell: { v: "—", s: kpiTextValueStyle } });
    }
  }

  if (counter && cRange) {
    kpis.push({
      label: `Average ${counter.header}`,
      cell: rowCount
        ? { f: `IFERROR(AVERAGE(${cRange}),0)`, t: "n", z: AVERAGE_FMT, s: kpiValueStyle }
        : { v: 0, t: "n", z: AVERAGE_FMT, s: kpiValueStyle },
    });
  }

  kpis.forEach((kpi, i) => {
    b.set(4 + i, 0, { v: kpi.label, s: kpiLabelStyle });
    b.set(4 + i, 1, kpi.cell);
  });

  // ---- Chart source block ----------------------------------------------
  // Ranked in JS from the exported rows (no re-query, no change to the data)
  // because a formula-driven ranking would be fragile across result sizes.
  let chart: ChartSpec | undefined;
  if (rowCount && measure && label) {
    const ranked = results.rows
      .map((row) => ({
        name: label.columns
          .map((c) => (isBlank(row[c.index]) ? "" : String(row[c.index])))
          .join(" ")
          .trim(),
        value: asNumber(row[measure.index]),
      }))
      .filter((r) => r.value !== null)
      .sort((a, b2) => (b2.value as number) - (a.value as number))
      .slice(0, TOP_N_LIMIT);

    if (ranked.length) {
      const nounTitle = entity
        ? plural(entity).replace(/^./, (m) => m.toUpperCase())
        : label.title;
      const title = `Top ${ranked.length} ${nounTitle} by ${measure.header}`;

      const headingIdx = TOP_N_HEADER_ROW - 2; // section heading sits above
      b.band(headingIdx, 2, title, sectionStyle);

      const headerIdx = TOP_N_HEADER_ROW - 1;
      b.set(headerIdx, 0, {
        v: label.title,
        s: { font: { bold: true, sz: 10, color: { rgb: INK } }, border: thinRule },
      });
      b.set(headerIdx, 1, {
        v: measure.header,
        s: {
          font: { bold: true, sz: 10, color: { rgb: INK } },
          alignment: { horizontal: "right" },
          border: thinRule,
        },
      });

      ranked.forEach((r, i) => {
        b.set(headerIdx + 1 + i, 0, { v: r.name || "—", s: { font: { sz: 10 } } });
        b.set(headerIdx + 1 + i, 1, {
          v: r.value as number,
          t: "n",
          z: measure.numFmt,
          s: { font: { sz: 10 }, alignment: { horizontal: "right" } },
        });
      });

      const firstDataRow = TOP_N_HEADER_ROW + 1;
      const lastDataRow = TOP_N_HEADER_ROW + ranked.length;
      chart = {
        sheetIndex: 2,
        title,
        seriesName: measure.header,
        seriesRef: `'${SHEET_SUMMARY}'!$B$${TOP_N_HEADER_ROW}`,
        catRef: `'${SHEET_SUMMARY}'!$A$${firstDataRow}:$A$${lastDataRow}`,
        valRef: `'${SHEET_SUMMARY}'!$B$${firstDataRow}:$B$${lastDataRow}`,
        cats: ranked.map((r) => r.name || "—"),
        vals: ranked.map((r) => r.value as number),
        numFmt: measure.numFmt ?? DECIMAL_FMT,
        axisFmt: measure.kind === "currency" ? CURRENCY_AXIS_FMT : INTEGER_FMT,
        from: { col: 3, row: 3 },
        to: { col: 11, row: Math.max(lastDataRow + 1, 21) },
      };
      // Keep the anchor inside the sheet's declared dimension.
      b.reserve(chart.to.row, chart.to.col);
    }
  }

  const ws = b.finish([{ wch: 34 }, { wch: 22 }, { wch: 3 }]);
  return { ws, chart };
}

/* ------------------------------------------------------------------ */
/* OOXML injection — frozen panes, Excel table, chart                  */
/* ------------------------------------------------------------------ */

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_CHART = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_DML = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_SSML = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_SSDRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SheetView {
  sheetIndex: number;
  /** Number of leading rows to freeze. */
  freezeRows?: number;
  gridLines?: boolean;
  tabSelected?: boolean;
}

interface InjectOptions {
  views: SheetView[];
  table?: TableSpec;
  chart?: ChartSpec;
}

function sheetPart(index: number): string {
  return `xl/worksheets/sheet${index + 1}.xml`;
}

function buildTableXml(table: TableSpec): string {
  const columns = table.columns
    .map((name, i) => `<tableColumn id="${i + 1}" name="${esc(name)}"/>`)
    .join("");
  return (
    `${XML_DECL}\n<table xmlns="${NS_SSML}" id="1" name="PHQ_QueryResults" ` +
    `displayName="PHQ_QueryResults" ref="${table.ref}" totalsRowShown="0" headerRowCount="1">` +
    `<autoFilter ref="${table.ref}"/>` +
    `<tableColumns count="${table.columns.length}">${columns}</tableColumns>` +
    `<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" ` +
    `showRowStripes="1" showColumnStripes="0"/>` +
    `</table>`
  );
}

function buildDrawingXml(chart: ChartSpec): string {
  return (
    `${XML_DECL}\n<xdr:wsDr xmlns:xdr="${NS_SSDRAW}" xmlns:a="${NS_DML}">` +
    `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${chart.from.col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${chart.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${chart.to.col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${chart.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro="">` +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_CHART}">` +
    `<c:chart xmlns:c="${NS_CHART}" xmlns:r="${NS_REL}" r:id="rId1"/>` +
    `</a:graphicData></a:graphic></xdr:graphicFrame>` +
    `<xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`
  );
}

/** A single-series horizontal bar chart, styled to look like Excel's own. */
function buildChartXml(chart: ChartSpec): string {
  const CAT_AX = "811110001";
  const VAL_AX = "811110002";
  const catPts = chart.cats
    .map((c, i) => `<c:pt idx="${i}"><c:v>${esc(c)}</c:v></c:pt>`)
    .join("");
  const valPts = chart.vals
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("");
  const axisText =
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">` +
    `<a:solidFill><a:srgbClr val="${MUTED}"/></a:solidFill></a:defRPr></a:pPr>` +
    `<a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

  return (
    `${XML_DECL}\n<c:chartSpace xmlns:c="${NS_CHART}" xmlns:a="${NS_DML}" xmlns:r="${NS_REL}">` +
    `<c:roundedCorners val="0"/>` +
    `<c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1">` +
    `<a:solidFill><a:srgbClr val="${INK}"/></a:solidFill></a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="en-US" sz="1100" b="1"/><a:t>${esc(chart.title)}</a:t></a:r>` +
    `</a:p></c:rich></c:tx><c:overlay val="0"/>` +
    `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:title>` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    `<c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:tx><c:strRef><c:f>${esc(chart.seriesRef)}</c:f><c:strCache><c:ptCount val="1"/>` +
    `<c:pt idx="0"><c:v>${esc(chart.seriesName)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
    `<c:spPr><a:solidFill><a:srgbClr val="${SERIES_FILL}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:invertIfNegative val="0"/>` +
    `<c:cat><c:strRef><c:f>${esc(chart.catRef)}</c:f><c:strCache>` +
    `<c:ptCount val="${chart.cats.length}"/>${catPts}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${esc(chart.valRef)}</c:f><c:numCache>` +
    `<c:formatCode>${esc(chart.numFmt)}</c:formatCode>` +
    `<c:ptCount val="${chart.vals.length}"/>${valPts}</c:numCache></c:numRef></c:val>` +
    `</c:ser>` +
    `<c:gapWidth val="60"/>` +
    `<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/>` +
    `</c:barChart>` +
    // Categories inverted so the largest bar sits at the top; the value axis
    // then crosses at the category maximum, which keeps it along the bottom.
    `<c:catAx><c:axId val="${CAT_AX}"/><c:scaling><c:orientation val="maxMin"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="l"/>` +
    `<c:numFmt formatCode="General" sourceLinked="1"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr>` +
    axisText +
    `<c:crossAx val="${VAL_AX}"/><c:crosses val="autoZero"/><c:auto val="1"/>` +
    `<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${VAL_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="b"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="${esc(chart.axisFmt)}" sourceLinked="0"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    axisText +
    `<c:crossAx val="${CAT_AX}"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>` +
    `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>` +
    `</c:plotArea>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>` +
    `</c:chartSpace>`
  );
}

function relsXml(entries: Array<{ id: string; type: string; target: string }>): string {
  const items = entries
    .map((e) => `<Relationship Id="${e.id}" Type="${e.type}" Target="${e.target}"/>`)
    .join("");
  return (
    `${XML_DECL}\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${items}</Relationships>`
  );
}

/**
 * Re-open the package SheetJS produced and add the parts it cannot write.
 * Element order matters: in CT_Worksheet, `drawing` and `tableParts` are the
 * last children, in that order, which is why both are spliced in at the end.
 */
function injectOoxmlParts(buffer: Uint8Array, opts: InjectOptions): Uint8Array {
  const files = unzipSync(buffer);
  const read = (path: string) => strFromU8(files[path]);
  const write = (path: string, xml: string) => {
    files[path] = strToU8(xml);
  };

  // --- sheet views: freeze panes, gridlines, active tab ---
  for (const view of opts.views) {
    const path = sheetPart(view.sheetIndex);
    if (!files[path]) continue;
    let xml = read(path);
    const attrs = [
      view.tabSelected ? 'tabSelected="1"' : "",
      view.gridLines === false ? 'showGridLines="0"' : "",
      'workbookViewId="0"',
    ]
      .filter(Boolean)
      .join(" ");
    let pane = "";
    if (view.freezeRows) {
      const top = `A${view.freezeRows + 1}`;
      pane =
        `<pane ySplit="${view.freezeRows}" topLeftCell="${top}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="${top}" sqref="${top}"/>`;
    }
    const replacement = `<sheetViews><sheetView ${attrs}>${pane}</sheetView></sheetViews>`;
    xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, replacement);
    write(path, xml);
  }

  const contentTypes: string[] = [];

  // --- Excel table (ListObject) ---
  if (opts.table) {
    const path = sheetPart(opts.table.sheetIndex);
    if (files[path]) {
      write("xl/tables/table1.xml", buildTableXml(opts.table));
      write(
        `xl/worksheets/_rels/sheet${opts.table.sheetIndex + 1}.xml.rels`,
        relsXml([
          {
            id: "rId1",
            type: `${NS_REL}/table`,
            target: "../tables/table1.xml",
          },
        ]),
      );
      write(
        path,
        read(path).replace(
          "</worksheet>",
          '<tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>',
        ),
      );
      contentTypes.push(
        '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>',
      );
    }
  }

  // --- chart + its drawing ---
  if (opts.chart) {
    const path = sheetPart(opts.chart.sheetIndex);
    if (files[path]) {
      write("xl/charts/chart1.xml", buildChartXml(opts.chart));
      write("xl/drawings/drawing1.xml", buildDrawingXml(opts.chart));
      write(
        "xl/drawings/_rels/drawing1.xml.rels",
        relsXml([
          { id: "rId1", type: `${NS_REL}/chart`, target: "../charts/chart1.xml" },
        ]),
      );
      write(
        `xl/worksheets/_rels/sheet${opts.chart.sheetIndex + 1}.xml.rels`,
        relsXml([
          { id: "rId1", type: `${NS_REL}/drawing`, target: "../drawings/drawing1.xml" },
        ]),
      );
      write(
        path,
        read(path).replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>'),
      );
      contentTypes.push(
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>',
        '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
      );
    }
  }

  if (contentTypes.length) {
    write(
      "[Content_Types].xml",
      read("[Content_Types].xml").replace("</Types>", `${contentTypes.join("")}</Types>`),
    );
  }

  // Formula cells are written without a cached result, so ask Excel to
  // calculate on open rather than showing blanks until the first edit.
  if (files["xl/workbook.xml"]) {
    const wb = read("xl/workbook.xml");
    if (!wb.includes("<calcPr")) {
      write(
        "xl/workbook.xml",
        wb.replace("</workbook>", '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'),
      );
    }
  }

  return zipSync(files, { level: 6 });
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Exposed for tests; returns the finished package bytes. */
export function buildExcelWorkbook(
  results: ExecuteQueryResponse,
  context: ExcelExportContext,
  now: Date = new Date(),
): Uint8Array {
  const exportedLabel = now.toLocaleString(undefined, {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  const cols = analyseColumns(results);
  const { ws: resultsWs, table } = buildResultsSheet(
    results, cols, context.question, exportedLabel,
  );
  const infoWs = buildInfoSheet(results, context, exportedLabel);
  const { ws: summaryWs, chart } = buildSummarySheet(results, cols);

  const workbook = XLSX.utils.book_new();
  // Query Results is appended first, which is also what makes it the sheet
  // Excel opens on.
  XLSX.utils.book_append_sheet(workbook, resultsWs, SHEET_RESULTS);
  XLSX.utils.book_append_sheet(workbook, infoWs, SHEET_INFO);
  XLSX.utils.book_append_sheet(workbook, summaryWs, SHEET_SUMMARY);

  const raw = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  }) as ArrayBuffer;

  return injectOoxmlParts(new Uint8Array(raw), {
    views: [
      { sheetIndex: 0, freezeRows: HEADER_ROW, tabSelected: true },
      { sheetIndex: 1, gridLines: false },
      { sheetIndex: 2, gridLines: false },
    ],
    table,
    chart,
  });
}

export function exportToExcel(
  results: ExecuteQueryResponse,
  context: ExcelExportContext,
  filename = "query_results.xlsx",
) {
  const bytes = buildExcelWorkbook(results, context);
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}
