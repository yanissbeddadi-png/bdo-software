import type { AppData, Client, Contact, CrmTaskType, DocumentLink, Opportunity, OpportunityStage, Priority, SalesActivity, Task } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import {
  clientSchema,
  completeMissionSchema,
  contactSchema,
  opportunitySchema,
  prospectSchema,
  salesActivitySchema,
  type ClientInput,
  type CompleteMissionInput,
  type ContactInput,
  type OpportunityInput,
  type ProspectInput,
  type SalesActivityInput,
} from "@/lib/validation/schemas";
import { QUALIFIED_STAGES, STAGES, STAGE_LABELS } from "@/lib/calculations/pipeline";
import { addDays } from "@/lib/calculations/dates";
import { describeDuplicates, findContactDuplicates } from "@/lib/crm/duplicates";
import { activityLabel } from "@/lib/crm/model";
import { can } from "@/lib/permissions";
import { activity, assertCan, audit, DomainError, findOrThrow, normalize, parse, replace, type Command, type CommandContext } from "./core";

/**
 * Commandes du CRM : entreprises, contacts / prospects, opportunités, interactions,
 * missions (actions à réaliser) et notes. Chaque commande revalide son entrée et
 * journalise les changements importants ; les effets de bord sont explicites.
 */

/* ----------------------------- Utilitaires ----------------------------- */

export interface PlannedAction {
  title: string;
  type: CrmTaskType;
  dueDate: string;
  dueTime: string | null;
}

/** Construit une mission CRM (les champs de gestion de projet prennent leurs valeurs neutres). */
export function buildMission(ctx: CommandContext, fields: Partial<Task> & Pick<Task, "title" | "type"> & { dueDate: string | null }): Task {
  return {
    id: newId("tsk"),
    description: "",
    contactId: null,
    opportunityId: null,
    clientId: null,
    dueTime: null,
    result: "",
    assigneeId: ctx.user.employeeId ?? null,
    priority: "normal",
    status: "todo",
    complexity: "simple",
    estimateHours: 0,
    actualHours: 0,
    projectId: null,
    goalId: null,
    dependsOn: [],
    comments: [],
    recurrence: "none",
    completedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    ...fields,
  };
}

function buildInteraction(ctx: CommandContext, fields: Partial<SalesActivity> & Pick<SalesActivity, "type" | "subject">): SalesActivity {
  return {
    id: newId("sa"),
    date: ctx.now,
    notes: "",
    clientId: null,
    leadId: null,
    opportunityId: null,
    invoiceId: null,
    ownerId: ctx.user.employeeId ?? null,
    contactId: null,
    direction: null,
    outcome: "",
    nextStep: "",
    taskId: null,
    done: true,
    createdAt: ctx.now,
    ...fields,
  };
}

/** Met à jour la date de dernière interaction de l'opportunité (jamais vers le passé). */
function touchOpportunity(opps: Opportunity[], id: string | null, at: string, now: string): Opportunity[] {
  if (!id) return opps;
  return opps.map((o) => (o.id === id && at > o.lastInteractionAt ? { ...o, lastInteractionAt: at, updatedAt: now } : o));
}

/* ----------------------------- Entreprises ----------------------------- */

export const createClient: Command<ClientInput, Client> = (data, input, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(clientSchema, input);
  if (data.clients.some((c) => normalize(c.name) === normalize(v.name))) throw new DomainError(`Une entreprise nommée « ${v.name} » existe déjà.`, { name: "Doublon" });
  const client: Client = { id: newId("cli"), ...v, documents: [], createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, clients: [...data.clients, client] };
  next = activity(next, ctx, "client_created", `Entreprise ${client.name} ajoutée`, { type: "client", id: client.id });
  return { data: next, result: client, message: `Entreprise « ${client.name} » créée.` };
};

export const updateClient: Command<{ id: string; values: ClientInput }, Client> = (data, { id, values }, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(clientSchema, values);
  const current = findOrThrow(data.clients, id, "Entreprise");
  if (data.clients.some((c) => c.id !== id && normalize(c.name) === normalize(v.name))) throw new DomainError(`Une entreprise nommée « ${v.name} » existe déjà.`, { name: "Doublon" });
  const client: Client = { ...current, ...v, updatedAt: ctx.now };
  let next = { ...data, clients: replace(data.clients, client) };
  next = activity(next, ctx, "client_updated", `Fiche entreprise ${client.name} mise à jour`, { type: "client", id });
  if (current.relation !== client.relation) next = audit(next, ctx, "company.relation", { type: "client", id }, `${current.relation} → ${client.relation}`);
  return { data: next, result: client, message: "Entreprise mise à jour." };
};

