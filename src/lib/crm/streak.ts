import type { AppData, ISODate } from "@/lib/domain/types";
import { addDays, isoWeekKey } from "@/lib/calculations/dates";
import { isContactComplete } from "./views";

/**
 * Séries d'activité : jours où au moins une action CRM pertinente a été réalisée
 * (interaction consignée, mission terminée, opportunité déplacée, fiche contact complète
 * créée). Ouvrir l'application ne compte pas. Les jours non ouvrés (paramétrables)
 * n'interrompent jamais une série ; une activité ces jours-là compte en bonus.
 */

export function activeDays(data: Pick<AppData, "salesActivities" | "tasks" | "contacts">): Set<ISODate> {
  const days = new Set<ISODate>();
  for (const a of data.salesActivities) if (a.done) days.add(a.date.slice(0, 10));
  for (const t of data.tasks) if (t.type !== "internal" && t.status === "done" && t.completedAt) days.add(t.completedAt.slice(0, 10));
  for (const c of data.contacts) if (isContactComplete(c)) days.add(c.createdAt.slice(0, 10));
  return days;
}

export interface StreakInfo {
  /** Jours ouvrés consécutifs actifs jusqu'à aujourd'hui (ou hier si aujourd'hui n'est pas encore actif). */
  current: number;
  best: number;
  activeToday: boolean;
}

const weekday = (d: ISODate) => new Date(`${d}T12:00:00Z`).getUTCDay();

export function computeStreak(days: Set<ISODate>, today: ISODate, workingDays: number[], lookback = 400): StreakInfo {
  const working = new Set(workingDays.length ? workingDays : [1, 2, 3, 4, 5]);
  const isWorking = (d: ISODate) => working.has(weekday(d));
  const activeToday = days.has(today);

  // Série courante : on remonte depuis aujourd'hui (aujourd'hui non actif = pas encore cassé).
  let current = 0;
  let d = today;
  if (!activeToday) d = addDays(today, -1);
  for (let i = 0; i < lookback; i++, d = addDays(d, -1)) {
    if (days.has(d)) current++;
    else if (isWorking(d)) break;
  }

  // Meilleure série sur la période.
  let best = 0;
  let run = 0;
  for (let i = lookback; i >= 0; i--) {
    const day = addDays(today, -i);
    if (days.has(day)) best = Math.max(best, ++run);
    else if (isWorking(day) && day !== today) run = 0;
  }
  return { current, best: Math.max(best, current), activeToday };
}

/**
 * Semaines « suivi rigoureux » (semaines ISO complètes avant la semaine en cours) :
 * au moins 3 missions de suivi (relance, appel, e-mail) à échéance dans la semaine,
 * toutes réalisées au plus tard à leur échéance.
 */
export function rigorousWeeks(data: Pick<AppData, "tasks">, today: ISODate, weeks = 12): { key: string; end: ISODate }[] {
  const out: { key: string; end: ISODate }[] = [];
  const currentKey = isoWeekKey(today);
  const followTypes = new Set(["followup", "call", "email"]);
  const byWeek = new Map<string, { total: number; onTime: number; end: ISODate }>();
  for (const t of data.tasks) {
    if (!followTypes.has(t.type) || !t.dueDate || t.status === "cancelled") continue;
    const key = isoWeekKey(t.dueDate);
    if (key >= currentKey || t.dueDate < addDays(today, -7 * weeks)) continue;
    const w = byWeek.get(key) ?? { total: 0, onTime: 0, end: t.dueDate };
    w.total++;
    if (t.status === "done" && t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate) w.onTime++;
    if (t.dueDate > w.end) w.end = t.dueDate;
    byWeek.set(key, w);
  }
  for (const [key, w] of byWeek) if (w.total >= 3 && w.onTime === w.total) out.push({ key, end: w.end });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
