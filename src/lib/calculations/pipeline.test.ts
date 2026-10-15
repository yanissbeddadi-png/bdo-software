import { describe, expect, it } from "vitest";
import { conversionRate, pipelineValue, weightedPipeline } from "./pipeline";
import type { Opportunity } from "@/lib/domain/types";
import { NOW } from "@/test/fixtures";

const opp = (p: Partial<Opportunity>): Opportunity => ({
  id: Math.random().toString(),
  name: "o",
  clientId: "c",
  leadId: null,
  contactId: null,
  amount: 1_000_000,
  probability: 50,
  stage: "proposal",
  expectedCloseDate: "2026-12-01",
  source: "",
  ownerId: null,
  lastInteractionAt: NOW,
  nextAction: "",
  notes: "",
  closedAt: null,
  lostReason: "",
  createdAt: NOW,
  updatedAt: NOW,
  ...p,
});

describe("pipeline commercial", () => {
  const opps = [
    opp({ amount: 1_000_000, probability: 50 }),
    opp({ amount: 333_333, probability: 30 }),
    opp({ stage: "won", probability: 100, closedAt: "2026-09-01T00:00:00Z" }),
    opp({ stage: "lost", probability: 0, closedAt: "2026-09-10T00:00:00Z" }),
  ];

  it("exclut les opportunités gagnées et perdues de la valeur du pipeline", () => {
    expect(pipelineValue(opps)).toBe(1_333_333);
  });

  it("pondère chaque montant par sa probabilité", () => {
    expect(weightedPipeline(opps)).toBe(500_000 + 100_000);
  });

  it("taux de conversion = gagnées ÷ clôturées, null sans clôture", () => {
    expect(conversionRate(opps)).toBe(50);
    expect(conversionRate([opp({})])).toBeNull();
    expect(conversionRate(opps, { start: "2026-09-05", end: "2026-09-30" })).toBe(0);
  });
});
