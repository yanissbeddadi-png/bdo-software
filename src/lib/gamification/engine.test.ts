import { describe, expect, it } from "vitest";
import { execute, finalize } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import { totalXp, reconcileGamification } from "./engine";
import { levelFromXp } from "./levels";
import { ctx, emptyData, invoice, line, NOW, TODAY } from "@/test/fixtures";
import type { AppData, Task } from "@/lib/domain/types";

function ok<R>(res: ReturnType<typeof execute<unknown, R>>): Extract<typeof res, { ok: true }> {
  if (!res.ok) throw new Error(res.error);
  return res;
}

const taskInput = (title: string, complexity: Task["complexity"] = "standard") => ({
  title,
  description: "",
  assigneeId: null,
  priority: "normal" as const,
  status: "todo" as const,
  complexity,
  dueDate: "2026-10-20",
  estimateHours: 2,
  projectId: null,
  clientId: null,
  goalId: null,
  dependsOn: [],
  recurrence: "none" as const,
});

function withClient(): AppData {
  const d = emptyData();
  d.clients = [{ id: "cli_1", name: "Client Test", sector: "", status: "active", city: "", website: "", satisfaction: 4, notes: "", documents: [], createdAt: NOW, updatedAt: NOW }];
  return d;
}

describe("attribution d'XP", () => {
  it("accorde l'XP à la clôture d'une tâche, une seule fois", () => {
    let d = emptyData();
    const created = ok(execute(d, C.createTask, taskInput("Écrire le rapport", "complex"), ctx()));
    d = created.data;
    const id = created.result.id;
    const done = ok(execute(d, C.setTaskStatus, { id, status: "done" }, ctx()));
    expect(done.awarded.find((x) => x.idempotencyKey === `task:${id}`)?.amount).toBe(40);
    // Rouvrir puis refermer ne redonne rien.
    const reopened = ok(execute(done.data, C.setTaskStatus, { id, status: "todo" }, ctx()));
    const again = ok(execute(reopened.data, C.setTaskStatus, { id, status: "done" }, ctx()));
    expect(again.awarded.some((x) => x.idempotencyKey === `task:${id}`)).toBe(false);
    expect(again.data.xpTransactions.filter((x) => x.idempotencyKey === `task:${id}`)).toHaveLength(1);
  });

  it("la réconciliation est idempotente", () => {
    const d = ok(execute(emptyData(), C.createTask, { ...taskInput("A"), status: "done" }, ctx())).data;
    const r1 = reconcileGamification(d, { now: NOW, today: TODAY });
    const r2 = reconcileGamification(r1.data, { now: NOW, today: TODAY });
    expect(r2.awarded).toHaveLength(0);
    expect(r2.data.xpTransactions).toHaveLength(r1.data.xpTransactions.length);
    expect(r2.data.missions).toHaveLength(r1.data.missions.length);
    expect(r2.data.notifications).toHaveLength(r1.data.notifications.length);
  });

  it("n'accorde pas l'XP d'une facture tant qu'elle n'est pas intégralement payée, puis une seule fois", () => {
    let d = withClient();
    d.invoices = [invoice({ id: "inv_1", issueDate: "2026-10-01", dueDate: "2026-10-31", items: [line(1, 1000)] })];
    d = finalize(d, { now: NOW, today: TODAY }).data;
    const partial = ok(execute(d, C.recordPayment, { invoiceId: "inv_1", date: TODAY, amount: 60_000, method: "transfer", reference: "", notes: "" }, ctx()));
    expect(partial.awarded.some((x) => x.idempotencyKey === "invoice:inv_1")).toBe(false);
    const full = ok(execute(partial.data, C.recordPayment, { invoiceId: "inv_1", date: TODAY, amount: 60_000, method: "transfer", reference: "", notes: "" }, ctx()));
    expect(full.awarded.find((x) => x.idempotencyKey === "invoice:inv_1")?.amount).toBe(30);
    expect(full.awarded.find((x) => x.idempotencyKey === "client:cli_1")?.amount).toBe(75);
    // Suppression puis ré-enregistrement du paiement : pas de nouvelle récompense.
    const payId = full.data.payments.at(-1)!.id;
    const removed = ok(execute(full.data, C.deletePayment, { id: payId }, ctx()));
    const repaid = ok(execute(removed.data, C.recordPayment, { invoiceId: "inv_1", date: TODAY, amount: 60_000, method: "transfer", reference: "", notes: "" }, ctx()));
    expect(repaid.awarded.some((x) => x.idempotencyKey === "invoice:inv_1")).toBe(false);
  });

  it("applique le plafond quotidien des factures payées", () => {
    let d = withClient();
    d.settings.gamification.dailyInvoiceXpCap = 2;
    d.invoices = [1, 2, 3].map((n) => invoice({ id: `inv_${n}`, number: `F${n}`, issueDate: "2026-10-01", dueDate: "2026-10-31" }));
    d.payments = [1, 2, 3].map((n) => ({ id: `p${n}`, invoiceId: `inv_${n}`, date: TODAY, amount: 120_000, method: "transfer" as const, reference: "", notes: "", createdAt: NOW }));
    d = finalize(d, { now: NOW, today: TODAY }).data;
    expect(d.xpTransactions.filter((x) => x.source === "invoice")).toHaveLength(2);
  });

  it("les échéances d'abonnement ne rapportent pas d'XP de facture", () => {
    let d = withClient();
    d.invoices = [invoice({ id: "inv_s", subscriptionId: "sub_1" })];
    d.payments = [{ id: "p", invoiceId: "inv_s", date: "2026-09-10", amount: 120_000, method: "direct_debit", reference: "", notes: "", createdAt: NOW }];
    d = finalize(d, { now: NOW, today: TODAY }).data;
    expect(d.xpTransactions.some((x) => x.idempotencyKey === "invoice:inv_s")).toBe(false);
    expect(d.xpTransactions.some((x) => x.idempotencyKey === "client:cli_1")).toBe(true);
  });

  it("une opportunité gagnée, perdue puis regagnée n'est récompensée qu'une fois", () => {
    let d = withClient();
    const o = ok(
      execute(
        d,
        C.createOpportunity,
        {
          name: "Deal",
          clientId: "cli_1",
          leadId: null,
          contactId: null,
          amount: 1_000_000,
          probability: 50,
          stage: "proposal",
          expectedCloseDate: "2026-11-01",
          source: "",
          ownerId: null,
          nextAction: "",
          notes: "",
        },
        ctx(),
      ),
    );
    d = o.data;
    const won = ok(execute(d, C.moveOpportunity, { id: o.result.id, stage: "won" }, ctx()));
    expect(won.awarded.some((x) => x.idempotencyKey === `opportunity:${o.result.id}`)).toBe(true);
    const lost = ok(execute(won.data, C.moveOpportunity, { id: o.result.id, stage: "lost" }, ctx()));
    const rewon = ok(execute(lost.data, C.moveOpportunity, { id: o.result.id, stage: "won" }, ctx()));
    expect(rewon.data.xpTransactions.filter((x) => x.idempotencyKey === `opportunity:${o.result.id}`)).toHaveLength(1);
  });
});

