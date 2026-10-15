import { format, formatDistanceStrict, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { Cents } from "@/lib/domain/types";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurRound = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurCompact = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("fr-FR");

/** Formate un montant en centimes : `1245000` → `12 450,00 €`. */
export function formatEUR(cents: Cents | null | undefined, opts: { compact?: boolean; round?: boolean; sign?: boolean } = {}): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  const euros = cents / 100;
  const body = opts.compact ? eurCompact.format(euros) : opts.round ? eurRound.format(euros) : eur.format(euros);
  return opts.sign && cents > 0 ? `+${body}` : body;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

export function formatInt(value: number): string {
  return num.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1, sign = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const body = `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} %`;
  return sign && value > 0 ? `+${body}` : body;
}

export function formatDate(value: string | null | undefined, pattern = "dd/MM/yyyy"): string {
  if (!value) return "—";
  return format(parseISO(value), pattern, { locale: fr });
}

export function formatDateLong(value: string | null | undefined): string {
  return formatDate(value, "EEEE d MMMM yyyy");
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, "dd/MM/yyyy HH:mm");
}

export function formatMonth(key: string, short = true): string {
  return format(parseISO(`${key}-01`), short ? "MMM yy" : "MMMM yyyy", { locale: fr });
}

export function formatRelative(value: string, now: Date = new Date()): string {
  return `il y a ${formatDistanceStrict(parseISO(value), now, { locale: fr })}`;
}

/** Délai relatif à une date du jour ISO : « dans 3 j », « aujourd'hui », « il y a 5 j ». */
export function formatDueIn(date: string | null | undefined, today: string): string {
  if (!date) return "—";
  const diff = Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 86_400_000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === -1) return "hier";
  return diff > 0 ? `dans ${diff} j` : `il y a ${-diff} j`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Formate une quantité décimale à la française. */
export function formatQuantity(q: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(q);
}

export function formatVat(rate: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(rate / 100)} %`;
}

export function formatXp(xp: number): string {
  return `${num.format(xp)} XP`;
}
