import { describe, expect, it } from "vitest";
import { execute, finalize } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import type { AppData, Contact, Task } from "@/lib/domain/types";
import type { ProspectInput, SalesActivityInput } from "@/lib/validation/schemas";
import { client, ctx, emptyData, NOW, OPPORTUNITY_INPUT, TODAY } from "@/test/fixtures";
import { buildCrmIndex } from "./views";
import { buildActionCenter } from "./action-center";
import { computeStreak, rigorousWeeks } from "./streak";
import { computeCrmStats } from "./stats";
import { crmAlerts } from "./automations";
import { migrateData } from "@/lib/database/migrations";
import { addDays } from "@/lib/calculations/dates";

function ok<R>(res: ReturnType<typeof execute<unknown, R>>): Extract<typeof res, { ok: true }> {
  if (!res.ok) throw new Error(res.error);
  return res;
}

const PROSPECT: ProspectInput = {
  firstName: "Léa",
  lastName: "Martin",
  jobTitle: "Directrice achats",
  email: "lea.martin@acme.example",
  phone: "+33 6 00 00 00 01",
  clientId: null,
  newCompanyName: "Acme",
  source: "Salon",
  ownerId: null,
  relation: "prospect",
  priority: "normal",
  stage: "new",
  opportunityName: "",
  amount: 1_500_000,
  notes: "Rencontrée au salon.",
  nextAction: { title: "Premier appel", type: "call", dueDate: "2026-10-16", dueTime: "10:00" },
  confirmDuplicate: false,
};

const interaction = (p: Partial<SalesActivityInput>): SalesActivityInput => ({
  type: "call",
  direction: "out",
  date: TODAY,
  subject: "Appel de découverte",
  notes: "",
  outcome: "Besoin confirmé",
  nextStep: "",
  contactId: null,
  clientId: null,
  opportunityId: null,
  ownerId: null,
  taskId: null,
  followUp: null,
  ...p,
});

/** Prospect créé avec entreprise, opportunité et mission. */
function withProspect() {
  const res = ok(execute(emptyData(), C.createProspect, PROSPECT, ctx()));
  return { data: res.data, contact: res.result.contact, company: res.result.company!, opportunity: res.result.opportunity! };
}

const mission = (d: AppData, p: Partial<Task> = {}): Task => ({
  id: `tsk_${Math.random().toString(36).slice(2)}`,
  title: "Relance",
  description: "",
  type: "followup",
  contactId: null,
  opportunityId: null,
  dueTime: null,
  result: "",
  assigneeId: null,
  priority: "normal",
  status: "todo",
  complexity: "simple",
  dueDate: TODAY,
  estimateHours: 0,
  actualHours: 0,
  projectId: null,
  clientId: d.clients[0]?.id ?? null,
  goalId: null,
  dependsOn: [],
  comments: [],
  recurrence: "none",
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...p,
});

describe("création rapide d'un prospect", () => {
  it("crée l'entreprise, le contact, l'opportunité, la note et la prochaine action", () => {
    const { data, contact, company, opportunity } = withProspect();
    expect(company.relation).toBe("prospect");
    expect(contact.clientId).toBe(company.id);
    expect(contact.isPrimary).toBe(true);
    expect(opportunity.stage).toBe("new");
    expect(opportunity.contactId).toBe(contact.id);
    expect(opportunity.amount).toBe(1_500_000);
    const task = data.tasks.find((t) => t.contactId === contact.id)!;
    expect(task).toMatchObject({ type: "call", dueDate: "2026-10-16", dueTime: "10:00", status: "todo" });
    expect(data.notes.some((n) => n.contactId === contact.id)).toBe(true);
  });

  it("signale un doublon probable (e-mail, ou nom dans la même entreprise) sans fusion automatique", () => {
    const { data, company } = withProspect();
    const byEmail = execute(data, C.createProspect, { ...PROSPECT, firstName: "Autre", newCompanyName: "", clientId: company.id, email: "LEA.MARTIN@acme.example" }, ctx());
    expect(byEmail.ok).toBe(false);
    if (!byEmail.ok) expect(byEmail.fieldErrors.duplicate).toBe("confirm");
    const byName = execute(data, C.createProspect, { ...PROSPECT, email: "", newCompanyName: "", clientId: company.id, firstName: "lea" }, ctx());
    expect(byName.ok).toBe(false);
    // Même nom dans une autre entreprise : pas un doublon.
    expect(execute(data, C.createProspect, { ...PROSPECT, email: "", newCompanyName: "Beta", stage: null, nextAction: null }, ctx()).ok).toBe(true);
    // Confirmation explicite : création autorisée, rien n'est fusionné.
    const forced = ok(execute(data, C.createProspect, { ...PROSPECT, newCompanyName: "", clientId: company.id, confirmDuplicate: true }, ctx()));
    expect(forced.data.contacts).toHaveLength(2);
  });

  it("refuse une étape sans entreprise ni nom d'opportunité", () => {
    expect(execute(emptyData(), C.createProspect, { ...PROSPECT, newCompanyName: "", opportunityName: "" }, ctx()).ok).toBe(false);
  });
});

