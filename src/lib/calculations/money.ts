import type { BasisPoints, Cents, LineItem } from "@/lib/domain/types";

/**
 * Règle d'arrondi monétaire : arrondi au centime le plus proche, demi-unité
 * éloignée de zéro (« arrondi commercial »). Tous les montants sont des entiers
 * en centimes ; aucun calcul monétaire n'est fait en euros flottants.
 */
export function roundCents(value: number): Cents {
  const rounded = Math.round(Math.abs(value) + Number.EPSILON * Math.abs(value));
  return value < 0 ? -rounded : rounded;
}

export function eurosToCents(euros: number): Cents {
  return roundCents(euros * 100);
}

export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

/** Montant HT d'une ligne : quantité × prix unitaire, arrondi au centime. */
export function lineHT(item: Pick<LineItem, "quantity" | "unitPrice">): Cents {
  return roundCents(item.quantity * item.unitPrice);
}

/** TVA appliquée à un montant HT. */
export function vatOn(amountHT: Cents, rate: BasisPoints): Cents {
  return roundCents((amountHT * rate) / 10_000);
}

export interface VatBreakdownEntry {
  rate: BasisPoints;
  baseHT: Cents;
  vat: Cents;
}

export interface DocumentTotals {
  totalHT: Cents;
  totalVAT: Cents;
  totalTTC: Cents;
  breakdown: VatBreakdownEntry[];
}

/**
 * Totaux d'un document (devis ou facture).
 *
 * Règle de TVA documentée : chaque ligne est arrondie au centime (HT), puis la TVA
 * est calculée **par taux** sur la somme des bases HT de ce taux, et arrondie au
 * centime. TTC = HT + TVA. Cette règle évite les écarts d'arrondi cumulés ligne à
 * ligne et correspond à la présentation d'un récapitulatif de TVA par taux.
 */
export function documentTotals(items: Pick<LineItem, "quantity" | "unitPrice" | "vatRate">[]): DocumentTotals {
  const byRate = new Map<BasisPoints, Cents>();
  let totalHT = 0;
  for (const item of items) {
    const ht = lineHT(item);
    totalHT += ht;
    byRate.set(item.vatRate, (byRate.get(item.vatRate) ?? 0) + ht);
  }
  const breakdown: VatBreakdownEntry[] = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, baseHT]) => ({ rate, baseHT, vat: vatOn(baseHT, rate) }));
  const totalVAT = breakdown.reduce((sum, e) => sum + e.vat, 0);
  return { totalHT, totalVAT, totalTTC: totalHT + totalVAT, breakdown };
}

/** Montant TTC d'une dépense (HT + TVA arrondie). */
export function expenseTTC(expense: { amountHT: Cents; vatRate: BasisPoints }): Cents {
  return expense.amountHT + vatOn(expense.amountHT, expense.vatRate);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Variation en pourcentage, `null` si non calculable (base nulle). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Ratio en pourcentage, `null` si dénominateur nul. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}
