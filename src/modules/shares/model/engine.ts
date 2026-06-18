// Deterministic 3-statement model. Assumptions in, fully-linked income
// statement / balance sheet / cash-flow out. The engine owns the arithmetic
// (LLMs don't); the Excel writer mirrors the same logic as live formulas so a
// downloaded workbook recalculates identically.
//
// Conventions: index 0 is the base ("year 0") column — its balance sheet is the
// opening position and equity is the balancing plug, so the sheet ties out in
// every year. Forecast years run 1..years. All rates are decimals (0.1 = 10%).

export interface ModelAssumptions {
  startYear: number;
  years: number; // forecast years after the base year
  baseRevenue: number;
  revenueGrowth: number; // applied each forecast year
  grossMargin: number; // gross profit / revenue
  opexPctRevenue: number; // operating expenses (ex-D&A) / revenue
  daPctRevenue: number; // depreciation & amortisation / revenue
  taxRate: number;
  capexPctRevenue: number;
  dso: number; // receivable days (on revenue)
  dio: number; // inventory days (on COGS)
  dpo: number; // payable days (on COGS)
  interestRate: number; // on beginning-of-year debt
  dividendPayout: number; // share of positive net income paid out
  startingCash: number;
  startingPpe: number;
  startingDebt: number;
}

export interface ModelOutput {
  years: number[]; // calendar years, length = assumptions.years + 1
  // Income statement
  revenue: number[];
  cogs: number[];
  grossProfit: number[];
  opex: number[];
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

export function defaultAssumptions(baseRevenue = 1_000_000): ModelAssumptions {
  return {
    startYear: new Date().getFullYear(),
    years: 5,
    baseRevenue,
    revenueGrowth: 0.1,
    grossMargin: 0.55,
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
  const z = () => Array<number>(n).fill(0);

  const years = Array.from({ length: n }, (_, t) => a.startYear + t);
  const revenue = z();
  const cogs = z();
  const grossProfit = z();
  const opex = z();
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
    revenue[t] = t === 0 ? a.baseRevenue : revenue[t - 1] * (1 + a.revenueGrowth);
    cogs[t] = revenue[t] * (1 - a.grossMargin);
    grossProfit[t] = revenue[t] - cogs[t];
    opex[t] = revenue[t] * a.opexPctRevenue;
    da[t] = revenue[t] * a.daPctRevenue;
    ebit[t] = grossProfit[t] - opex[t] - da[t];

    debt[t] = a.startingDebt; // flat debt schedule in v1
    interest[t] = t === 0 ? 0 : debt[t - 1] * a.interestRate;
    pretax[t] = ebit[t] - interest[t];
    tax[t] = Math.max(0, pretax[t] * a.taxRate);
    netIncome[t] = pretax[t] - tax[t];

    receivables[t] = (a.dso / DAYS) * revenue[t];
    inventory[t] = (a.dio / DAYS) * cogs[t];
    payables[t] = (a.dpo / DAYS) * cogs[t];

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
    years,
    revenue,
    cogs,
    grossProfit,
    opex,
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

// Shape the output into the three statements for on-screen preview. Row order
// here is presentational only; the Excel writer lays out its own grid.
export function toStatements(m: ModelOutput): Statement[] {
  return [
    {
      title: "Income statement",
      rows: [
        { label: "Revenue", values: m.revenue, emphasis: true },
        { label: "Cost of goods sold", values: m.cogs },
        { label: "Gross profit", values: m.grossProfit, emphasis: true },
        { label: "Operating expenses", values: m.opex },
        { label: "Depreciation & amortisation", values: m.da },
        { label: "EBIT", values: m.ebit, emphasis: true },
        { label: "Interest expense", values: m.interest },
        { label: "Pre-tax income", values: m.pretax },
        { label: "Tax", values: m.tax },
        { label: "Net income", values: m.netIncome, emphasis: true },
      ],
    },
    {
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
    },
    {
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
    },
  ];
}
