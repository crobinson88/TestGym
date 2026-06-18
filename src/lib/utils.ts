import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function todayIsoDate(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatWeight(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

// Full value with thousands separators, no K/M abbreviation and no rounding.
export function formatFull(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const PRETTY_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  return PRETTY_DATE.format(new Date(y, m - 1, d));
}

const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });

export function dayMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const month = SHORT_MONTH.format(new Date(y, m - 1, d));
  return `${String(d).padStart(2, "0")} ${month}`;
}

export function relativeDay(iso: string, today = todayIsoDate()): string {
  if (iso === today) return "today";
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const [ty, tm, td] = today.split("-").map((p) => parseInt(p, 10));
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(ty, tm - 1, td);
  const days = Math.round((b - a) / 86_400_000);
  if (days === 1) return "yesterday";
  if (days > 0 && days < 7) return `${days}d ago`;
  if (days >= 7 && days < 30) return `${Math.floor(days / 7)}w ago`;
  return prettyDate(iso);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