/** Suppression contrôlée : interdite si des pièces, projets, contacts ou opportunités sont rattachés. */
export const deleteClient: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "clients.write");
  const client = findOrThrow(data.clients, id, "Entreprise");
  const linked =
    data.invoices.some((i) => i.clientId === id) ||
    data.quotes.some((q) => q.clientId === id) ||
    data.projects.some((p) => p.clientId === id) ||
    data.subscriptions.some((s) => s.clientId === id) ||
    data.opportunities.some((o) => o.clientId === id) ||
    data.salesActivities.some((a) => a.clientId === id);
  if (linked) throw new DomainError("Cette entreprise possède un historique (opportunités, interactions, pièces) : archivez-la plutôt pour le préserver.");
  let next: AppData = {
    ...data,
    clients: data.clients.filter((c) => c.id !== id),
    contacts: data.contacts.map((c) => (c.clientId === id ? { ...c, clientId: null, updatedAt: ctx.now } : c)),
    tasks: data.tasks.map((t) => (t.clientId === id ? { ...t, clientId: null } : t)),
    notes: data.notes.map((n) => (n.clientId === id ? { ...n, clientId: null } : n)),
  };
  next = audit(next, ctx, "company.delete", { type: "client", id }, client.name);
  return { data: next, result: undefined, message: `Entreprise « ${client.name} » supprimée.` };
};

export const addClientDocument: Command<{ clientId: string; name: string; kind: string }> = (data, { clientId, name, kind }, ctx) => {
  assertCan(ctx, "clients.write");
  const client = findOrThrow(data.clients, clientId, "Entreprise");
  if (!name.trim()) throw new DomainError("Le nom du document est obligatoire.");
  const updated: Client = { ...client, documents: [...client.documents, { id: newId("doc"), name: name.trim(), kind, addedAt: ctx.now }], updatedAt: ctx.now };
  return { data: { ...data, clients: replace(data.clients, updated) }, result: undefined, message: "Référence de document ajoutée." };
};

/* ----------------------------- Contacts et prospects ----------------------------- */

function applyPrimary(contacts: Contact[], contact: Contact): Contact[] {
  if (!contact.isPrimary || !contact.clientId) return contacts;
  return contacts.map((c) => (c.id !== contact.id && c.clientId === contact.clientId ? { ...c, isPrimary: false } : c));
}

function assertNoDuplicate(data: AppData, v: { email: string; firstName: string; lastName: string; clientId: string | null }, confirmed: boolean, exceptId?: string) {
  if (confirmed) return;
  const matches = findContactDuplicates(data, v, exceptId);
  if (matches.length) throw new DomainError(`Doublon probable : ${describeDuplicates(matches)}. Confirmez pour créer quand même la fiche.`, { duplicate: "confirm" });
}

/**
 * Création d'un contact ou d'un prospect en une étape : entreprise existante ou nouvelle,
 * opportunité facultative à l'étape choisie, note initiale et prochaine action (mission).
 */
