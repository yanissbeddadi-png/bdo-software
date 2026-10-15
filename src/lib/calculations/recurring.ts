import type { Cents, ISODate, Subscription, SubscriptionPeriodicity } from "@/lib/domain/types";
import { addMonths, endOfMonthISO, lastMonthKeys, monthPeriod } from "./dates";
import { roundCents } from "./money";

export const PERIOD_MONTHS: Record<SubscriptionPeriodicity, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Valeur mensuelle normalisée d'un abonnement : montant / nombre de mois de la période. */
export function monthlyValue(sub: Pick<Subscription, "amount" | "periodicity">): Cents {
  return roundCents(sub.amount / PERIOD_MONTHS[sub.periodicity]);
}

/**
 * Un abonnement contribue au MRR à une date donnée s'il est :
 * - non résilié (statut `active`) — les abonnements `paused` et `cancelled` sont exclus ;
 * - démarré (startDate ≤ date) ;
 * - non terminé (pas de date de fin, ou date de fin ≥ date).
 *
 * Pour l'historique, un abonnement `cancelled` contribue entre sa date de début et sa
 * date de fin (la résiliation est matérialisée par la date de fin).
 */
export function isSubscriptionActiveOn(sub: Subscription, date: ISODate): boolean {
  if (sub.startDate > date) return false;
  if (sub.endDate && sub.endDate < date) return false;
  if (sub.status === "paused") return false;
  if (sub.status === "cancelled" && !sub.endDate) return false;
  return true;
}

/** MRR : somme des valeurs mensuelles normalisées des abonnements actifs à la date. */
export function computeMRR(subscriptions: Subscription[], date: ISODate): Cents {
  return subscriptions.filter((s) => isSubscriptionActiveOn(s, date)).reduce((sum, s) => sum + monthlyValue(s), 0);
}

/** ARR : annualisation du MRR (MRR × 12). Estimation, pas du chiffre d'affaires réalisé. */
export function computeARR(mrr: Cents): Cents {
  return mrr * 12;
}

/** MRR en fin de mois pour chacun des `count` derniers mois. */
export function mrrSeries(subscriptions: Subscription[], today: ISODate, count: number): { month: string; mrr: Cents }[] {
  return lastMonthKeys(today, count).map((month) => {
    const end = endOfMonthISO(monthPeriod(month).start);
    const at = end > today ? today : end;
    return { month, mrr: computeMRR(subscriptions, at) };
  });
}

/** Dates de facturation d'un abonnement comprises dans [from, to] (facturation à date anniversaire). */
export function billingDates(sub: Subscription, from: ISODate, to: ISODate): ISODate[] {
  const step = PERIOD_MONTHS[sub.periodicity];
  const dates: ISODate[] = [];
  let i = 0;
  let cursor = sub.startDate;
  while (cursor <= to && i < 600) {
    if (cursor >= from && isSubscriptionActiveOn(sub, cursor)) dates.push(cursor);
    i++;
    cursor = addMonths(sub.startDate, step * i);
  }
  return dates;
}

export function nextBillingDate(sub: Subscription, today: ISODate): ISODate | null {
  const dates = billingDates(sub, today, addMonths(today, 13));
  return dates[0] ?? null;
}

export const PERIODICITY_LABELS: Record<SubscriptionPeriodicity, string> = {
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
  yearly: "Annuelle",
};
