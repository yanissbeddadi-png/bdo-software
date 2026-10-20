import type { AppData, Client, Contact, CrmTaskType, Mission, OpportunityStage, RelationType, SalesActivity, Task } from "@/lib/domain/types";
import { addMonths, startOfMonthISO } from "@/lib/calculations/dates";
import { localDateMinute, formatMinute } from "@/lib/calculations/office";
import { QUALIFIED_STAGES } from "@/lib/calculations/pipeline";
import { DEFAULT_BRANDING, DEFAULT_MODULES, DEFAULT_XP_REWARDS, SEED_VERSION, defaultCrmSettings } from "./seed";

/**
 * Migrations du jeu de données local. Les données de l'utilisateur sont conservées :
 * on ajoute uniquement les structures introduites par les versions suivantes.
 *
 * v1 → v2 : avoirs, remboursements, déclarations de TVA. Le suivi de TVA démarre au
 * mois précédent la migration (seule la dernière période complète est à déclarer :
 * l'historique antérieur n'est pas reconstitué artificiellement).
 *
 * v2 → v3 : réorientation CRM (voir CRM_REFACTOR_PLAN.md § 4) — entreprises (statut de
 * relation), conversion des prospects historiques en entreprises + contacts, nouvelles
 * étapes du pipeline, interactions planifiées converties en missions, champs CRM.
 */
export function migrateData(input: AppData, today: string): AppData {
  let data = input;
  const version = data.settings.demo.version ?? 1;
  if (version < 2) {
    const legacy = data as Partial<AppData> & AppData;
    data = {
      ...data,
      creditNotes: legacy.creditNotes ?? [],
      refunds: legacy.refunds ?? [],
      vatReturns: legacy.vatReturns ?? [],
      sequences: { ...data.sequences, creditNote: data.sequences.creditNote ?? 0 },
      settings: {
        ...data.settings,
        company: {
          ...data.settings.company,
          vatTrackingStart: data.settings.company.vatTrackingStart ?? addMonths(startOfMonthISO(today), -1),
          vatDueDay: data.settings.company.vatDueDay ?? 24,
        },
        demo: { ...data.settings.demo, version: 2 },
      },
    };
  }
  if ((data.settings.demo.version ?? 1) < 3) data = migrateToV3(data, today);
  if ((data.settings.demo.version ?? 1) < 4) data = migrateToV4(data);
  return data;
}

/**
 * v3 → v4 : espace configurable par client — identité visuelle (charte BDO conservée),
 * modules activables (tous actifs), libellés/probabilités des étapes et sources de contacts.
 */
export function migrateToV4(input: AppData): AppData {
  const s = input.settings as AppData["settings"] & Partial<Pick<AppData["settings"], "branding" | "modules">>;
  const defaults = defaultCrmSettings();
  const crm = s.crm as Partial<AppData["settings"]["crm"]>;
  return {
    ...input,
    settings: {
      ...input.settings,
      crm: { ...defaults, ...crm, stages: { ...defaults.stages, ...crm.stages }, sources: crm.sources?.length ? crm.sources : defaults.sources },
      branding: { ...DEFAULT_BRANDING, ...s.branding },
      modules: { ...DEFAULT_MODULES, ...s.modules },
      demo: { ...input.settings.demo, version: 4 },
    },
  };
}

/** Ancienne étape (v2) → nouvelle étape (v3). */
const STAGE_V3: Record<string, OpportunityStage> = {
  new: "new",
  contacted: "qualify",
  qualification: "qualify",
  meeting: "discussion",
  proposal: "proposal",
  negotiation: "negotiation",
  won: "won",
  lost: "lost",
};

const TASK_TYPE_FROM_ACTIVITY: Record<string, CrmTaskType> = { call: "call", email: "email", meeting: "meeting", demo: "meeting", followup: "followup", note: "other" };

/** Conditions de défis conservées après la réorientation CRM. */
const CRM_CONDITIONS = new Set(["manual", "opportunity_touched", "leads_created", "sales_activities_logged", "no_overdue_followups", "day_actions_done", "prospects_qualified", "interactions_logged"]);

