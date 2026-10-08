import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Integer kobo -> "₦1,250,000" (Nigerian Naira). Decimals only when paise != 0. */
export function inr(paise: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const v = Number(paise ?? 0);
  const rupees = v / 100;
  const frac = v % 100 !== 0 || opts.decimals;
  return (
    "₦" +
    rupees.toLocaleString("en-NG", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })
  );
}

/** Compact for charts / tight spaces: ₦1.25M, ₦3.4K */
export function inrCompact(paise: number): string {
  const r = paise / 100;
  if (r >= 1e9) return `₦${(r / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (r >= 1e6) return `₦${(r / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (r >= 1e3) return `₦${(r / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `₦${Math.round(r)}`;
}

export function fmtDate(iso?: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  const date = d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length > 10 ? "Africa/Lagos" : undefined });
  if (!withTime || iso.length <= 10) return date;
  return `${date}, ${d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}`;
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function currentFY(): string {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

export function fyOptions(count = 4): string[] {
  const start = parseInt(currentFY().slice(0, 4));
  return Array.from({ length: count }, (_, i) => `${start - i}-${String(start - i + 1).slice(2)}`);
}
