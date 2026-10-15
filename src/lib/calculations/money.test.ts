import { describe, expect, it } from "vitest";
import { documentTotals, expenseTTC, lineHT, percentChange, roundCents, vatOn } from "./money";
import { line } from "@/test/fixtures";

describe("arrondis et TVA", () => {
  it("arrondit au centime, demi-unité éloignée de zéro", () => {
    expect(roundCents(10.5)).toBe(11);
    expect(roundCents(-10.5)).toBe(-11);
    expect(roundCents(10.49)).toBe(10);
  });

  it("calcule la TVA à 20 % sur un montant HT", () => {
    expect(vatOn(100_000, 2000)).toBe(20_000);
    expect(vatOn(1_005, 2000)).toBe(201); // 10,05 € × 20 % = 2,01 €
    expect(vatOn(1_003, 2000)).toBe(201); // 2,006 € → 2,01 €
    expect(vatOn(1_234, 550)).toBe(68); // 67,87 → 68
  });

  it("calcule le HT d'une ligne avec quantité décimale", () => {
    expect(lineHT({ quantity: 1.5, unitPrice: 65_000 })).toBe(97_500);
    expect(lineHT({ quantity: 3, unitPrice: 33_333 })).toBe(99_999);
  });

  it("calcule HT, TVA par taux et TTC d'un document", () => {
    const t = documentTotals([line(2, 100), line(1, 50.05), line(1, 10, 1000), line(1, 20, 0)]);
    expect(t.totalHT).toBe(28_005);
    // TVA 20 % sur 250,05 € = 50,01 € ; TVA 10 % sur 10 € = 1 € ; 0 % sur 20 €.
    expect(t.breakdown.find((b) => b.rate === 2000)?.vat).toBe(5_001);
    expect(t.breakdown.find((b) => b.rate === 1000)?.vat).toBe(100);
    expect(t.totalVAT).toBe(5_101);
    expect(t.totalTTC).toBe(33_106);
  });

  it("applique la TVA par taux et non ligne à ligne (pas d'écart cumulé)", () => {
    const items = [line(1, 0.05), line(1, 0.05), line(1, 0.05)];
    // Ligne à ligne : 3 × round(1 c) = 3 c ; par taux : round(15 c × 20 %) = 3 c.
    expect(documentTotals(items).totalVAT).toBe(3);
  });

  it("calcule le TTC d'une dépense", () => {
    expect(expenseTTC({ amountHT: 290_000, vatRate: 2000 })).toBe(348_000);
    expect(expenseTTC({ amountHT: 4_200, vatRate: 0 })).toBe(4_200);
  });

  it("renvoie null pour une variation non calculable", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(150, 100)).toBe(50);
  });
});
