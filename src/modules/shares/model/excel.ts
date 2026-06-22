// Render a model into a live .xlsx: assumptions (scalars + a segment table) are
// editable input cells and the three statements are real Excel formulas
// referencing them, so the workbook recalculates when you change an input. Cell
// `result` values are pre-filled from the engine so the file shows numbers
// before Excel recalcs. Layout is dynamic: one row per segment, and the income
// statement varies with the chosen basis.
//
// exceljs is dynamically imported so it only loads when a model is generated.
import {
  basisLabel,
  buildModel,
  defaultSegment,
  type ModelAssumptions,
  type ModelOutput,
} from "./engine";

function col(index: number): string {
  // 1 -> A, 2 -> B, … (model data starts at column B).
  let s = "";
  let n = index;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Assumptions sheet scalar rows (value in column B).
const SC = {
  startYear: 1,
  basis: 2,
  opex: 3,
  da: 4,
  tax: 5,
  capex: 6,
  dso: 7,
  dio: 8,
  dpo: 9,
  interest: 10,
  dividend: 11,
  cash0: 12,
  ppe0: 13,
  debt0: 14,
} as const;
const SEG_HEADER_ROW = 16;
const SEG_FIRST_ROW = 17;

const S = (row: number) => `Assumptions!$B$${row}`;
const segBaseRev = (i: number) => `Assumptions!$B$${SEG_FIRST_ROW + i}`;
const segGrowth = (i: number) => `Assumptions!$C$${SEG_FIRST_ROW + i}`;
const segMargin = (i: number) => `Assumptions!$D$${SEG_FIRST_ROW + i}`;

interface Line {
  id: string;
  label: string;
  results: number[];
  emphasis?: boolean;
  cf?: boolean; // no base-year column
  check?: boolean;
}
type Item = { header: string } | { line: Line };

function isHeader(it: Item): it is { header: string } {
  return "header" in it;
}

function layout(a: ModelAssumptions, m: ModelOutput): Item[] {
  const segs = a.segments.length > 0 ? a.segments : [defaultSegment()];
  const label = basisLabel(m.basis);
  const items: Item[] = [];

  items.push({ header: "REVENUE BY SEGMENT" });
  segs.forEach((s, i) => items.push({ line: { id: `seg-rev-${i}`, label: s.name, results: m.segmentRevenue[i] } }));
  items.push({ line: { id: "total-revenue", label: "Total revenue", results: m.revenue, emphasis: true } });

  items.push({ header: `${label.toUpperCase()} BY SEGMENT` });
  segs.forEach((s, i) => items.push({ line: { id: `seg-prof-${i}`, label: s.name, results: m.segmentProfit[i] } }));
  items.push({ line: { id: "total-profit", label: `Total ${label.toLowerCase()}`, results: m.basisProfit, emphasis: true } });

  items.push({ header: "INCOME STATEMENT" });
  items.push({ line: { id: "is-revenue", label: "Revenue", results: m.revenue, emphasis: true } });
  if (m.basis === "gross_profit") {
    items.push({ line: { id: "cogs", label: "Cost of goods sold", results: m.cogs } });
    items.push({ line: { id: "gross", label: "Gross profit", results: m.grossProfit, emphasis: true } });
    items.push({ line: { id: "opex", label: "Operating expenses", results: m.opex } });
    items.push({ line: { id: "ebitda", label: "EBITDA", results: m.ebitda, emphasis: true } });
    items.push({ line: { id: "da", label: "Depreciation & amortisation", results: m.da } });
    items.push({ line: { id: "ebit", label: "EBIT", results: m.ebit, emphasis: true } });
  } else if (m.basis === "ebitda") {
    items.push({ line: { id: "ebitda", label: "EBITDA", results: m.ebitda, emphasis: true } });
    items.push({ line: { id: "da", label: "Depreciation & amortisation", results: m.da } });
    items.push({ line: { id: "ebit", label: "EBIT", results: m.ebit, emphasis: true } });
  } else {
    items.push({ line: { id: "ebitda", label: "EBITDA (memo)", results: m.ebitda, emphasis: true } });
    items.push({ line: { id: "da", label: "Depreciation & amortisation", results: m.da } });
    items.push({ line: { id: "ebit", label: "EBIT", results: m.ebit, emphasis: true } });
  }
  items.push({ line: { id: "interest", label: "Interest expense", results: m.interest } });
  items.push({ line: { id: "pretax", label: "Pre-tax income", results: m.pretax } });
  items.push({ line: { id: "tax", label: "Tax", results: m.tax } });
  items.push({ line: { id: "ni", label: "Net income", results: m.netIncome, emphasis: true } });

  items.push({ header: "BALANCE SHEET" });
  items.push({ line: { id: "cash", label: "Cash", results: m.cash } });
  items.push({ line: { id: "ar", label: "Accounts receivable", results: m.receivables } });
  items.push({ line: { id: "inv", label: "Inventory", results: m.inventory } });
  items.push({ line: { id: "ppe", label: "Property, plant & equipment", results: m.ppe } });
  items.push({ line: { id: "total-assets", label: "Total assets", results: m.totalAssets, emphasis: true } });
  items.push({ line: { id: "ap", label: "Accounts payable", results: m.payables } });
  items.push({ line: { id: "debt", label: "Debt", results: m.debt } });
  items.push({ line: { id: "total-liab", label: "Total liabilities", results: m.totalLiabilities, emphasis: true } });
  items.push({ line: { id: "equity", label: "Equity", results: m.equity } });
  items.push({ line: { id: "total-le", label: "Total liabilities & equity", results: m.totalLiabEquity, emphasis: true } });
  items.push({ line: { id: "check", label: "Balance check", results: m.balanceCheck, check: true } });

  items.push({ header: "CASH FLOW" });
  items.push({ line: { id: "cf-ni", label: "Net income", results: m.netIncome, cf: true } });
  items.push({ line: { id: "cf-da", label: "Depreciation & amortisation", results: m.da, cf: true } });
  items.push({ line: { id: "cf-nwc", label: "Change in working capital", results: m.changeInNwc.map((v) => -v), cf: true } });
  items.push({ line: { id: "cfo", label: "Cash from operations", results: m.cfo, emphasis: true, cf: true } });
  items.push({ line: { id: "capex", label: "Capital expenditure", results: m.capex.map((v) => -v), cf: true } });
  items.push({ line: { id: "cfi", label: "Cash from investing", results: m.cfi, emphasis: true, cf: true } });
  items.push({ line: { id: "div", label: "Dividends", results: m.dividends.map((v) => -v), cf: true } });
  items.push({ line: { id: "cff", label: "Cash from financing", results: m.cff, emphasis: true, cf: true } });
  items.push({ line: { id: "net-change", label: "Net change in cash", results: m.netChangeInCash, emphasis: true, cf: true } });
  items.push({ line: { id: "end-cash", label: "Ending cash", results: m.cash, emphasis: true, cf: true } });

  return items;
}

// Formula (without leading '=') for a line in column L, prior column P. Returns
// null where there's no cell (e.g. cash-flow rows in the base year).
function formula(
  id: string,
  L: string,
  P: string,
  base: boolean,
  basis: ModelAssumptions["basis"],
  R: Record<string, number>,
  segCount: number,
): string | null {
  const c = (key: string, column = L) => `${column}${R[key]}`;
  const wc = basis === "gross_profit" ? "cogs" : "is-revenue";
  const segRevFirst = R["seg-rev-0"];
  const segRevLast = R[`seg-rev-${segCount - 1}`];
  const segProfFirst = R["seg-prof-0"];
  const segProfLast = R[`seg-prof-${segCount - 1}`];

  if (id.startsWith("seg-rev-")) {
    const i = Number(id.slice("seg-rev-".length));
    return base ? segBaseRev(i) : `${P}${R[id]}*(1+${segGrowth(i)})`;
  }
  if (id.startsWith("seg-prof-")) {
    const i = Number(id.slice("seg-prof-".length));
    return `${c(`seg-rev-${i}`)}*${segMargin(i)}`;
  }
  switch (id) {
    case "total-revenue":
      return `SUM(${L}${segRevFirst}:${L}${segRevLast})`;
    case "total-profit":
      return `SUM(${L}${segProfFirst}:${L}${segProfLast})`;
    case "is-revenue":
      return `${c("total-revenue")}`;
    case "cogs":
      return `${c("is-revenue")}-${c("gross")}`;
    case "gross":
      return `${c("total-profit")}`;
    case "opex":
      return `${c("is-revenue")}*${S(SC.opex)}`;
    case "ebitda":
      if (basis === "gross_profit") return `${c("gross")}-${c("opex")}`;
      if (basis === "ebitda") return `${c("total-profit")}`;
      return `${c("ebit")}+${c("da")}`; // EBIT basis: memo
    case "da":
      return `${c("is-revenue")}*${S(SC.da)}`;
    case "ebit":
      if (basis === "ebit") return `${c("total-profit")}`;
      return `${c("ebitda")}-${c("da")}`;
    case "interest":
      return base ? "0" : `${P}${R.debt}*${S(SC.interest)}`;
    case "pretax":
      return `${c("ebit")}-${c("interest")}`;
    case "tax":
      return `MAX(0,${c("pretax")}*${S(SC.tax)})`;
    case "ni":
      return `${c("pretax")}-${c("tax")}`;
    case "cash":
      return base ? `${S(SC.cash0)}` : `${P}${R.cash}+${c("net-change")}`;
    case "ar":
      return `${S(SC.dso)}/365*${c("is-revenue")}`;
    case "inv":
      return `${S(SC.dio)}/365*${c(wc)}`;
    case "ppe":
      return base ? `${S(SC.ppe0)}` : `${P}${R.ppe}-${c("capex")}-${c("da")}`;
    case "total-assets":
      return `SUM(${c("cash")}:${c("ppe")})`;
    case "ap":
      return `${S(SC.dpo)}/365*${c(wc)}`;
    case "debt":
      return base ? `${S(SC.debt0)}` : `${P}${R.debt}`;
    case "total-liab":
      return `${c("ap")}+${c("debt")}`;
    case "equity":
      return base ? `${c("total-assets")}-${c("total-liab")}` : `${P}${R.equity}+${c("ni")}+${c("div")}`;
    case "total-le":
      return `${c("total-liab")}+${c("equity")}`;
    case "check":
      return `${c("total-assets")}-${c("total-le")}`;
    case "cf-ni":
      return `${c("ni")}`;
    case "cf-da":
      return `${c("da")}`;
    case "cf-nwc":
      return `-((${c("ar")}+${c("inv")}-${c("ap")})-(${P}${R.ar}+${P}${R.inv}-${P}${R.ap}))`;
    case "cfo":
      return `${c("cf-ni")}+${c("cf-da")}+${c("cf-nwc")}`;
    case "capex":
      return `-(${c("is-revenue")}*${S(SC.capex)})`;
    case "cfi":
      return `${c("capex")}`;
    case "div":
      return `-MAX(0,${c("ni")})*${S(SC.dividend)}`;
    case "cff":
      return `${c("div")}`;
    case "net-change":
      return `${c("cfo")}+${c("cfi")}+${c("cff")}`;
    case "end-cash":
      return `${P}${R.cash}+${c("net-change")}`;
    default:
      return null;
  }
}

export async function buildWorkbookBlob(ticker: string, a: ModelAssumptions): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const m = buildModel(a);
  const segs = a.segments.length > 0 ? a.segments : [defaultSegment()];
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gym Tracker — Shares";
  wb.created = new Date();

  // --- Assumptions sheet ---
  const asx = wb.addWorksheet("Assumptions");
  asx.getColumn(1).width = 32;
  asx.getColumn(2).width = 16;
  asx.getColumn(3).width = 12;
  asx.getColumn(4).width = 12;

  const scalar = (row: number, label: string, value: number | string, fmt?: string) => {
    asx.getCell(`A${row}`).value = label;
    const cell = asx.getCell(`B${row}`);
    cell.value = value;
    if (fmt) cell.numFmt = fmt;
    cell.font = { color: { argb: "FF1D4ED8" } }; // inputs in blue, model convention
  };
  scalar(SC.startYear, "Start year", a.startYear);
  scalar(SC.basis, "Forecast basis", basisLabel(a.basis));
  scalar(SC.opex, "Operating expenses % of revenue", a.opexPctRevenue, "0.0%");
  scalar(SC.da, "D&A % of revenue", a.daPctRevenue, "0.0%");
  scalar(SC.tax, "Tax rate", a.taxRate, "0.0%");
  scalar(SC.capex, "Capex % of revenue", a.capexPctRevenue, "0.0%");
  scalar(SC.dso, "Receivable days (DSO)", a.dso, "#,##0");
  scalar(SC.dio, "Inventory days (DIO)", a.dio, "#,##0");
  scalar(SC.dpo, "Payable days (DPO)", a.dpo, "#,##0");
  scalar(SC.interest, "Interest rate on debt", a.interestRate, "0.0%");
  scalar(SC.dividend, "Dividend payout", a.dividendPayout, "0.0%");
  scalar(SC.cash0, "Starting cash", a.startingCash, "#,##0");
  scalar(SC.ppe0, "Starting PP&E", a.startingPpe, "#,##0");
  scalar(SC.debt0, "Starting debt", a.startingDebt, "#,##0");

  const marginLbl = basisLabel(a.basis);
  asx.getCell(`A${SEG_HEADER_ROW}`).value = "Segment";
  asx.getCell(`B${SEG_HEADER_ROW}`).value = "Base revenue";
  asx.getCell(`C${SEG_HEADER_ROW}`).value = "Growth";
  asx.getCell(`D${SEG_HEADER_ROW}`).value = `${marginLbl} margin`;
  asx.getRow(SEG_HEADER_ROW).font = { bold: true };
  segs.forEach((s, i) => {
    const r = SEG_FIRST_ROW + i;
    asx.getCell(`A${r}`).value = s.name;
    for (const [colLetter, val, fmt] of [
      ["B", s.baseRevenue, "#,##0"],
      ["C", s.revenueGrowth, "0.0%"],
      ["D", s.margin, "0.0%"],
    ] as const) {
      const cell = asx.getCell(`${colLetter}${r}`);
      cell.value = val;
      cell.numFmt = fmt;
      cell.font = { color: { argb: "FF1D4ED8" } };
    }
  });

  // --- Model sheet ---
  const ws = wb.addWorksheet("Model");
  ws.getColumn(1).width = 32;
  const cols = m.years.length; // base + forecast years
  for (let t = 0; t < cols; t++) ws.getColumn(2 + t).width = 14;

  ws.getCell("A1").value = `${ticker} — 3-statement model (${basisLabel(a.basis)} basis)`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  for (let t = 0; t < cols; t++) {
    const cell = ws.getCell(`${col(2 + t)}2`);
    cell.value = { formula: `${S(SC.startYear)}+${t}`, result: m.years[t] };
    cell.font = { bold: true };
    cell.alignment = { horizontal: "right" };
  }

  // Pass 1: assign a row to every header and line.
  const items = layout(a, m);
  const R: Record<string, number> = {};
  const placed: { row: number; item: Item }[] = [];
  let cursor = 3;
  for (const it of items) {
    if (isHeader(it)) {
      placed.push({ row: cursor, item: it });
    } else {
      R[it.line.id] = cursor;
      placed.push({ row: cursor, item: it });
    }
    cursor += 1;
  }

  // Pass 2: write labels, formulas and pre-computed results.
  for (const { row, item } of placed) {
    if (isHeader(item)) {
      const cell = ws.getCell(`A${row}`);
      cell.value = item.header;
      cell.font = { bold: true, color: { argb: "FF6B7280" } };
      continue;
    }
    const ln = item.line;
    const labelCell = ws.getCell(`A${row}`);
    labelCell.value = ln.label;
    if (ln.emphasis) labelCell.font = { bold: true };
    for (let t = 0; t < cols; t++) {
      if (ln.cf && t === 0) continue; // base year has no cash-flow column
      const L = col(2 + t);
      const P = col(1 + t);
      const f = formula(ln.id, L, P, t === 0, a.basis, R, segs.length);
      if (!f) continue;
      const cell = ws.getCell(`${L}${row}`);
      cell.value = { formula: f, result: round(ln.results[t]) };
      cell.numFmt = "#,##0;(#,##0)";
      if (ln.emphasis) cell.font = { bold: true };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function modelFileName(ticker: string): string {
  return `${ticker}-3-statement-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
