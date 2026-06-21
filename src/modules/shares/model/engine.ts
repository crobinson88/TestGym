// Deterministic 3-statement model. Assumptions in, fully-linked income
// statement / balance sheet / cash-flow out. The engine owns the arithmetic
// (LLMs don't); the Excel writer mirrors the same logic as live formulas so a
// downloaded workbook recalculates identically.
//
// Revenue and one profit line are forecast per business segment, then summed to
// a consolidated P&L. Because companies disclose different lines, the basis is
// chosen once for the whole model: Gross Profit, EBIT, or EBITDA. Everything
// below that line (tax, D&A, capex, working capital, balance sheet) stays
// consolidated. D&A is always an input — it bridges EBITDA↔EBIT and is the
// cash-flow add-back.
//
// Index 0 is the base ("year 0") column — its balance sheet is the opening
// position and equity is the balancing plug, so the sheet ties out every year.

export type ForecastBasis = "gross_profit" | "ebit" | "ebitda";

export interface Segment {
  name: string;
  baseRevenue: number;
  revenueGrowth: number; // applied each forecast year
  margin: number; // margin on the chosen basis (decimal)
}

export interface ModelAssumptions {
  startYear: number;
  years: number; // forecast years after the base year
  basis: ForecastBasis;
  segments: Segment[];
  opexPctRevenue: number; // operating expenses (ex-D&A) / revenue — Gross Profit basis only
  daPctRevenue: number; // depreciation & amortisation / revenue
  taxRate: number;
  capexPctRevenue: number;
  dso: number; // receivable days (on revenue)
  dio: number; // inventory days (on COGS, or revenue when COGS isn't modelled)
  dpo: number; // payable days (on COGS, or revenue when COGS isn't modelled)
  interestRate: number; // on beginning-of-year debt
  dividendPayout: number; // share of positive net income paid out
  startingCash: number;
  startingPpe: number;
  startingDebt: number;
}

export interface ModelOutput {
  basis: ForecastBasis;
  segmentNames: string[];
  years: number[]; // calendar years, length = assumptions.years + 1
  // Segment build-up
  segmentRevenue: number[][]; // [segment][year]
  segmentProfit: number[][]; // [segment][year], on the chosen basis
  basisProfit: number[]; // consolidated total of the chosen profit line
  // Income statement
  revenue: number[];
  cogs: number[]; // 0 outside Gross Profit basis
  grossProfit: number[]; // 0 outside Gross Profit basis
  opex: number[]; // 0 outside Gross Profit basis
  ebitda: number[];
  da: number[];
  ebit: number[];
  interest: number[];
  pretax: number[];
  tax: number[];
  netIncome: number[];
  // Balance sheet
  cash: number[];
  receivables: number[];
  inventory: number[];
  ppe: number[];
  totalAssets: number[];
  payables: number[];
  debt: number[];
  totalLiabilities: number[];
  equity: number[];
  totalLiabEquity: number[];
  balanceCheck: number[]; // assets − (liabilities + equity); ~0 when consistent
  // Cash flow (forecast years; base year is 0)
  capex: number[];
  dividends: number[];
  changeInNwc: number[];
  cfo: number[];
  cfi: number[];
  cff: number[];
  netChangeInCash: number[];
}

export const BASES: { value: ForecastBasis; label: string; marginLabel: string }[] = [
  { value: "gross_profit", label: "Gross Profit", marginLabel: "Gross margin" },
  { value: "ebitda", label: "EBITDA", marginLabel: "EBITDA margin" },
  { value: "ebit", label: "EBIT", marginLabel: "EBIT margin" },
];

export function basisLabel(b: ForecastBasis): string {
  return BASES.find((x) => x.value === b)?.label ?? b;
}

export function marginLabel(b: ForecastBasis): string {
  return BASES.find((x) => x.value === b)?.marginLabel ?? "Margin";
}

export function defaultSegment(name = "Consolidated", baseRevenue = 1_000_000): Segment {
  return { name, baseRevenue, revenueGrowth: 0.1, margin: 0.55 };
}

export function defaultAssumptions(): ModelAssumptions {
  return {
    startYear: new Date().getFullYear(),
    years: 5,
    basis: "gross_profit",
    segments: [defaultSegment()],
    opexPctRevenue: 0.3,
    daPctRevenue: 0.05,
    taxRate: 0.21,
    capexPctRevenue: 0.06,
    dso: 45,
    dio: 60,
    dpo: 40,
    interestRate: 0.06,
    dividendPayout: 0,
    startingCash: 250_000,
    startingPpe: 500_000,
    startingDebt: 0,
  };
}