describe("étapes commerciales et interactions", () => {
  it("une opportunité gagnée fait passer entreprise et contact au statut client, avec trace dans l'historique", () => {
    const { data, opportunity, contact, company } = withProspect();
    const won = ok(execute(data, C.moveOpportunity, { id: opportunity.id, stage: "won" }, ctx()));
    expect(won.data.clients.find((c) => c.id === company.id)!.relation).toBe("customer");
    expect(won.data.contacts.find((c) => c.id === contact.id)!.relation).toBe("customer");
    expect(won.data.salesActivities.some((a) => a.type === "stage_change" && a.opportunityId === opportunity.id)).toBe(true);
    expect(won.data.payments).toHaveLength(0);
  });

  it("consigner un appel ne change jamais l'étape commerciale", () => {
    const { data, opportunity, contact } = withProspect();
    const res = ok(execute(data, C.logInteraction, interaction({ contactId: contact.id, opportunityId: opportunity.id, outcome: "Très intéressé, prêt à signer" }), ctx()));
    expect(res.data.opportunities[0]!.stage).toBe("new");
    expect(res.data.opportunities[0]!.lastInteractionAt).toBe(NOW);
  });

  it("refuse une interaction datée dans le futur ou sans rattachement", () => {
    const { data, contact } = withProspect();
    expect(execute(data, C.logInteraction, interaction({ contactId: contact.id, date: "2026-10-20" }), ctx()).ok).toBe(false);
    expect(execute(data, C.logInteraction, interaction({}), ctx()).ok).toBe(false);
  });

  it("une interaction peut terminer la mission qu'elle réalise et planifier la suite", () => {
    const { data, contact } = withProspect();
    const task = data.tasks.find((t) => t.contactId === contact.id)!;
    const res = ok(
      execute(data, C.logInteraction, interaction({ contactId: contact.id, taskId: task.id, followUp: { title: "Relancer", type: "followup", dueDate: "2026-10-22", dueTime: null } }), ctx()),
    );
    expect(res.data.tasks.find((t) => t.id === task.id)!.status).toBe("done");
    const next = res.data.tasks.find((t) => t.title === "Relancer")!;
    expect(next).toMatchObject({ contactId: contact.id, dueDate: "2026-10-22", status: "todo" });
  });
});

describe("missions CRM", () => {
  it("terminer une mission enregistre le résultat, la note, l'événement et la suite, sans toucher à l'étape", () => {
    const { data, contact } = withProspect();
    const task = data.tasks.find((t) => t.contactId === contact.id)!;
    expect(execute(data, C.completeMission, { id: task.id, result: "", note: "", followUp: null }, ctx()).ok).toBe(false); // résultat obligatoire pour un appel
    const res = ok(
      execute(
        data,
        C.completeMission,
        { id: task.id, result: "Joint, intéressé", note: "Budget validé", followUp: { title: "Envoyer la proposition", type: "proposal_send", dueDate: "2026-10-20", dueTime: null } },
        ctx(),
      ),
    );
    const done = res.data.tasks.find((t) => t.id === task.id)!;
    expect(done).toMatchObject({ status: "done", result: "Joint, intéressé", completedAt: NOW });
    expect(res.data.salesActivities.some((a) => a.type === "task_done" && a.taskId === task.id)).toBe(true);
    expect(res.data.notes.some((n) => n.contactId === contact.id && n.body === "Budget validé")).toBe(true);
    expect(res.data.tasks.some((t) => t.type === "proposal_send" && t.status === "todo")).toBe(true);
    expect(res.data.opportunities[0]!.stage).toBe("new");
    expect(execute(res.data, C.completeMission, { id: task.id, result: "x", note: "", followUp: null }, ctx()).ok).toBe(false);
  });

  it("planifier une action exige un rattachement et une heure valide", () => {
    const { data, contact } = withProspect();
    const base = { title: "Relance", type: "followup" as const, dueDate: "2026-10-20", dueTime: null, contactId: null, clientId: null, opportunityId: null };
    expect(execute(data, C.scheduleAction, base, ctx()).ok).toBe(false);
    expect(execute(data, C.scheduleAction, { ...base, contactId: contact.id, dueTime: "25:00" }, ctx()).ok).toBe(false);
    const res = ok(execute(data, C.scheduleAction, { ...base, contactId: contact.id }, ctx()));
    expect(res.result.clientId).toBe(contact.clientId);
  });
});