export const createProspect: Command<ProspectInput, { contact: Contact; company: Client | null; opportunity: Opportunity | null }> = (data, input, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(prospectSchema, input);
  if (v.stage) assertCan(ctx, "crm.write");
  let next: AppData = data;
  let company: Client | null = v.clientId ? findOrThrow(data.clients, v.clientId, "Entreprise") : null;
  const newName = v.newCompanyName.trim();
  if (!company && newName) {
    company = data.clients.find((c) => normalize(c.name) === normalize(newName)) ?? null;
    if (!company) {
      company = {
        id: newId("cli"),
        name: newName,
        sector: "",
        status: "active",
        relation: v.relation === "customer" ? "customer" : v.relation === "partner" ? "partner" : "prospect",
        size: "",
        city: "",
        country: "France",
        website: "",
        ownerId: v.ownerId,
        source: v.source,
        satisfaction: null,
        notes: "",
        documents: [],
        createdAt: ctx.now,
        updatedAt: ctx.now,
      };
      next = { ...next, clients: [...next.clients, company] };
      next = activity(next, ctx, "client_created", `Entreprise ${company.name} ajoutée`, { type: "client", id: company.id });
    }
  }
  assertNoDuplicate(next, { ...v, clientId: company?.id ?? null }, v.confirmDuplicate);

  const contact: Contact = {
    id: newId("con"),
    clientId: company?.id ?? null,
    leadId: null,
    firstName: v.firstName,
    lastName: v.lastName,
    jobTitle: v.jobTitle,
    email: v.email,
    phone: v.phone,
    relation: v.relation,
    ownerId: v.ownerId,
    source: v.source,
    priority: v.priority,
    links: [],
    archivedAt: null,
    isPrimary: !!company && !next.contacts.some((c) => c.clientId === company!.id),
    notes: "",
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  next = { ...next, contacts: [...next.contacts, contact] };
  next = activity(next, ctx, "contact_created", `Contact ${contact.firstName} ${contact.lastName} ajouté${company ? ` (${company.name})` : ""}`, { type: "contact", id: contact.id });

  let opportunity: Opportunity | null = null;
  if (v.stage) {
    const def = STAGES.find((s) => s.id === v.stage)!;
    const final = v.stage === "won" || v.stage === "lost";
    opportunity = {
      id: newId("opp"),
      name: v.opportunityName.trim() || `${company?.name ?? `${contact.firstName} ${contact.lastName}`} — nouvelle opportunité`,
      clientId: company?.id ?? null,
      leadId: null,
      contactId: contact.id,
      amount: v.amount,
      probability: def.defaultProbability,
      stage: v.stage,
      expectedCloseDate: addDays(ctx.today, 60),
      source: v.source,
      ownerId: v.ownerId,
      lastInteractionAt: ctx.now,
      nextAction: "",
      notes: "",
      closedAt: final ? ctx.now : null,
      lostReason: "",
      priority: v.priority,
      qualifiedAt: QUALIFIED_STAGES.includes(v.stage) ? ctx.now : null,
      archivedAt: null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    next = { ...next, opportunities: [...next.opportunities, opportunity] };
    next = activity(next, ctx, "opportunity_created", `Opportunité ${opportunity.name} créée`, { type: "opportunity", id: opportunity.id });
  }
  if (v.notes.trim()) {
    next = {
      ...next,
      notes: [
        ...next.notes,
        {
          id: newId("note"),
          title: "Note initiale",
          body: v.notes.trim(),
          clientId: company?.id ?? null,
          projectId: null,
          contactId: contact.id,
          opportunityId: opportunity?.id ?? null,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        },
      ],
    };
  }
  if (v.nextAction) {
    const task = buildMission(ctx, {
      ...v.nextAction,
      contactId: contact.id,
      clientId: company?.id ?? null,
      opportunityId: opportunity?.id ?? null,
      priority: v.priority,
      assigneeId: v.ownerId ?? ctx.user.employeeId ?? null,
    });
    next = { ...next, tasks: [...next.tasks, task] };
  }
  next = audit(next, ctx, "contact.create", { type: "contact", id: contact.id }, `${contact.firstName} ${contact.lastName}`);
  const hint = v.nextAction ? "" : " Pensez à planifier la prochaine action.";
  return { data: next, result: { contact, company, opportunity }, message: `${contact.firstName} ${contact.lastName} ajouté(e).${hint}` };
};

/** Ajout simple d'un contact à une entreprise existante (fiche entreprise). */
export const createContact: Command<ContactInput & { confirmDuplicate?: boolean }, Contact> = (data, input, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(contactSchema, input);
  assertNoDuplicate(data, v, !!input.confirmDuplicate);
  const contact: Contact = { id: newId("con"), ...v, leadId: null, links: [], archivedAt: null, createdAt: ctx.now, updatedAt: ctx.now };
  let next: AppData = { ...data, contacts: applyPrimary([...data.contacts, contact], contact) };
  next = activity(next, ctx, "contact_created", `Contact ${contact.firstName} ${contact.lastName} ajouté`, { type: "contact", id: contact.id });
  return { data: next, result: contact, message: `Contact ${contact.firstName} ${contact.lastName} ajouté.` };
};

export const updateContact: Command<{ id: string; values: ContactInput; confirmDuplicate?: boolean }, Contact> = (data, { id, values, confirmDuplicate }, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(contactSchema, values);
  const current = findOrThrow(data.contacts, id, "Contact");
  if (v.email.toLowerCase() !== current.email.toLowerCase() || v.clientId !== current.clientId) assertNoDuplicate(data, v, !!confirmDuplicate, id);
  const contact: Contact = { ...current, ...v, archivedAt: v.relation === "archived" ? (current.archivedAt ?? ctx.now) : null, updatedAt: ctx.now };
  let next: AppData = { ...data, contacts: applyPrimary(replace(data.contacts, contact), contact) };
  const changed = (["relation", "ownerId", "priority", "clientId"] as const).filter((k) => current[k] !== contact[k]);
  if (changed.length) next = audit(next, ctx, "contact.update", { type: "contact", id }, changed.map((k) => `${k} : ${current[k] ?? "—"} → ${contact[k] ?? "—"}`).join(" · "));
  return { data: next, result: contact, message: "Contact mis à jour." };
};

export const archiveContact: Command<{ id: string; archived: boolean }, Contact> = (data, { id, archived }, ctx) => {
  assertCan(ctx, "clients.write");
  const current = findOrThrow(data.contacts, id, "Contact");
  const hasHistory = data.salesActivities.some((a) => a.contactId === id) || data.opportunities.some((o) => o.contactId === id && o.stage === "won");
  const contact: Contact = {
    ...current,
    relation: archived ? "archived" : hasHistory && current.relation === "archived" ? "former" : current.relation === "archived" ? "prospect" : current.relation,
    archivedAt: archived ? ctx.now : null,
    updatedAt: ctx.now,
  };
  let next: AppData = { ...data, contacts: replace(data.contacts, contact) };
  next = audit(next, ctx, archived ? "contact.archive" : "contact.restore", { type: "contact", id }, `${contact.firstName} ${contact.lastName}`);
  return { data: next, result: contact, message: archived ? "Contact archivé (historique conservé)." : "Contact restauré." };
};

/**
 * Actions groupées sûres sur une sélection de contacts : responsable, priorité,
 * archivage / restauration. Aucune suppression groupée. Une seule entrée d'audit.
 */
export const bulkUpdateContacts: Command<{ ids: string[]; ownerId?: string | null; priority?: Priority; archived?: boolean }, number> = (data, input, ctx) => {
  assertCan(ctx, "clients.write");
  const ids = [...new Set(input.ids)];
  if (!ids.length) throw new DomainError("Aucun contact sélectionné.");
  if (ids.length > 500) throw new DomainError("500 contacts maximum par action groupée.");
  if (input.ownerId && !data.employees.some((e) => e.id === input.ownerId)) throw new DomainError("Responsable introuvable.");
  if (input.priority && !["low", "normal", "high", "critical"].includes(input.priority)) throw new DomainError("Priorité invalide.");
  let next = data;
  for (const id of ids) {
    findOrThrow(next.contacts, id, "Contact");
    if (input.archived !== undefined) next = archiveContact(next, { id, archived: input.archived }, ctx).data;
    const current = findOrThrow(next.contacts, id, "Contact");
    const patch: Partial<Contact> = {};
    if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
    if (input.priority) patch.priority = input.priority;
    if (Object.keys(patch).length) next = { ...next, contacts: replace(next.contacts, { ...current, ...patch, updatedAt: ctx.now }) };
  }
  const what = [input.ownerId !== undefined && "responsable", input.priority && "priorité", input.archived === true && "archivage", input.archived === false && "restauration"]
    .filter(Boolean)
    .join(", ");
  next = audit(next, ctx, "contact.bulk", null, `${ids.length} contact(s) : ${what}`);
  return { data: next, result: ids.length, message: `${ids.length} contact(s) mis à jour (${what}).` };
};

/** Suppression définitive : les références sont détachées, l'historique des interactions est conservé. */
export const deleteContact: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "clients.write");
  const contact = findOrThrow(data.contacts, id, "Contact");
  let next: AppData = {
    ...data,
    contacts: data.contacts.filter((c) => c.id !== id),
    opportunities: data.opportunities.map((o) => (o.contactId === id ? { ...o, contactId: null } : o)),
    tasks: data.tasks.map((t) => (t.contactId === id ? { ...t, contactId: null } : t)),
    salesActivities: data.salesActivities.map((a) => (a.contactId === id ? { ...a, contactId: null } : a)),
    notes: data.notes.map((n) => (n.contactId === id ? { ...n, contactId: null } : n)),
  };
  next = audit(next, ctx, "contact.delete", { type: "contact", id }, `${contact.firstName} ${contact.lastName}`);
  return { data: next, result: undefined, message: "Contact supprimé." };
};

