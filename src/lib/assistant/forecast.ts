import type { Cents, ISODate, Opportunity } from "@/lib/domain/types";
import { monthKey, nextMonthKeys } from "@/lib/calculations/dates";
import { isOpen } from "@/lib/calculations/pipeline";
import { roundCents } from "@/lib/calculations/money";

/**
 * Prévision des ventes par mois de signature prévue :
 * - « signé » : opportunités gagnées clôturées dans le mois ;
 * - « pondéré » : Σ montant × probabilité des opportunités ouvertes attendues dans le mois ;
 * - « engagé » : opportunités ouvertes en négociation attendues dans le mois (montant plein) ;
 * - « potentiel » : toutes les opportunités ouvertes attendues dans le mois (montant plein).
 * Les opportunités dont la date prévue est dépassée sont regroupées à part : elles doivent
 * être requalifiées (nouvelle date ou perte) plutôt que comptées silencieusement.
 */

export interface ForecastMonth {
  month: string;
  won: Cents;
  weighted: Cents;
  committed: Cents;
  bestCase: Cents;
  openCount: number;
}

export interface Forecast {
  months: ForecastMonth[];
  /** Opportunités ouvertes dont la date de signature prévue est passée. */
  overdue: { count: number; amount: Cents; weighted: Cents };
  /** Opportunités ouvertes sans date ou au-delà de l'horizon. */
  later: { count: number; amount: Cents };
}

export function forecastByMonth(opps: Opportunity[], today: ISODate, horizon = 3): Forecast {
  const keys = nextMonthKeys(today, horizon);
  const months = new Map<string, ForecastMonth>(keys.map((k) => [k, { month: k, won: 0, weighted: 0, committed: 0, bestCase: 0, openCount: 0 }]));
  const overdue = { count: 0, amount: 0, weighted: 0 };
  const later = { count: 0, amount: 0 };
  for (const o of opps) {
    if (o.stage === "won" && o.closedAt) {
      const m = months.get(monthKey(o.closedAt));
      if (m) m.won += o.amount;
      continue;
    }
    if (!isOpen(o)) continue;
    if (o.expectedCloseDate && o.expectedCloseDate < today) {
      overdue.count += 1;
      overdue.amount += o.amount;
      overdue.weighted += roundCents((o.amount * o.probability) / 100);
      continue;
    }
    const m = o.expectedCloseDate ? months.get(monthKey(o.expectedCloseDate)) : undefined;
    if (!m) {
      later.count += 1;
      later.amount += o.amount;
      continue;
    }
    m.openCount += 1;
    m.bestCase += o.amount;
    m.weighted += roundCents((o.amount * o.probability) / 100);
    if (o.stage === "negotiation") m.committed += o.amount;
  }
  return { months: keys.map((k) => months.get(k)!), overdue, later };
}
