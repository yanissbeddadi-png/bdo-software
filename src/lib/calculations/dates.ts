import {
  addDays as dfAddDays,
  addMonths as dfAddMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  endOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";
import type { ISODate, ISODateTime } from "@/lib/domain/types";

/** Période calendaire inclusive. */
export interface Period {
  start: ISODate;
  end: ISODate;
}

export type PeriodPreset = "month" | "last_month" | "quarter" | "year" | "last_30" | "last_90" | "last_12_months";

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  month: "Mois en cours",
  last_month: "Mois précédent",
  quarter: "Trimestre en cours",
  year: "Année en cours",
  last_30: "30 derniers jours",
  last_90: "90 derniers jours",
  last_12_months: "12 derniers mois",
};

const fmt = (d: Date): ISODate => format(d, "yyyy-MM-dd");

export function toDate(value: ISODate | ISODateTime): Date {
  return parseISO(value);
}

/** Date du jour dans le fuseau Europe/Paris, au format ISO. */
export function realTodayISO(timeZone = "Europe/Paris", at: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fmt(dfAddDays(parseISO(date), days));
}

export function addMonths(date: ISODate, months: number): ISODate {
  return fmt(dfAddMonths(parseISO(date), months));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/** Extrait la partie date d'un horodatage ISO. */
export function dateOf(value: ISODate | ISODateTime): ISODate {
  return value.slice(0, 10);
}

export function inPeriod(date: ISODate | ISODateTime | null | undefined, period: Period): boolean {
  if (!date) return false;
  const d = dateOf(date);
  return d >= period.start && d <= period.end;
}

export function monthKey(date: ISODate | ISODateTime): string {
  return date.slice(0, 7);
}

export function monthPeriod(key: string): Period {
  const start = parseISO(`${key}-01`);
  return { start: fmt(start), end: fmt(endOfMonth(start)) };
}

/** Liste des clés de mois (`yyyy-MM`) des `count` derniers mois, se terminant au mois de `today`. */
export function lastMonthKeys(today: ISODate, count: number): string[] {
  const keys: string[] = [];
  const base = startOfMonth(parseISO(today));
  for (let i = count - 1; i >= 0; i--) keys.push(format(subMonths(base, i), "yyyy-MM"));
  return keys;
}

export function nextMonthKeys(today: ISODate, count: number): string[] {
  const keys: string[] = [];
  const base = startOfMonth(parseISO(today));
  for (let i = 0; i < count; i++) keys.push(format(dfAddMonths(base, i), "yyyy-MM"));
  return keys;
}

export function monthsBetween(start: ISODate, end: ISODate): string[] {
  const keys: string[] = [];
  let cursor = startOfMonth(parseISO(start));
  const last = startOfMonth(parseISO(end));
  while (cursor <= last) {
    keys.push(format(cursor, "yyyy-MM"));
    cursor = dfAddMonths(cursor, 1);
  }
  return keys;
}

export function presetPeriod(preset: PeriodPreset, today: ISODate): Period {
  const d = parseISO(today);
  switch (preset) {
    case "month":
      return { start: fmt(startOfMonth(d)), end: fmt(endOfMonth(d)) };
    case "last_month": {
      const p = subMonths(d, 1);
      return { start: fmt(startOfMonth(p)), end: fmt(endOfMonth(p)) };
    }
    case "quarter":
      return { start: fmt(startOfQuarter(d)), end: fmt(endOfQuarter(d)) };
    case "year":
      return { start: fmt(startOfYear(d)), end: fmt(endOfYear(d)) };
    case "last_30":
      return { start: addDays(today, -29), end: today };
    case "last_90":
      return { start: addDays(today, -89), end: today };
    case "last_12_months":
      return { start: fmt(startOfMonth(subMonths(d, 11))), end: fmt(endOfMonth(d)) };
  }
}

/** Période de même durée immédiatement antérieure. */
export function previousPeriod(period: Period): Period {
  const length = daysBetween(period.start, period.end) + 1;
  // Si la période correspond à des mois entiers, on recule du même nombre de mois.
  const s = parseISO(period.start);
  const e = parseISO(period.end);
  if (s.getDate() === 1 && fmt(endOfMonth(e)) === period.end) {
    const months = monthsBetween(period.start, period.end).length;
    const ps = dfAddMonths(s, -months);
    return { start: fmt(ps), end: fmt(endOfMonth(dfAddMonths(ps, months - 1))) };
  }
  return { start: addDays(period.start, -length), end: addDays(period.start, -1) };
}

export function weekPeriod(today: ISODate): Period {
  const d = parseISO(today);
  return { start: fmt(startOfWeek(d, { weekStartsOn: 1 })), end: fmt(endOfWeek(d, { weekStartsOn: 1 })) };
}

export function isoWeekKey(date: ISODate): string {
  const d = parseISO(date);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
}

export function endOfMonthISO(date: ISODate): ISODate {
  return fmt(endOfMonth(parseISO(date)));
}

export function startOfMonthISO(date: ISODate): ISODate {
  return fmt(startOfMonth(parseISO(date)));
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