export const addContactLink: Command<{ contactId: string; name: string; url: string }, DocumentLink> = (data, { contactId, name, url }, ctx) => {
  assertCan(ctx, "clients.write");
  const contact = findOrThrow(data.contacts, contactId, "Contact");
  if (!name.trim()) throw new DomainError("Le nom du document est obligatoire.", { name: "Obligatoire" });
  if (url && !/^https?:\/\//i.test(url.trim())) throw new DomainError("L'adresse doit commencer par http:// ou https://", { url: "Adresse invalide" });
  const link: DocumentLink = { id: newId("lnk"), name: name.trim().slice(0, 200), url: url.trim().slice(0, 500), addedAt: ctx.now };
  return { data: { ...data, contacts: replace(data.contacts, { ...contact, links: [...contact.links, link], updatedAt: ctx.now }) }, result: link, message: "Document ajouté à la fiche." };
};

export const removeContactLink: Command<{ contactId: string; linkId: string }> = (data, { contactId, linkId }, ctx) => {
  assertCan(ctx, "clients.write");
  const contact = findOrThrow(data.contacts, contactId, "Contact");
  return {
    data: { ...data, contacts: replace(data.contacts, { ...contact, links: contact.links.filter((l) => l.id !== linkId), updatedAt: ctx.now }) },
    result: undefined,
    message: "Document retiré.",
  };
};

/* ----------------------------- Opportunités ----------------------------- */

export const createOpportunity: Command<OpportunityInput, Opportunity> = (data, input, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(opportunitySchema, input);
  const closed = v.stage === "won" || v.stage === "lost";
  const opp: Opportunity = {
    id: newId("opp"),
    ...v,
    leadId: null,
    lastInteractionAt: ctx.now,
    closedAt: closed ? ctx.now : null,
    lostReason: "",
    qualifiedAt: QUALIFIED_STAGES.includes(v.stage) ? ctx.now : null,
    archivedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  let next = { ...data, opportunities: [...data.opportunities, opp] };
  next = activity(next, ctx, "opportunity_created", `Opportunité ${opp.name} créée`, { type: "opportunity", id: opp.id });
  return { data: next, result: opp, message: `Opportunité « ${opp.name} » créée.` };
};

export const updateOpportunity: Command<{ id: string; values: OpportunityInput }, Opportunity> = (data, { id, values }, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(opportunitySchema, values);
  const current = findOrThrow(data.opportunities, id, "Opportunité");
  // Le changement d'étape passe par `moveOpportunity` (effets de bord et historique).
  const moved = v.stage !== current.stage ? moveOpportunity(data, { id, stage: v.stage }, ctx).data : data;
  const base = findOrThrow(moved.opportunities, id, "Opportunité");
  const opp: Opportunity = { ...base, ...v, leadId: base.leadId, probability: v.stage !== current.stage ? base.probability : v.probability, updatedAt: ctx.now };
  return { data: { ...moved, opportunities: replace(moved.opportunities, opp) }, result: opp, message: "Opportunité mise à jour." };
};

/**
 * Changement d'étape : probabilité par défaut, date de qualification (première fois),
 * date de clôture, interaction « changement d'étape » dans la timeline. Une opportunité
 * gagnée fait passer l'entreprise et le contact principal du statut prospect à client.
 */
export const moveOpportunity: Command<{ id: string; stage: OpportunityStage; lostReason?: string }, Opportunity> = (data, { id, stage, lostReason }, ctx) => {
  assertCan(ctx, "crm.write");
  const current = findOrThrow(data.opportunities, id, "Opportunité");
  if (!STAGES.some((s) => s.id === stage)) throw new DomainError("Étape inconnue.");
  if (current.stage === stage) return { data, result: current, message: "Aucun changement." };
  const def = STAGES.find((s) => s.id === stage)!;
  const final = stage === "won" || stage === "lost";
  const opp: Opportunity = {
    ...current,
    stage,
    probability: def.defaultProbability,
    lastInteractionAt: ctx.now,
    closedAt: final ? ctx.now : null,
    lostReason: stage === "lost" ? (lostReason ?? current.lostReason) : "",
    qualifiedAt: current.qualifiedAt ?? (QUALIFIED_STAGES.includes(stage) ? ctx.now : null),
    archivedAt: stage === "lost" ? current.archivedAt : null,
    updatedAt: ctx.now,
  };
  let next: AppData = { ...data, opportunities: replace(data.opportunities, opp) };
  if (stage === "won") {
    next = {
      ...next,
      clients: next.clients.map((c) => (c.id === opp.clientId && (c.relation === "prospect" || c.relation === "former") ? { ...c, relation: "customer", status: "active", updatedAt: ctx.now } : c)),
      contacts: next.contacts.map((c) => (c.id === opp.contactId && c.relation === "prospect" ? { ...c, relation: "customer", updatedAt: ctx.now } : c)),
    };
  }
  const subject = `${STAGE_LABELS[current.stage]} → ${STAGE_LABELS[stage]}`;
  next = {
    ...next,
    salesActivities: [
      ...next.salesActivities,
      buildInteraction(ctx, {
        type: "stage_change",
        subject: `${opp.name} : ${subject}`,
        outcome: stage === "lost" && opp.lostReason ? `Motif : ${opp.lostReason}` : "",
        contactId: opp.contactId,
        clientId: opp.clientId,
        opportunityId: opp.id,
      }),
    ],
  };
  const type = stage === "won" ? "opportunity_won" : stage === "lost" ? "opportunity_lost" : "opportunity_stage";
  next = activity(next, ctx, type, stage === "won" ? `Opportunité ${opp.name} gagnée` : stage === "lost" ? `Opportunité ${opp.name} perdue` : `${opp.name} → ${STAGE_LABELS[stage]}`, {
    type: "opportunity",
    id,
  });
  next = audit(next, ctx, "opportunity.stage", { type: "opportunity", id }, subject);
  return { data: next, result: opp, message: `« ${opp.name} » → ${STAGE_LABELS[stage]}.` };
};

export const archiveOpportunity: Command<{ id: string; archived: boolean; reason?: string }, Opportunity> = (data, { id, archived, reason }, ctx) => {
  assertCan(ctx, "crm.write");
  const current = findOrThrow(data.opportunities, id, "Opportunité");
  const opp: Opportunity = {
    ...current,
    archivedAt: archived ? ctx.now : null,
    lostReason: archived && reason ? reason : current.lostReason,
    updatedAt: ctx.now,
  };
  let next: AppData = { ...data, opportunities: replace(data.opportunities, opp) };
  next = audit(next, ctx, archived ? "opportunity.archive" : "opportunity.restore", { type: "opportunity", id }, opp.name);
  return { data: next, result: opp, message: archived ? "Opportunité archivée." : "Opportunité restaurée." };
};

export const deleteOpportunity: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  const opp = findOrThrow(data.opportunities, id, "Opportunité");
  let next: AppData = {
    ...data,
    opportunities: data.opportunities.filter((o) => o.id !== id),
    projects: data.projects.map((p) => (p.opportunityId === id ? { ...p, opportunityId: null } : p)),
    quotes: data.quotes.map((q) => (q.opportunityId === id ? { ...q, opportunityId: null } : q)),
    salesActivities: data.salesActivities.map((a) => (a.opportunityId === id ? { ...a, opportunityId: null } : a)),
    tasks: data.tasks.map((t) => (t.opportunityId === id ? { ...t, opportunityId: null } : t)),
    notes: data.notes.map((n) => (n.opportunityId === id ? { ...n, opportunityId: null } : n)),
  };
  next = audit(next, ctx, "opportunity.delete", { type: "opportunity", id }, opp.name);
  return { data: next, result: undefined, message: "Opportunité supprimée." };
};

/* ----------------------------- Interactions ----------------------------- */

/**
 * Consigne une interaction (fait passé : aucun e-mail n'est envoyé, aucun appel n'est
 * passé par l'application). Peut terminer la mission qu'elle réalise (ex. relance) et
 * planifier la suite. N'a jamais d'effet sur l'étape commerciale.
 */
export const logInteraction: Command<SalesActivityInput, SalesActivity> = (data, input, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(salesActivitySchema, input);
  if (v.date.slice(0, 10) > ctx.today) throw new DomainError("Une interaction consignée ne peut pas être datée dans le futur : planifiez plutôt une mission.", { date: "Date future" });
  const contact = v.contactId ? findOrThrow(data.contacts, v.contactId, "Contact") : null;
  const opp = v.opportunityId ? findOrThrow(data.opportunities, v.opportunityId, "Opportunité") : null;
  const clientId = v.clientId ?? contact?.clientId ?? opp?.clientId ?? null;
  const act = buildInteraction(ctx, {
    type: v.type,
    direction: v.type === "call" || v.type === "email" || v.type === "message" ? (v.direction ?? "out") : null,
    date: v.date.length === 10 ? `${v.date}T${ctx.now.slice(11)}` : v.date,
    subject: v.subject,
    notes: v.notes,
    outcome: v.outcome,
    nextStep: v.nextStep,
    contactId: contact?.id ?? null,
    clientId,
    opportunityId: opp?.id ?? null,
    ownerId: v.ownerId ?? ctx.user.employeeId ?? null,
    taskId: v.taskId,
  });
  let next: AppData = { ...data, salesActivities: [...data.salesActivities, act], opportunities: touchOpportunity(data.opportunities, act.opportunityId, act.date, ctx.now) };
  let message = `${activityLabel(act)} consigné(e).`;
  if (v.taskId) {
    const task = findOrThrow(next.tasks, v.taskId, "Mission");
    if (task.status !== "done" && task.status !== "cancelled") {
      next = { ...next, tasks: replace(next.tasks, { ...task, status: "done", result: v.outcome || v.subject, completedAt: ctx.now, updatedAt: ctx.now }) };
      next = activity(next, ctx, "task_completed", `Mission « ${task.title} » terminée`, { type: "task", id: task.id });
      message += " Mission terminée.";
    }
  }
  if (v.followUp) {
    assertCan(ctx, "tasks.write");
    const follow = buildMission(ctx, { ...v.followUp, contactId: act.contactId, clientId, opportunityId: act.opportunityId, priority: contact?.priority ?? "normal" });
    next = { ...next, tasks: [...next.tasks, follow] };
    message += ` Prochaine action planifiée le ${v.followUp.dueDate.split("-").reverse().join("/")}.`;
  }
  next = activity(
    next,
    ctx,
    "interaction_logged",
    `${activityLabel(act)} : ${act.subject}`,
    act.contactId ? { type: "contact", id: act.contactId } : act.clientId ? { type: "client", id: act.clientId } : null,
  );
  return { data: next, result: act, message };
};

/** Relance d'une facture (module historique) : consigne l'action, aucun e-mail n'est envoyé. */
export const logInvoiceFollowUp: Command<{ invoiceId: string; notes: string }, SalesActivity> = (data, { invoiceId, notes }, ctx) => {
  const invoice = findOrThrow(data.invoices, invoiceId, "Facture");
  if (!can(ctx.user.role, "crm.write") && !can(ctx.user.role, "invoices.write")) throw new DomainError("Action non autorisée pour ce rôle.");
  const act = buildInteraction(ctx, { type: "followup", subject: `Relance facture ${invoice.number}`, notes, clientId: invoice.clientId, invoiceId, ownerId: null });
  return { data: { ...data, salesActivities: [...data.salesActivities, act] }, result: act, message: "Relance consignée (aucun e-mail n'a été envoyé)." };
};

export const deleteInteraction: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  const act = findOrThrow(data.salesActivities, id, "Interaction");
  if (act.type === "stage_change" || act.type === "task_done") throw new DomainError("Les événements générés par le CRM font partie de l'historique et ne peuvent pas être supprimés.");
  let next: AppData = { ...data, salesActivities: data.salesActivities.filter((a) => a.id !== id) };
  next = audit(next, ctx, "interaction.delete", act.contactId ? { type: "contact", id: act.contactId } : null, act.subject);
  return { data: next, result: undefined, message: "Interaction supprimée." };
};