describe("état de suivi et centre d'action", () => {
  it("calcule l'état de suivi selon les missions (retard > à relancer > attente > à traiter > sans action > à jour)", () => {
    const { data, contact } = withProspect();
    const d0 = { ...data, tasks: [] as Task[] };
    const state = (tasks: Task[], extra: Partial<Contact> = {}) => buildCrmIndex({ ...d0, tasks, contacts: d0.contacts.map((c) => ({ ...c, ...extra })) }, TODAY).contactById.get(contact.id)!.followUp;
    expect(state([])).toBe("to_process"); // nouveau prospect sans interaction
    expect(state([], { createdAt: "2026-08-01T10:00:00.000Z" })).toBe("no_next_action");
    expect(state([mission(d0, { contactId: contact.id, dueDate: addDays(TODAY, 3) })])).toBe("up_to_date");
    expect(state([mission(d0, { contactId: contact.id, status: "waiting", dueDate: addDays(TODAY, 3) })])).toBe("waiting");
    expect(state([mission(d0, { contactId: contact.id, dueDate: TODAY })])).toBe("due");
    expect(state([mission(d0, { contactId: contact.id, dueDate: TODAY }), mission(d0, { contactId: contact.id, dueDate: addDays(TODAY, -2) })])).toBe("overdue");
    // Une mission terminée n'est plus « due ».
    expect(state([mission(d0, { contactId: contact.id, dueDate: addDays(TODAY, -2), status: "done", completedAt: NOW })], { createdAt: "2026-08-01T10:00:00.000Z" })).toBe("no_next_action");
  });

  it("le centre d'action trie par urgence et justifie chaque élément", () => {
    const { data, contact } = withProspect();
    const d = {
      ...data,
      tasks: [mission(data, { contactId: contact.id, dueDate: TODAY, title: "Aujourd'hui" }), mission(data, { contactId: contact.id, dueDate: addDays(TODAY, -3), title: "En retard" })],
    };
    const items = buildActionCenter(d, buildCrmIndex(d, TODAY), TODAY);
    expect(items[0]!.kind).toBe("overdue");
    expect(items[0]!.reason).toMatch(/retard de 3 jours/);
    expect(items.every((i) => i.reason.length > 0)).toBe(true);
    const kinds = items.map((i) => i.kind);
    expect(kinds.indexOf("today")).toBeGreaterThan(kinds.indexOf("overdue"));
  });

  it("les automatisations produisent des alertes à clé stable (idempotentes)", () => {
    const { data, contact } = withProspect();
    const d = { ...data, tasks: [mission(data, { contactId: contact.id, dueDate: addDays(TODAY, -1) })] };
    const a1 = crmAlerts(d, buildCrmIndex(d, TODAY), TODAY).map((a) => a.key);
    const a2 = crmAlerts(d, buildCrmIndex(d, TODAY), TODAY).map((a) => a.key);
    expect(a1).toEqual(a2);
    expect(a1).toContain(`crm-overdue:${TODAY}`);
    const once = finalize(d, { now: NOW, today: TODAY }).data;
    const twice = finalize(once, { now: NOW, today: TODAY }).data;
    expect(twice.notifications).toHaveLength(once.notifications.length);
  });
});

