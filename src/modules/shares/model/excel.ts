// Render a model into a live .xlsx: assumptions are editable input cells and the
// three statements are real Excel formulas referencing them, so the downloaded
// workbook recalculates when you change an input. Cell `result` values are
// pre-filled from the engine so the file shows numbers before Excel recalcs.
//
// exceljs is dynamically imported so it only loads when a model is generated.
import { buildModel, type ModelAssumptions, type ModelOutput } from "./engine";

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

// Assumptions sheet: each input on its own row, value in column B.
const A = (row: number) => `Assumptions!$B$${row}`;
const ASSUMPTIONS: { label: string; value: (a: ModelAssumptions) => number; pct?: boolean }[] = [
  { label: "Start year", value: (a) => a.startYear }, // row 1
  { label: "Base revenue", value: (a) => a.baseRevenue }, // 2
  { label: "Revenue growth", value: (a) => a.revenueGrowth, pct: true }, // 3
  { label: "Gross margin", value: (a) => a.grossMargin, pct: true }, // 4
  { label: "Operating expenses % of revenue", value: (a) => a.opexPctRevenue, pct: true }, // 5
  { label: "D&A % of revenue", value: (a) => a.daPctRevenue, pct: true }, // 6
  { label: "Tax rate", value: (a) => a.taxRate, pct: true }, // 7
  { label: "Capex % of revenue", value: (a) => a.capexPctRevenue, pct: true }, // 8
  { label: "Receivable days (DSO)", value: (a) => a.dso }, // 9
  { label: "Inventory days (DIO)", value: (a) => a.dio }, // 10
  { label: "Payable days (DPO)", value: (a) => a.dpo }, // 11
  { label: "Interest rate on debt", value: (a) => a.interestRate, pct: true }, // 12
  { label: "Dividend payout", value: (a) => a.dividendPayout, pct: true }, // 13
  { label: "Starting cash", value: (a) => a.startingCash }, // 14
  { label: "Starting PP&E", value: (a) => a.startingPpe }, // 15
  { label: "Starting debt", value: (a) => a.startingDebt }, // 16
];

// Model sheet row numbers.
const R = {
  revenue: 4,
  cogs: 5,
  gross: 6,
  opex: 7,
  da: 8,
  ebit: 9,
  interest: 10,
  pretax: 11,
  tax: 12,
  ni: 13,
  cash: 15,
  ar: 16,
  inv: 17,
  ppe: 18,
  totalAssets: 19,
  ap: 20,
  debt: 21,
  totalLiab: 22,
  equity: 23,
  totalLE: 24,
  check: 25,
  cfNi: 27,
  cfDa: 28,
  cfNwc: 29,
  cfo: 30,
  capex: 31,
  cfi: 32,
  div: 33,
  cff: 34,
  netChange: 35,
  endCash: 36,
} as const;

interface RowDef {
  r: number;
  results: (m: ModelOutput) => number[];
  cf?: boolean; // cash-flow rows have no base-year column
  base?: (L: string) => string;
  fc: (L: string, P: string) => string;
}