/* ----------------------------- Missions (actions à réaliser) ----------------------------- */

/** Planifie une action (relance, appel, rendez-vous…) : c'est une mission CRM. */
export const scheduleAction: Command<PlannedAction & { contactId: string | null; clientId: string | null; opportunityId: string | null; priority?: Priority; description?: string }, Task> = (
  data,
  input,
  ctx,
) => {
  assertCan(ctx, "tasks.write");
  if (!input.title.trim()) throw new DomainError("Le titre est obligatoire.", { title: "Obligatoire" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new DomainError("Date invalide.", { dueDate: "Date invalide" });
  if (input.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) throw new DomainError("Heure invalide (HH:mm).", { dueTime: "Heure invalide" });
  if (!input.contactId && !input.clientId && !input.opportunityId) throw new DomainError("Associez l'action à un contact, une entreprise ou une opportunité.", { contactId: "Obligatoire" });
  const contact = input.contactId ? findOrThrow(data.contacts, input.contactId, "Contact") : null;
  const task = buildMission(ctx, {
    title: input.title.trim().slice(0, 200),
    type: input.type,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    description: (input.description ?? "").slice(0, 2000),
    contactId: contact?.id ?? null,
    clientId: input.clientId ?? contact?.clientId ?? null,
    opportunityId: input.opportunityId,
    priority: input.priority ?? contact?.priority ?? "normal",
  });
  let next: AppData = { ...data, tasks: [...data.tasks, task] };
  next = activity(next, ctx, "task_created", `Action planifiée : ${task.title}`, { type: "task", id: task.id });
  return { data: next, result: task, message: `Action planifiée le ${task.dueDate!.split("-").reverse().join("/")}${task.dueTime ? ` à ${task.dueTime}` : ""}.` };
};

/**
 * Réalisation d'une mission : résultat, date de réalisation, événement « mission terminée »
 * dans la timeline, note facultative et prochaine action. L'étape commerciale n'est
 * jamais modifiée. La mission reste dans l'historique.
 */
export const completeMission: Command<CompleteMissionInput, Task> = (data, input, ctx) => {
  assertCan(ctx, "tasks.write");
  const v = parse(completeMissionSchema, input);
  const current = findOrThrow(data.tasks, v.id, "Mission");
  if (current.status === "done") throw new DomainError("Cette mission est déjà terminée.");
  if (current.status === "cancelled") throw new DomainError("Cette mission est annulée.");
  if ((current.type === "meeting" || current.type === "call") && !v.result.trim()) throw new DomainError("Indiquez le résultat de l'échange.", { result: "Obligatoire" });
  const task: Task = { ...current, status: "done", result: v.result.trim(), completedAt: ctx.now, updatedAt: ctx.now };
  let next: AppData = { ...data, tasks: replace(data.tasks, task) };
  next = {
    ...next,
    salesActivities: [
      ...next.salesActivities,
      buildInteraction(ctx, {
        type: "task_done",
        subject: task.title,
        outcome: task.result,
        notes: v.note.trim(),
        contactId: task.contactId,
        clientId: task.clientId,
        opportunityId: task.opportunityId,
        taskId: task.id,
      }),
    ],
    opportunities: touchOpportunity(next.opportunities, task.opportunityId, ctx.now, ctx.now),
  };
  if (v.note.trim()) {
    next = {
      ...next,
      notes: [
        ...next.notes,
        {
          id: newId("note"),
          title: `Compte rendu — ${task.title}`.slice(0, 200),
          body: v.note.trim(),
          clientId: task.clientId,
          projectId: null,
          contactId: task.contactId,
          opportunityId: task.opportunityId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        },
      ],
    };
  }
  let message = "Mission terminée.";
  if (v.followUp) {
    const follow = buildMission(ctx, { ...v.followUp, contactId: task.contactId, clientId: task.clientId, opportunityId: task.opportunityId, priority: task.priority, assigneeId: task.assigneeId });
    next = { ...next, tasks: [...next.tasks, follow] };
    message += ` Prochaine action planifiée le ${v.followUp.dueDate.split("-").reverse().join("/")}.`;
  }
  next = activity(next, ctx, "task_completed", `Mission « ${task.title} » terminée`, { type: "task", id: task.id });
  return { data: next, result: task, message };
};

export const rescheduleMission: Command<{ id: string; dueDate: string; dueTime: string | null }, Task> = (data, { id, dueDate, dueTime }, ctx) => {
  assertCan(ctx, "tasks.write");
  const current = findOrThrow(data.tasks, id, "Mission");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new DomainError("Date invalide.");
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) throw new DomainError("Heure invalide (HH:mm).");
  if (current.status === "done" || current.status === "cancelled") throw new DomainError("Une mission terminée ou annulée ne peut pas être replanifiée.");
  const task: Task = { ...current, dueDate, dueTime, updatedAt: ctx.now };
  let next: AppData = { ...data, tasks: replace(data.tasks, task) };
  next = audit(next, ctx, "task.reschedule", { type: "task", id }, `${current.dueDate ?? "—"} → ${dueDate}${dueTime ? ` ${dueTime}` : ""}`);
  return { data: next, result: task, message: `Replanifiée au ${dueDate.split("-").reverse().join("/")}${dueTime ? ` à ${dueTime}` : ""}.` };
};