describe("séries et semaines rigoureuses", () => {
  it("les jours non ouvrés n'interrompent pas une série ; un jour ouvré sans action la casse", () => {
    // 2026-10-15 est un jeudi.
    const days = new Set(["2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14"]); // ven., lun., mar., mer.
    expect(computeStreak(days, TODAY, [1, 2, 3, 4, 5])).toMatchObject({ current: 4, activeToday: false });
    days.add(TODAY);
    expect(computeStreak(days, TODAY, [1, 2, 3, 4, 5]).current).toBe(5);
    days.delete("2026-10-13");
    expect(computeStreak(days, TODAY, [1, 2, 3, 4, 5]).current).toBe(2);
    // Avec le samedi travaillé, le week-end vide casse la série.
    expect(computeStreak(new Set(["2026-10-09", "2026-10-12"]), "2026-10-12", [1, 2, 3, 4, 5, 6]).current).toBe(1);
  });

  it("une semaine rigoureuse exige au moins 3 suivis, tous réalisés à temps", () => {
    const d = emptyData();
    const t = (due: string, done: string | null) => mission(d, { type: "followup", dueDate: due, status: done ? "done" : "todo", completedAt: done ? `${done}T10:00:00.000Z` : null });
    d.tasks = [t("2026-10-05", "2026-10-05"), t("2026-10-06", "2026-10-06"), t("2026-10-07", "2026-10-07")];
    expect(rigorousWeeks(d, TODAY).map((w) => w.key)).toEqual(["2026-W41"]);
    d.tasks.push(t("2026-10-08", "2026-10-09")); // en retard
    expect(rigorousWeeks(d, TODAY)).toHaveLength(0);
  });
});

describe("statistiques", () => {
  it("le taux de conversion n'inclut au dénominateur que les opportunités clôturées", () => {
    let d = emptyData();
    d.clients = [client()];
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const o = ok(execute(d, C.createOpportunity, { ...OPPORTUNITY_INPUT, name: `Deal ${i}` }, ctx()));
      d = o.data;
      ids.push(o.result.id);
    }
    d = ok(execute(d, C.moveOpportunity, { id: ids[0]!, stage: "won" }, ctx())).data;
    d = ok(execute(d, C.moveOpportunity, { id: ids[1]!, stage: "lost" }, ctx())).data;
    d = ok(execute(d, C.moveOpportunity, { id: ids[2]!, stage: "won" }, ctx())).data;
    const s = computeCrmStats(d, TODAY, { period: { start: "2026-10-01", end: "2026-10-31" }, ownerId: null, source: null, stage: null });
    expect(s.kpis.conversions.value).toBe(2);
    expect(s.kpis.conversionRate.value).toBeCloseTo(66.7, 1);
    expect(s.kpis.activeOpportunities.value).toBe(1);
    expect(s.kpis.pipelineValue.value).toBe(100_000);
  });
});

describe("gamification CRM (anti-abus)", () => {
  it("plafonne l'XP des appels par jour et ignore les appels sans résumé", () => {
    let d = withProspect().data;
    d.settings.crm.dailyCallXpCap = 2;
    const contactId = d.contacts[0]!.id;
    for (let i = 0; i < 4; i++) d = ok(execute(d, C.logInteraction, interaction({ contactId, subject: `Appel ${i}` }), ctx())).data;
    d = ok(execute(d, C.logInteraction, interaction({ contactId, subject: "Sans résumé", outcome: "", notes: "" }), ctx())).data;
    expect(d.xpTransactions.filter((x) => x.idempotencyKey.startsWith("call:"))).toHaveLength(2);
  });

  it("une mission non rattachée ne rapporte pas d'XP ; une conversion n'est récompensée qu'une fois", () => {
    const { data, opportunity } = withProspect();
    const lonely = mission(data, { clientId: null, status: "done", completedAt: NOW });
    const r = finalize({ ...data, tasks: [...data.tasks, lonely] }, { now: NOW, today: TODAY }).data;
    expect(r.xpTransactions.some((x) => x.idempotencyKey === `task:${lonely.id}`)).toBe(false);
    let d = ok(execute(r, C.moveOpportunity, { id: opportunity.id, stage: "won" }, ctx())).data;
    d = ok(execute(d, C.moveOpportunity, { id: opportunity.id, stage: "negotiation" }, ctx())).data;
    d = ok(execute(d, C.moveOpportunity, { id: opportunity.id, stage: "won" }, ctx())).data;
    expect(d.xpTransactions.filter((x) => x.idempotencyKey === `opportunity:${opportunity.id}`)).toHaveLength(1);
  });

  it("une fiche contact incomplète ne rapporte rien ; complète, une seule fois", () => {
    const empty = ok(execute(emptyData(), C.createProspect, { ...PROSPECT, phone: "", stage: null, nextAction: null }, ctx())).data;
    expect(empty.xpTransactions.some((x) => x.idempotencyKey.startsWith("contact-complete:"))).toBe(false);
    const full = withProspect().data;
    expect(full.xpTransactions.filter((x) => x.idempotencyKey.startsWith("contact-complete:"))).toHaveLength(1);
  });
});