const ROWS: RowDef[] = [
  { r: R.revenue, results: (m) => m.revenue, base: () => `=${A(2)}`, fc: (_L, P) => `=${P}${R.revenue}*(1+${A(3)})` },
  { r: R.cogs, results: (m) => m.cogs, base: (L) => `=${L}${R.revenue}*(1-${A(4)})`, fc: (L) => `=${L}${R.revenue}*(1-${A(4)})` },
  { r: R.gross, results: (m) => m.grossProfit, base: (L) => `=${L}${R.revenue}-${L}${R.cogs}`, fc: (L) => `=${L}${R.revenue}-${L}${R.cogs}` },
  { r: R.opex, results: (m) => m.opex, base: (L) => `=${L}${R.revenue}*${A(5)}`, fc: (L) => `=${L}${R.revenue}*${A(5)}` },
  { r: R.da, results: (m) => m.da, base: (L) => `=${L}${R.revenue}*${A(6)}`, fc: (L) => `=${L}${R.revenue}*${A(6)}` },
  { r: R.ebit, results: (m) => m.ebit, base: (L) => `=${L}${R.gross}-${L}${R.opex}-${L}${R.da}`, fc: (L) => `=${L}${R.gross}-${L}${R.opex}-${L}${R.da}` },
  { r: R.interest, results: (m) => m.interest, base: () => `=0`, fc: (_L, P) => `=${P}${R.debt}*${A(12)}` },
  { r: R.pretax, results: (m) => m.pretax, base: (L) => `=${L}${R.ebit}-${L}${R.interest}`, fc: (L) => `=${L}${R.ebit}-${L}${R.interest}` },
  { r: R.tax, results: (m) => m.tax, base: (L) => `=MAX(0,${L}${R.pretax}*${A(7)})`, fc: (L) => `=MAX(0,${L}${R.pretax}*${A(7)})` },
  { r: R.ni, results: (m) => m.netIncome, base: (L) => `=${L}${R.pretax}-${L}${R.tax}`, fc: (L) => `=${L}${R.pretax}-${L}${R.tax}` },

  { r: R.cash, results: (m) => m.cash, base: () => `=${A(14)}`, fc: (L, P) => `=${P}${R.cash}+${L}${R.netChange}` },
  { r: R.ar, results: (m) => m.receivables, base: (L) => `=${A(9)}/365*${L}${R.revenue}`, fc: (L) => `=${A(9)}/365*${L}${R.revenue}` },
  { r: R.inv, results: (m) => m.inventory, base: (L) => `=${A(10)}/365*${L}${R.cogs}`, fc: (L) => `=${A(10)}/365*${L}${R.cogs}` },
  { r: R.ppe, results: (m) => m.ppe, base: () => `=${A(15)}`, fc: (L, P) => `=${P}${R.ppe}-${L}${R.capex}-${L}${R.da}` },
  { r: R.totalAssets, results: (m) => m.totalAssets, base: (L) => `=SUM(${L}${R.cash}:${L}${R.ppe})`, fc: (L) => `=SUM(${L}${R.cash}:${L}${R.ppe})` },
  { r: R.ap, results: (m) => m.payables, base: (L) => `=${A(11)}/365*${L}${R.cogs}`, fc: (L) => `=${A(11)}/365*${L}${R.cogs}` },
  { r: R.debt, results: (m) => m.debt, base: () => `=${A(16)}`, fc: (_L, P) => `=${P}${R.debt}` },
  { r: R.totalLiab, results: (m) => m.totalLiabilities, base: (L) => `=${L}${R.ap}+${L}${R.debt}`, fc: (L) => `=${L}${R.ap}+${L}${R.debt}` },
  { r: R.equity, results: (m) => m.equity, base: (L) => `=${L}${R.totalAssets}-${L}${R.totalLiab}`, fc: (L, P) => `=${P}${R.equity}+${L}${R.ni}+${L}${R.div}` },
  { r: R.totalLE, results: (m) => m.totalLiabEquity, base: (L) => `=${L}${R.totalLiab}+${L}${R.equity}`, fc: (L) => `=${L}${R.totalLiab}+${L}${R.equity}` },
  { r: R.check, results: (m) => m.balanceCheck, base: (L) => `=${L}${R.totalAssets}-${L}${R.totalLE}`, fc: (L) => `=${L}${R.totalAssets}-${L}${R.totalLE}` },

  { r: R.cfNi, results: (m) => m.netIncome, cf: true, fc: (L) => `=${L}${R.ni}` },
  { r: R.cfDa, results: (m) => m.da, cf: true, fc: (L) => `=${L}${R.da}` },
  { r: R.cfNwc, results: (m) => m.changeInNwc.map((v) => -v), cf: true, fc: (L, P) => `=-((${L}${R.ar}+${L}${R.inv}-${L}${R.ap})-(${P}${R.ar}+${P}${R.inv}-${P}${R.ap}))` },
  { r: R.cfo, results: (m) => m.cfo, cf: true, fc: (L) => `=${L}${R.cfNi}+${L}${R.cfDa}+${L}${R.cfNwc}` },
  { r: R.capex, results: (m) => m.capex.map((v) => -v), cf: true, fc: (L) => `=-(${L}${R.revenue}*${A(8)})` },
  { r: R.cfi, results: (m) => m.cfi, cf: true, fc: (L) => `=${L}${R.capex}` },
  { r: R.div, results: (m) => m.dividends.map((v) => -v), cf: true, fc: (L) => `=-MAX(0,${L}${R.ni})*${A(13)}` },
  { r: R.cff, results: (m) => m.cff, cf: true, fc: (L) => `=${L}${R.div}` },
  { r: R.netChange, results: (m) => m.netChangeInCash, cf: true, fc: (L) => `=${L}${R.cfo}+${L}${R.cfi}+${L}${R.cff}` },
  { r: R.endCash, results: (m) => m.cash, cf: true, fc: (L, P) => `=${P}${R.cash}+${L}${R.netChange}` },
];