const DAYS = 365;

export function buildModel(a: ModelAssumptions): ModelOutput {
  const n = Math.max(0, Math.floor(a.years)) + 1; // include base year
  const segs = a.segments.length > 0 ? a.segments : [defaultSegment()];
  const z = () => Array<number>(n).fill(0);

  const years = Array.from({ length: n }, (_, t) => a.startYear + t);

  // Segment build-up → consolidated revenue and the chosen profit line.
  const segmentRevenue = segs.map((s) =>
    Array.from({ length: n }, (_, t) => s.baseRevenue * (1 + s.revenueGrowth) ** t),
  );
  const segmentProfit = segs.map((s, i) => segmentRevenue[i].map((r) => r * s.margin));
  const revenue = Array.from({ length: n }, (_, t) =>
    segmentRevenue.reduce((sum, sr) => sum + sr[t], 0),
  );
  const basisProfit = Array.from({ length: n }, (_, t) =>
    segmentProfit.reduce((sum, sp) => sum + sp[t], 0),
  );

  const cogs = z();
  const grossProfit = z();
  const opex = z();
  const ebitda = z();
  const da = z();
  const ebit = z();
  const interest = z();
  const pretax = z();
  const tax = z();
  const netIncome = z();
  const cash = z();
  const receivables = z();
  const inventory = z();
  const ppe = z();
  const totalAssets = z();
  const payables = z();
  const debt = z();
  const totalLiabilities = z();
  const equity = z();
  const totalLiabEquity = z();
  const balanceCheck = z();
  const capex = z();
  const dividends = z();
  const changeInNwc = z();
  const cfo = z();
  const cfi = z();
  const cff = z();
  const netChangeInCash = z();

  for (let t = 0; t < n; t++) {
    da[t] = revenue[t] * a.daPctRevenue;

    if (a.basis === "gross_profit") {
      grossProfit[t] = basisProfit[t];
      cogs[t] = revenue[t] - grossProfit[t];
      opex[t] = revenue[t] * a.opexPctRevenue;
      ebitda[t] = grossProfit[t] - opex[t];
      ebit[t] = ebitda[t] - da[t];
    } else if (a.basis === "ebitda") {
      ebitda[t] = basisProfit[t];
      ebit[t] = ebitda[t] - da[t];
    } else {
      ebit[t] = basisProfit[t];
      ebitda[t] = ebit[t] + da[t];
    }

    debt[t] = a.startingDebt; // flat debt schedule in v1
    interest[t] = t === 0 ? 0 : debt[t - 1] * a.interestRate;
    pretax[t] = ebit[t] - interest[t];
    tax[t] = Math.max(0, pretax[t] * a.taxRate);
    netIncome[t] = pretax[t] - tax[t];

    // Inventory/payable days sit on COGS where we model it, else on revenue.
    const wcBase = a.basis === "gross_profit" ? cogs[t] : revenue[t];
    receivables[t] = (a.dso / DAYS) * revenue[t];
    inventory[t] = (a.dio / DAYS) * wcBase;
    payables[t] = (a.dpo / DAYS) * wcBase;

    if (t === 0) {
      cash[0] = a.startingCash;
      ppe[0] = a.startingPpe;
    } else {
      capex[t] = revenue[t] * a.capexPctRevenue;
      ppe[t] = ppe[t - 1] + capex[t] - da[t];
      dividends[t] = Math.max(0, netIncome[t]) * a.dividendPayout;
      const nwc = receivables[t] + inventory[t] - payables[t];
      const prevNwc = receivables[t - 1] + inventory[t - 1] - payables[t - 1];
      changeInNwc[t] = nwc - prevNwc;
      cfo[t] = netIncome[t] + da[t] - changeInNwc[t];
      cfi[t] = -capex[t];
      cff[t] = -dividends[t]; // debt flat ⇒ no financing flow from debt
      netChangeInCash[t] = cfo[t] + cfi[t] + cff[t];
      cash[t] = cash[t - 1] + netChangeInCash[t];
    }

    totalAssets[t] = cash[t] + receivables[t] + inventory[t] + ppe[t];
    totalLiabilities[t] = payables[t] + debt[t];
    equity[t] =
      t === 0
        ? totalAssets[0] - totalLiabilities[0] // opening equity is the plug
        : equity[t - 1] + netIncome[t] - dividends[t];
    totalLiabEquity[t] = totalLiabilities[t] + equity[t];
    balanceCheck[t] = totalAssets[t] - totalLiabEquity[t];
  }

  return {
    basis: a.basis,
    segmentNames: segs.map((s) => s.name),
    years,
    segmentRevenue,
    segmentProfit,
    basisProfit,
    revenue,
    cogs,
    grossProfit,
    opex,
    ebitda,
    da,
    ebit,
    interest,
    pretax,
    tax,
    netIncome,
    cash,
    receivables,
    inventory,
    ppe,
    totalAssets,
    payables,
    debt,
    totalLiabilities,
    equity,
    totalLiabEquity,
    balanceCheck,
    capex,
    dividends,
    changeInNwc,
    cfo,
    cfi,
    cff,
    netChangeInCash,
  };
}

