import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(value: number | null | undefined): string {
  if (value == null || isNaN(Number(value))) return '0 kr';
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} msek`;
  if (abs >= 1_000_000)  return `${(n / 1_000_000).toFixed(2).replace('.', ',')} msek`;
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}