describe("actions groupées", () => {
  it("met à jour responsable, priorité et archivage d'une sélection, sans suppression", () => {
    let d = withProspect().data;
    d = ok(execute(d, C.createProspect, { ...PROSPECT, firstName: "Paul", email: "paul@beta.example", newCompanyName: "Beta", stage: null, nextAction: null }, ctx())).data;
    const ids = d.contacts.map((c) => c.id);
    d.employees = [{ id: "emp_x", firstName: "X", lastName: "Y" } as AppData["employees"][number]];
    const res = ok(execute(d, C.bulkUpdateContacts, { ids, ownerId: "emp_x", priority: "high" }, ctx()));
    expect(res.data.contacts.every((c) => c.ownerId === "emp_x" && c.priority === "high")).toBe(true);
    const archived = ok(execute(res.data, C.bulkUpdateContacts, { ids, archived: true }, ctx()));
    expect(archived.data.contacts).toHaveLength(2);
    expect(archived.data.contacts.every((c) => c.relation === "archived" && c.archivedAt)).toBe(true);
    expect(execute(d, C.bulkUpdateContacts, { ids: [] }, ctx()).ok).toBe(false);
  });
});

describe("migration v2 → v3", () => {
  it("convertit prospects, étapes et activités planifiées sans perte, de façon idempotente", () => {
    const d = emptyData() as unknown as Record<string, unknown> & AppData;
    d.settings.demo.version = 2;
    d.clients = [{ id: "cli_1", name: "NovaTest", sector: "", status: "active", city: "", website: "", satisfaction: null, notes: "", documents: [], createdAt: NOW, updatedAt: NOW } as never];
    d.leads = [
      {
        id: "lead_9",
        company: "Helios",
        contactName: "Margaux Rivière",
        email: "m@helios.example",
        phone: "",
        sector: "Énergie",
        source: "Salon",
        priority: "high",
        status: "contacted",
        nextAction: "Rappeler Margaux",
        nextActionDate: "2026-10-18",
        convertedClientId: null,
        notes: "",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    d.opportunities = [
      { ...OPPORTUNITY_INPUT, id: "opp_1", clientId: null, leadId: "lead_9", stage: "meeting", lastInteractionAt: NOW, closedAt: null, lostReason: "", createdAt: NOW, updatedAt: NOW } as never,
      { ...OPPORTUNITY_INPUT, id: "opp_2", stage: "qualification", lastInteractionAt: NOW, closedAt: null, lostReason: "", createdAt: NOW, updatedAt: NOW } as never,
    ];
    d.salesActivities = [
      {
        id: "act_1",
        type: "call",
        date: "2026-10-20T08:30:00.000Z",
        subject: "Appel prévu",
        notes: "",
        done: false,
        clientId: "cli_1",
        leadId: null,
        opportunityId: null,
        invoiceId: null,
        ownerId: null,
        createdAt: NOW,
      } as never,
    ];
    d.tasks = [
      {
        id: "tsk_1",
        title: "Tâche",
        description: "",
        assigneeId: null,
        priority: "normal",
        status: "todo",
        complexity: "simple",
        dueDate: null,
        estimateHours: 0,
        actualHours: 0,
        projectId: null,
        clientId: null,
        goalId: null,
        dependsOn: [],
        comments: [],
        recurrence: "none",
        completedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      } as never,
    ];
    const m = migrateData(d, TODAY);
    expect(m.settings.demo.version).toBe(3);
    expect(m.leads).toEqual([]);
    const helios = m.clients.find((c) => c.name === "Helios")!;
    expect(helios.relation).toBe("prospect");
    expect(m.contacts.find((c) => c.clientId === helios.id)).toMatchObject({ firstName: "Margaux", lastName: "Rivière", relation: "prospect" });
    expect(m.opportunities.find((o) => o.id === "opp_1")).toMatchObject({ stage: "discussion", clientId: helios.id });
    expect(m.opportunities.find((o) => o.id === "opp_2")!.stage).toBe("qualify");
    expect(m.tasks.find((t) => t.id === "tsk_1")!.type).toBe("internal");
    expect(m.tasks.some((t) => t.title === "Rappeler Margaux" && t.dueDate === "2026-10-18")).toBe(true);
    const planned = m.tasks.find((t) => t.id === "tsk_mig_act_1")!;
    expect(planned).toMatchObject({ type: "call", dueDate: "2026-10-20", dueTime: "10:30" });
    expect(m.salesActivities.some((a) => a.id === "act_1")).toBe(false);
    expect(m.settings.crm.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(migrateData(m, TODAY)).toEqual(m);
  });
});