export interface StatementRow {
  label: string;
  values: number[];
  emphasis?: boolean; // subtotal / total
  check?: boolean; // balance-check row
}

export interface Statement {
  title: string;
  rows: StatementRow[];
}

// Shape the output into preview statements. The income statement layout depends
// on the basis; segment blocks appear only when there's more than one segment.
export function toStatements(m: ModelOutput): Statement[] {
  const out: Statement[] = [];
  const label = basisLabel(m.basis);

  if (m.segmentNames.length > 1) {
    out.push({
      title: "Revenue by segment",
      rows: [
        ...m.segmentNames.map((name, i) => ({ label: name, values: m.segmentRevenue[i] })),
        { label: "Total revenue", values: m.revenue, emphasis: true },
      ],
    });
    out.push({
      title: `${label} by segment`,
      rows: [
        ...m.segmentNames.map((name, i) => ({ label: name, values: m.segmentProfit[i] })),
        { label: `Total ${label.toLowerCase()}`, values: m.basisProfit, emphasis: true },
      ],
    });
  }

  const is: StatementRow[] = [{ label: "Revenue", values: m.revenue, emphasis: true }];
  if (m.basis === "gross_profit") {
    is.push({ label: "Cost of goods sold", values: m.cogs });
    is.push({ label: "Gross profit", values: m.grossProfit, emphasis: true });
    is.push({ label: "Operating expenses", values: m.opex });
    is.push({ label: "EBITDA", values: m.ebitda, emphasis: true });
    is.push({ label: "Depreciation & amortisation", values: m.da });
    is.push({ label: "EBIT", values: m.ebit, emphasis: true });
  } else if (m.basis === "ebitda") {
    is.push({ label: "EBITDA", values: m.ebitda, emphasis: true });
    is.push({ label: "Depreciation & amortisation", values: m.da });
    is.push({ label: "EBIT", values: m.ebit, emphasis: true });
  } else {
    is.push({ label: "EBITDA (memo)", values: m.ebitda, emphasis: true });
    is.push({ label: "Depreciation & amortisation", values: m.da });
    is.push({ label: "EBIT", values: m.ebit, emphasis: true });
  }
  is.push({ label: "Interest expense", values: m.interest });
  is.push({ label: "Pre-tax income", values: m.pretax });
  is.push({ label: "Tax", values: m.tax });
  is.push({ label: "Net income", values: m.netIncome, emphasis: true });
  out.push({ title: "Income statement", rows: is });

  out.push({
    title: "Balance sheet",
    rows: [
      { label: "Cash", values: m.cash },
      { label: "Accounts receivable", values: m.receivables },
      { label: "Inventory", values: m.inventory },
      { label: "Property, plant & equipment", values: m.ppe },
      { label: "Total assets", values: m.totalAssets, emphasis: true },
      { label: "Accounts payable", values: m.payables },
      { label: "Debt", values: m.debt },
      { label: "Total liabilities", values: m.totalLiabilities, emphasis: true },
      { label: "Equity", values: m.equity },
      { label: "Total liabilities & equity", values: m.totalLiabEquity, emphasis: true },
      { label: "Balance check", values: m.balanceCheck, check: true },
    ],
  });

  out.push({
    title: "Cash flow",
    rows: [
      { label: "Net income", values: m.netIncome },
      { label: "Depreciation & amortisation", values: m.da },
      { label: "Change in working capital", values: m.changeInNwc.map((v) => -v) },
      { label: "Cash from operations", values: m.cfo, emphasis: true },
      { label: "Capital expenditure", values: m.capex.map((v) => -v) },
      { label: "Cash from investing", values: m.cfi, emphasis: true },
      { label: "Dividends", values: m.dividends.map((v) => -v) },
      { label: "Cash from financing", values: m.cff, emphasis: true },
      { label: "Net change in cash", values: m.netChangeInCash, emphasis: true },
      { label: "Ending cash", values: m.cash, emphasis: true },
    ],
  });

  return out;
}