describe("niveaux, succès, missions, objectifs", () => {
  it("une seule action peut faire passer plusieurs niveaux et chaque niveau est journalisé", () => {
    let d = emptyData();
    d.settings.gamification.xpRewards.task_complex = 400;
    const t = ok(execute(d, C.createTask, taskInput("Gros chantier", "complex"), ctx()));
    d = t.data;
    expect(totalXp(d)).toBe(0);
    const res = ok(execute(d, C.setTaskStatus, { id: t.result.id, status: "done" }, ctx()));
    expect(totalXp(res.data)).toBe(400);
    expect(levelFromXp(400).level).toBe(4);
    expect(res.levelUps).toEqual([2, 3, 4]);
    expect(res.data.progression.filter((p) => p.kind === "level_up").map((p) => p.key)).toEqual(["level:2", "level:3", "level:4"]);
  });

  it("débloque un succès selon sa condition, une seule fois", () => {
    const res = ok(execute(emptyData(), C.createClient, { name: "Premier", sector: "", status: "active", city: "", website: "", satisfaction: null, notes: "" }, ctx()));
    expect(res.unlockedAchievements).toContain("first-client");
    expect(res.awarded.find((x) => x.idempotencyKey === "achievement:first-client")?.amount).toBe(50);
    const again = ok(execute(res.data, C.createClient, { name: "Second", sector: "", status: "active", city: "", website: "", satisfaction: null, notes: "" }, ctx()));
    expect(again.unlockedAchievements).not.toContain("first-client");
  });

  it("génère des missions automatiques idempotentes et les termine quand la condition est remplie", () => {
    let d = withClient();
    d.invoices = [invoice({ id: "inv_late", issueDate: "2026-08-01", dueDate: "2026-09-01" })];
    d = finalize(d, { now: NOW, today: TODAY }).data;
    const relance = d.missions.filter((m) => m.autoKey === "relance:inv_late");
    expect(relance).toHaveLength(1);
    d = finalize(d, { now: NOW, today: TODAY }).data;
    expect(d.missions.filter((m) => m.autoKey === "relance:inv_late")).toHaveLength(1);
    const res = ok(execute(d, C.logInvoiceFollowUp, { invoiceId: "inv_late", notes: "Appel" }, ctx()));
    const m = res.data.missions.find((x) => x.autoKey === "relance:inv_late")!;
    expect(m.status).toBe("done");
    expect(res.awarded.some((x) => x.idempotencyKey === `mission:${m.id}`)).toBe(true);
  });

  it("une mission à condition automatique ne peut pas être validée manuellement", () => {
    let d = withClient();
    d.invoices = [invoice({ id: "inv_late", issueDate: "2026-08-01", dueDate: "2026-09-01" })];
    d = finalize(d, { now: NOW, today: TODAY }).data;
    const m = d.missions.find((x) => x.autoKey === "relance:inv_late")!;
    expect(execute(d, C.setMissionStatus, { id: m.id, status: "done" }, ctx()).ok).toBe(false);
  });

  it("récompense un objectif à 50 % puis à 100 %, sans doublon", () => {
    let d = emptyData();
    const g = ok(
      execute(
        d,
        C.createGoal,
        {
          title: "Satisfaction",
          description: "",
          type: "customer",
          periodLabel: "T4",
          periodStart: "2026-10-01",
          periodEnd: "2026-12-31",
          ownerId: null,
          metric: "manual",
          startValue: 0,
          targetValue: 10,
          manualValue: 0,
          unit: "pts",
          keyResults: [],
        },
        ctx(),
      ),
    );
    d = g.data;
    const half = ok(execute(d, C.setGoalProgress, { id: g.result.id, manualValue: 6 }, ctx()));
    expect(half.awarded.map((x) => x.idempotencyKey)).toContain(`goal:${g.result.id}:50`);
    const full = ok(execute(half.data, C.setGoalProgress, { id: g.result.id, manualValue: 10 }, ctx()));
    expect(full.awarded.map((x) => x.idempotencyKey)).toContain(`goal:${g.result.id}:100`);
    const down = ok(execute(full.data, C.setGoalProgress, { id: g.result.id, manualValue: 2 }, ctx()));
    const up = ok(execute(down.data, C.setGoalProgress, { id: g.result.id, manualValue: 10 }, ctx()));
    expect(up.awarded.filter((x) => x.source === "goal")).toHaveLength(0);
  });

  it("la réinitialisation remet l'XP à zéro sans permettre de regagner les anciennes récompenses", () => {
    let d = emptyData();
    const t = ok(execute(d, C.createTask, { ...taskInput("Déjà faite"), status: "done" }, ctx()));
    d = t.data;
    expect(totalXp(d)).toBeGreaterThan(0);
    const reset = ok(execute(d, C.resetProgression, undefined, ctx()));
    expect(totalXp(reset.data)).toBe(0);
    expect(levelFromXp(totalXp(reset.data)).level).toBe(1);
    expect(reset.data.retiredXpKeys).toContain(`task:${t.result.id}`);
    const again = finalize(reset.data, { now: NOW, today: TODAY }).data;
    expect(totalXp(again)).toBe(0);
    // Une nouvelle action, en revanche, rapporte de l'XP.
    const fresh = ok(execute(again, C.createTask, { ...taskInput("Nouvelle"), status: "done" }, ctx()));
    expect(totalXp(fresh.data)).toBe(20);
  });

  it("refuse la réinitialisation à un rôle non autorisé", () => {
    expect(execute(emptyData(), C.resetProgression, undefined, ctx("collaborateur")).ok).toBe(false);
  });
});
