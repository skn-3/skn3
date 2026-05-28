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

/**
 * Combine an address and city for display. If the address already ends with
 * (or contains) the city name, the city is not appended again.
 */
export function formatAddressWithCity(
  address: string | null | undefined,
  city: string | null | undefined
): string {
  const a = (address || '').trim();
  const c = (city || '').trim();
  if (!a) return c;
  if (!c) return a;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nc = norm(c);
  // Already contains city as a separate token (end or comma-separated)
  if (na === nc) return a;
  if (na.endsWith(`, ${nc}`) || na.endsWith(` ${nc}`) || na.endsWith(nc)) {
    // Only suppress if it's a word boundary match at the end
    const tail = na.slice(-nc.length);
    if (tail === nc) return a;
  }
  if (na.includes(`, ${nc}`) || na.includes(` ${nc} `) || na.includes(` ${nc},`)) return a;
  return `${a}, ${c}`;
}

/**
 * Prevents Drawer/Sheet/Dialog from closing when user interacts with content
 * rendered inside a Radix portal (Select, Popover, DropdownMenu, etc.).
 * Pass to onInteractOutside and onPointerDownOutside.
 */
export function ignorePopperPortal(e: Event) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (
    target.closest('[data-radix-popper-content-wrapper]') ||
    target.closest('[data-radix-select-content]') ||
    target.closest('[data-radix-popover-content]') ||
    target.closest('[data-radix-dropdown-menu-content]') ||
    target.closest('[role="listbox"]') ||
    target.closest('[role="option"]')
  ) {
    e.preventDefault();
  }
}