const LABELS: Record<number, string> = {
  [R.revenue]: "Revenue",
  [R.cogs]: "Cost of goods sold",
  [R.gross]: "Gross profit",
  [R.opex]: "Operating expenses",
  [R.da]: "Depreciation & amortisation",
  [R.ebit]: "EBIT",
  [R.interest]: "Interest expense",
  [R.pretax]: "Pre-tax income",
  [R.tax]: "Tax",
  [R.ni]: "Net income",
  [R.cash]: "Cash",
  [R.ar]: "Accounts receivable",
  [R.inv]: "Inventory",
  [R.ppe]: "Property, plant & equipment",
  [R.totalAssets]: "Total assets",
  [R.ap]: "Accounts payable",
  [R.debt]: "Debt",
  [R.totalLiab]: "Total liabilities",
  [R.equity]: "Equity",
  [R.totalLE]: "Total liabilities & equity",
  [R.check]: "Balance check",
  [R.cfNi]: "Net income",
  [R.cfDa]: "Depreciation & amortisation",
  [R.cfNwc]: "Change in working capital",
  [R.cfo]: "Cash from operations",
  [R.capex]: "Capital expenditure",
  [R.cfi]: "Cash from investing",
  [R.div]: "Dividends",
  [R.cff]: "Cash from financing",
  [R.netChange]: "Net change in cash",
  [R.endCash]: "Ending cash",
};

const SUBTOTAL_ROWS = new Set<number>([
  R.gross, R.ebit, R.ni, R.totalAssets, R.totalLiab, R.totalLE,
  R.cfo, R.cfi, R.cff, R.netChange, R.endCash,
]);

export async function buildWorkbookBlob(ticker: string, a: ModelAssumptions): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const m = buildModel(a);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gym Tracker — Shares";
  wb.created = new Date();

  // --- Assumptions sheet ---
  const asx = wb.addWorksheet("Assumptions");
  asx.getColumn(1).width = 32;
  asx.getColumn(2).width = 16;
  ASSUMPTIONS.forEach((row, i) => {
    const r = i + 1;
    asx.getCell(`A${r}`).value = row.label;
    const cell = asx.getCell(`B${r}`);
    cell.value = row.value(a);
    if (row.pct) cell.numFmt = "0.0%";
    else if (r !== 1) cell.numFmt = "#,##0";
    cell.font = { color: { argb: "FF1D4ED8" } }; // inputs in blue, model convention
  });

  // --- Model sheet ---
  const ws = wb.addWorksheet("Model");
  ws.getColumn(1).width = 30;
  const cols = m.years.length; // base + forecast years
  for (let t = 0; t < cols; t++) ws.getColumn(2 + t).width = 14;

  ws.getCell("A1").value = `${ticker} — 3-statement model`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  // Year headers reference the start-year assumption so they shift with it.
  for (let t = 0; t < cols; t++) {
    const c = col(2 + t);
    const cell = ws.getCell(`${c}${2}`);
    cell.value = { formula: `${A(1)}+${t}`, result: m.years[t] };
    cell.font = { bold: true };
    cell.alignment = { horizontal: "right" };
  }

  ws.getCell("A3").value = "INCOME STATEMENT";
  ws.getCell("A14").value = "BALANCE SHEET";
  ws.getCell("A26").value = "CASH FLOW";
  for (const hr of [3, 14, 26]) ws.getCell(`A${hr}`).font = { bold: true, color: { argb: "FF6B7280" } };

  for (const def of ROWS) {
    ws.getCell(`A${def.r}`).value = LABELS[def.r];
    if (SUBTOTAL_ROWS.has(def.r)) ws.getCell(`A${def.r}`).font = { bold: true };
    const results = def.results(m);
    for (let t = 0; t < cols; t++) {
      const L = col(2 + t);
      const P = col(1 + t);
      const cell = ws.getCell(`${L}${def.r}`);
      if (def.cf && t === 0) continue; // base year has no cash-flow column
      const formula = t === 0 ? def.base?.(L) : def.fc(L, P);
      if (!formula) continue;
      cell.value = { formula: formula.slice(1), result: round(results[t]) };
      cell.numFmt = "#,##0;(#,##0)";
      if (SUBTOTAL_ROWS.has(def.r)) cell.font = { bold: true };
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