export function migrateToV3(input: AppData, today: string): AppData {
  type Legacy = Record<string, unknown>;
  const now = `${today}T08:00:00.000Z`;
  const tz = input.settings.company.timezone ?? "Europe/Paris";
  const g = input.settings.gamification;

  // Entreprises.
  const clients: Client[] = input.clients.map((c) => {
    const l = c as unknown as Legacy;
    return {
      ...c,
      relation: (l.relation as RelationType) ?? (c.status === "churned" ? "former" : "customer"),
      size: (l.size as string) ?? "",
      country: (l.country as string) ?? "France",
      ownerId: (l.ownerId as string | null) ?? null,
      source: (l.source as string) ?? "",
    };
  });
  let contacts: Contact[] = input.contacts.map((c) => {
    const l = c as unknown as Legacy;
    const company = clients.find((x) => x.id === c.clientId);
    return {
      ...c,
      relation: (l.relation as RelationType) ?? company?.relation ?? "prospect",
      ownerId: (l.ownerId as string | null) ?? null,
      source: (l.source as string) ?? company?.source ?? "",
      priority: (l.priority as Contact["priority"]) ?? "normal",
      links: (l.links as Contact["links"]) ?? [],
      archivedAt: (l.archivedAt as string | null) ?? null,
    };
  });
  const tasks: Task[] = input.tasks.map((t) => {
    const l = t as unknown as Legacy;
    return {
      ...t,
      type: (l.type as CrmTaskType) ?? "internal",
      contactId: (l.contactId as string | null) ?? null,
      opportunityId: (l.opportunityId as string | null) ?? null,
      dueTime: (l.dueTime as string | null) ?? null,
      result: (l.result as string) ?? "",
    };
  });
  const migratedTask = (fields: Partial<Task> & Pick<Task, "id" | "title" | "type">): Task => ({
    description: "",
    contactId: null,
    opportunityId: null,
    dueTime: null,
    result: "",
    assigneeId: input.settings.user.employeeId ?? null,
    priority: "normal",
    status: "todo",
    complexity: "simple",
    dueDate: today,
    estimateHours: 0,
    actualHours: 0,
    projectId: null,
    clientId: null,
    goalId: null,
    dependsOn: [],
    comments: [],
    recurrence: "none",
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  });

  // Prospects historiques → entreprises « prospect » + contacts.
  const leadCompany = new Map<string, string>();
  for (const lead of input.leads ?? []) {
    let companyId = lead.convertedClientId ?? clients.find((c) => c.name.trim().toLowerCase() === lead.company.trim().toLowerCase())?.id ?? null;
    if (!companyId) {
      companyId = `cli_${lead.id.replace(/^lead_/, "")}`;
      while (clients.some((c) => c.id === companyId)) companyId += "_p";
      clients.push({
        id: companyId,
        name: lead.company,
        sector: lead.sector,
        status: "active",
        relation: lead.status === "unqualified" ? "archived" : "prospect",
        size: "",
        city: "",
        country: "France",
        website: "",
        ownerId: null,
        source: lead.source,
        satisfaction: null,
        notes: lead.notes,
        documents: [],
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      });
    }
    leadCompany.set(lead.id, companyId);
    const relation: RelationType = lead.status === "converted" ? "customer" : lead.status === "unqualified" ? "archived" : "prospect";
    contacts = contacts.map((c) => (c.leadId === lead.id && !c.clientId ? { ...c, clientId: companyId, relation, priority: lead.priority, source: lead.source } : c));
    if (!contacts.some((c) => c.leadId === lead.id || c.clientId === companyId) && lead.contactName) {
      const [firstName, ...rest] = lead.contactName.split(" ");
      contacts.push({
        id: `con_${lead.id.replace(/^lead_/, "")}_m`,
        clientId: companyId,
        leadId: lead.id,
        firstName: firstName ?? lead.contactName,
        lastName: rest.join(" ") || "—",
        jobTitle: "",
        email: lead.email,
        phone: lead.phone,
        relation,
        ownerId: null,
        source: lead.source,
        priority: lead.priority,
        links: [],
        archivedAt: relation === "archived" ? now : null,
        isPrimary: true,
        notes: lead.notes,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      });
    }
    if (lead.status !== "converted" && lead.status !== "unqualified" && lead.nextAction && lead.nextActionDate) {
      tasks.push(
        migratedTask({
          id: `tsk_mig_${lead.id}`,
          title: lead.nextAction,
          type: "followup",
          dueDate: lead.nextActionDate,
          clientId: companyId,
          contactId: contacts.find((c) => c.clientId === companyId)?.id ?? null,
          priority: lead.priority,
          description: "Prochaine action reprise du prospect historique.",
        }),
      );
    }
  }
  const primaryContact = (clientId: string | null) =>
    (clientId ? (contacts.find((c) => c.clientId === clientId && c.isPrimary) ?? contacts.find((c) => c.clientId === clientId))?.id : undefined) ?? null;

  // Opportunités.
  const opportunities = input.opportunities.map((o) => {
    const l = o as unknown as Legacy;
    const clientId = o.clientId ?? (o.leadId ? (leadCompany.get(o.leadId) ?? null) : null);
    const stage = STAGE_V3[o.stage as string] ?? "new";
    return {
      ...o,
      clientId,
      stage,
      contactId: o.contactId ?? primaryContact(clientId),
      priority: (l.priority as Task["priority"]) ?? "normal",
      qualifiedAt: (l.qualifiedAt as string | null) ?? (QUALIFIED_STAGES.includes(stage) ? o.updatedAt : null),
      archivedAt: (l.archivedAt as string | null) ?? null,
    };
  });
  for (const o of opportunities) {
    const open = o.stage !== "won" && o.stage !== "lost";
    if (open && o.nextAction.trim() && !tasks.some((t) => t.opportunityId === o.id && t.status !== "done" && t.status !== "cancelled")) {
      tasks.push(
        migratedTask({
          id: `tsk_mig_${o.id}`,
          title: o.nextAction.trim(),
          type: "sales_followup",
          opportunityId: o.id,
          clientId: o.clientId,
          contactId: o.contactId,
          description: "Prochaine action reprise du champ texte de l'opportunité : date à confirmer.",
        }),
      );
    }
  }

  // Interactions : les activités planifiées deviennent des missions.
  const salesActivities: SalesActivity[] = [];
  for (const a of input.salesActivities) {
    const l = a as unknown as Legacy;
    const clientId = a.clientId ?? (a.leadId ? (leadCompany.get(a.leadId) ?? null) : null);
    const contactId = (l.contactId as string | null) ?? opportunities.find((o) => o.id === a.opportunityId)?.contactId ?? primaryContact(clientId);
    if (a.done === false) {
      const local = localDateMinute(a.date, tz);
      tasks.push(
        migratedTask({
          id: `tsk_mig_${a.id}`,
          title: a.subject,
          type: TASK_TYPE_FROM_ACTIVITY[a.type] ?? "other",
          description: a.notes,
          dueDate: local.date,
          dueTime: formatMinute(local.minute),
          clientId,
          contactId,
          opportunityId: a.opportunityId,
          assigneeId: a.ownerId,
          createdAt: a.createdAt,
        }),
      );
      continue;
    }
    salesActivities.push({
      ...a,
      clientId,
      contactId,
      direction: (l.direction as SalesActivity["direction"]) ?? (a.type === "call" || a.type === "email" ? "out" : null),
      outcome: (l.outcome as string) ?? "",
      nextStep: (l.nextStep as string) ?? "",
      taskId: (l.taskId as string | null) ?? null,
      done: true,
    });
  }

  // Défis : seuls les défis CRM restent actifs (historique conservé).
  const missions: Mission[] = input.missions.map((m) =>
    m.status !== "done" && m.status !== "cancelled" && !CRM_CONDITIONS.has(m.condition.kind)
      ? { ...m, status: "cancelled", history: [...m.history, { at: now, text: "Défi clôturé : module hors du périmètre CRM (migration v3)." }] }
      : m,
  );

  return {
    ...input,
    clients,
    contacts,
    leads: [],
    opportunities,
    salesActivities,
    tasks,
    missions,
    notes: input.notes.map((n) => {
      const l = n as unknown as Legacy;
      return { ...n, contactId: (l.contactId as string | null) ?? null, opportunityId: (l.opportunityId as string | null) ?? null };
    }),
    settings: {
      ...input.settings,
      crm: { ...defaultCrmSettings(), ...((input.settings as unknown as Legacy).crm as object) },
      gamification: { ...g, xpRewards: { ...DEFAULT_XP_REWARDS, ...g.xpRewards } },
      // Les alertes des modules historiques (finances, projets, tâches internes) ne sont plus notifiées par défaut.
      notifications: { enabled: { ...input.settings.notifications.enabled, finance: false, projet: false, taches: false } },
      user: { ...input.settings.user, employeeId: input.settings.user.employeeId ?? null },
      demo: { ...input.settings.demo, version: 3 },
    },
  };
}

export function canMigrate(data: AppData): boolean {
  return (data.settings.demo.version ?? 1) <= SEED_VERSION;
}
