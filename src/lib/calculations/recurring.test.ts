import { describe, expect, it } from "vitest";
import { billingDates, computeARR, computeMRR, monthlyValue } from "./recurring";
import type { Subscription } from "@/lib/domain/types";
import { NOW } from "@/test/fixtures";

const sub = (p: Partial<Subscription>): Subscription => ({
  id: "s",
  clientId: "c",
  productId: null,
  offer: "Offre",
  amount: 100_000,
  periodicity: "monthly",
  startDate: "2026-01-01",
  endDate: null,
  status: "active",
  renewalTerms: "",
  createdAt: NOW,
  updatedAt: NOW,
  ...p,
});

describe("revenus récurrents", () => {
  it("normalise les périodicités au mois", () => {
    expect(monthlyValue(sub({ amount: 90_000, periodicity: "quarterly" }))).toBe(30_000);
    expect(monthlyValue(sub({ amount: 540_000, periodicity: "yearly" }))).toBe(45_000);
  });

  it("MRR : uniquement les contrats actifs, démarrés et non terminés", () => {
    const subs = [
      sub({ id: "a", amount: 100_000 }),
      sub({ id: "b", amount: 60_000, periodicity: "quarterly" }),
      sub({ id: "c", amount: 50_000, status: "paused" }),
      sub({ id: "d", amount: 70_000, status: "cancelled", endDate: "2026-05-31" }),
      sub({ id: "e", amount: 80_000, startDate: "2026-12-01" }),
      sub({ id: "f", amount: 40_000, endDate: "2026-09-30" }),
    ];
    expect(computeMRR(subs, "2026-10-15")).toBe(120_000);
    // Historique : le contrat résilié comptait avant sa date de fin.
    expect(computeMRR(subs, "2026-05-15")).toBe(100_000 + 20_000 + 70_000 + 40_000);
  });

  it("ARR = MRR × 12 (estimation annualisée)", () => {
    expect(computeARR(120_000)).toBe(1_440_000);
  });

  it("calcule les dates de facturation à date anniversaire", () => {
    expect(billingDates(sub({ startDate: "2026-01-31" }), "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(billingDates(sub({ periodicity: "quarterly" }), "2026-01-01", "2026-12-31")).toEqual(["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]);
  });
});
