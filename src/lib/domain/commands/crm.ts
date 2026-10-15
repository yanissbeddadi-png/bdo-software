import type { Client, Contact, Lead, Opportunity, OpportunityStage, SalesActivity } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import {
  clientSchema,
  contactSchema,
  leadSchema,
  opportunitySchema,
  salesActivitySchema,
  type ClientInput,
  type ContactInput,
  type LeadInput,
  type OpportunityInput,
  type SalesActivityInput,
} from "@/lib/validation/schemas";
import { STAGES, STAGE_LABELS } from "@/lib/calculations/pipeline";
import { can } from "@/lib/permissions";
import { activity, assertCan, audit, DomainError, findOrThrow, normalize, parse, replace, type Command } from "./core";

/* ----------------------------- Clients ----------------------------- */

export const createClient: Command<ClientInput, Client> = (data, input, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(clientSchema, input);
  if (data.clients.some((c) => normalize(c.name) === normalize(v.name))) throw new DomainError(`Un client nommé « ${v.name} » existe déjà.`, { name: "Doublon" });
  const client: Client = { id: newId("cli"), ...v, documents: [], createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, clients: [...data.clients, client] };
  next = activity(next, ctx, "client_created", `Client ${client.name} ajouté`, { type: "client", id: client.id });
  return { data: next, result: client, message: `Client « ${client.name} » créé.` };
};

export const updateClient: Command<{ id: string; values: ClientInput }, Client> = (data, { id, values }, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(clientSchema, values);
  const current = findOrThrow(data.clients, id, "Client");
  if (data.clients.some((c) => c.id !== id && normalize(c.name) === normalize(v.name))) throw new DomainError(`Un client nommé « ${v.name} » existe déjà.`, { name: "Doublon" });
  const client: Client = { ...current, ...v, updatedAt: ctx.now };
  let next = { ...data, clients: replace(data.clients, client) };
  next = activity(next, ctx, "client_updated", `Fiche client ${client.name} mise à jour`, { type: "client", id });
  return { data: next, result: client, message: "Client mis à jour." };
};

/** Suppression contrôlée : interdite si des pièces ou projets sont rattachés (préservation de l'historique). */
export const deleteClient: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "clients.write");
  const client = findOrThrow(data.clients, id, "Client");
  const linked =
    data.invoices.some((i) => i.clientId === id) || data.quotes.some((q) => q.clientId === id) || data.projects.some((p) => p.clientId === id) || data.subscriptions.some((s) => s.clientId === id);
  if (linked) throw new DomainError("Ce client possède des factures, devis, projets ou contrats : passez-le plutôt au statut « Perdu » pour préserver l'historique.");
  let next = {
    ...data,
    clients: data.clients.filter((c) => c.id !== id),
    contacts: data.contacts.filter((c) => c.clientId !== id),
    opportunities: data.opportunities.map((o) => (o.clientId === id ? { ...o, clientId: null } : o)),
  };
  next = audit(next, ctx, "client.delete", { type: "client", id }, client.name);
  return { data: next, result: undefined, message: `Client « ${client.name} » supprimé.` };
};

export const addClientDocument: Command<{ clientId: string; name: string; kind: string }> = (data, { clientId, name, kind }, ctx) => {
  assertCan(ctx, "clients.write");
  const client = findOrThrow(data.clients, clientId, "Client");
  if (!name.trim()) throw new DomainError("Le nom du document est obligatoire.");
  const updated: Client = { ...client, documents: [...client.documents, { id: newId("doc"), name: name.trim(), kind, addedAt: ctx.now }], updatedAt: ctx.now };
  return { data: { ...data, clients: replace(data.clients, updated) }, result: undefined, message: "Référence de document ajoutée." };
};

/* ----------------------------- Contacts ----------------------------- */

function applyPrimary(contacts: Contact[], contact: Contact): Contact[] {
  if (!contact.isPrimary || !contact.clientId) return contacts;
  return contacts.map((c) => (c.id !== contact.id && c.clientId === contact.clientId ? { ...c, isPrimary: false } : c));
}

export const createContact: Command<ContactInput, Contact> = (data, input, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(contactSchema, input);
  if (v.email && data.contacts.some((c) => c.email.toLowerCase() === v.email.toLowerCase())) throw new DomainError("Un contact utilise déjà cette adresse e-mail.", { email: "Doublon" });
  const contact: Contact = { id: newId("con"), ...v, createdAt: ctx.now, updatedAt: ctx.now };
  const contacts = applyPrimary([...data.contacts, contact], contact);
  return { data: { ...data, contacts }, result: contact, message: `Contact ${contact.firstName} ${contact.lastName} ajouté.` };
};

export const updateContact: Command<{ id: string; values: ContactInput }, Contact> = (data, { id, values }, ctx) => {
  assertCan(ctx, "clients.write");
  const v = parse(contactSchema, values);
  const current = findOrThrow(data.contacts, id, "Contact");
  if (v.email && data.contacts.some((c) => c.id !== id && c.email.toLowerCase() === v.email.toLowerCase()))
    throw new DomainError("Un contact utilise déjà cette adresse e-mail.", { email: "Doublon" });
  const contact: Contact = { ...current, ...v, updatedAt: ctx.now };
  return { data: { ...data, contacts: applyPrimary(replace(data.contacts, contact), contact) }, result: contact, message: "Contact mis à jour." };
};

export const deleteContact: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "clients.write");
  findOrThrow(data.contacts, id, "Contact");
  return {
    data: { ...data, contacts: data.contacts.filter((c) => c.id !== id), opportunities: data.opportunities.map((o) => (o.contactId === id ? { ...o, contactId: null } : o)) },
    result: undefined,
    message: "Contact supprimé.",
  };
};

/* ----------------------------- Prospects ----------------------------- */

function leadDuplicate(leads: Lead[], clients: Client[], v: LeadInput, exceptId?: string): string | null {
  const key = normalize(v.company);
  if (leads.some((l) => l.id !== exceptId && l.status !== "converted" && normalize(l.company) === key)) return `Un prospect « ${v.company} » existe déjà.`;
  if (clients.some((c) => normalize(c.name) === key)) return `« ${v.company} » est déjà client.`;
  if (v.email && leads.some((l) => l.id !== exceptId && l.email && l.email.toLowerCase() === v.email.toLowerCase())) return "Un prospect utilise déjà cette adresse e-mail.";
  return null;
}

export const createLead: Command<LeadInput, Lead> = (data, input, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(leadSchema, input);
  const dup = leadDuplicate(data.leads, data.clients, v);
  if (dup) throw new DomainError(dup, { company: "Doublon" });
  const lead: Lead = { id: newId("lead"), ...v, status: v.status === "converted" ? "new" : v.status, convertedClientId: null, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, leads: [...data.leads, lead] };
  next = activity(next, ctx, "lead_created", `Prospect ${lead.company} ajouté`, { type: "lead", id: lead.id });
  return { data: next, result: lead, message: `Prospect « ${lead.company} » créé.` };
};

export const updateLead: Command<{ id: string; values: LeadInput }, Lead> = (data, { id, values }, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(leadSchema, values);
  const current = findOrThrow(data.leads, id, "Prospect");
  if (current.status === "converted" && v.status !== "converted") throw new DomainError("Un prospect converti ne peut pas changer de statut.");
  if (v.status === "converted" && current.status !== "converted") throw new DomainError("Utilisez l'action « Convertir en client ».");
  const dup = leadDuplicate(data.leads, data.clients, v, id);
  if (dup && current.status !== "converted") throw new DomainError(dup, { company: "Doublon" });
  const lead: Lead = { ...current, ...v, updatedAt: ctx.now };
  return { data: { ...data, leads: replace(data.leads, lead) }, result: lead, message: "Prospect mis à jour." };
};

export const deleteLead: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  const lead = findOrThrow(data.leads, id, "Prospect");
  if (data.opportunities.some((o) => o.leadId === id && !o.clientId)) throw new DomainError("Des opportunités sont rattachées à ce prospect.");
  let next = { ...data, leads: data.leads.filter((l) => l.id !== id), contacts: data.contacts.filter((c) => c.leadId !== id || c.clientId) };
  next = audit(next, ctx, "lead.delete", { type: "lead", id }, lead.company);
  return { data: next, result: undefined, message: "Prospect supprimé." };
};

/** Transforme un prospect qualifié en client (client + contact principal + rattachement des opportunités). */
export const convertLead: Command<{ id: string }, Client> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  assertCan(ctx, "clients.write");
  const lead = findOrThrow(data.leads, id, "Prospect");
  if (lead.status === "converted") throw new DomainError("Ce prospect est déjà converti.");
  if (lead.status !== "qualified") throw new DomainError("Seul un prospect qualifié peut être converti en client.");
  if (data.clients.some((c) => normalize(c.name) === normalize(lead.company))) throw new DomainError(`« ${lead.company} » est déjà client.`);
  const client: Client = {
    id: newId("cli"),
    name: lead.company,
    sector: lead.sector,
    status: "active",
    city: "",
    website: "",
    satisfaction: null,
    notes: lead.notes,
    documents: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const contacts = data.contacts.map((c) => (c.leadId === id ? { ...c, clientId: client.id, updatedAt: ctx.now } : c));
  const hasContact = contacts.some((c) => c.clientId === client.id);
  if (!hasContact && lead.contactName) {
    const [firstName, ...rest] = lead.contactName.split(" ");
    contacts.push({
      id: newId("con"),
      clientId: client.id,
      leadId: id,
      firstName: firstName ?? lead.contactName,
      lastName: rest.join(" ") || "—",
      jobTitle: "",
      email: lead.email,
      phone: lead.phone,
      isPrimary: true,
      notes: "",
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  }
  let next = {
    ...data,
    clients: [...data.clients, client],
    contacts,
    leads: replace(data.leads, { ...lead, status: "converted" as const, convertedClientId: client.id, updatedAt: ctx.now }),
    opportunities: data.opportunities.map((o) => (o.leadId === id ? { ...o, clientId: client.id, updatedAt: ctx.now } : o)),
    salesActivities: data.salesActivities.map((a) => (a.leadId === id ? { ...a, clientId: client.id } : a)),
  };
  next = activity(next, ctx, "lead_converted", `Prospect ${lead.company} converti en client`, { type: "client", id: client.id });
  next = audit(next, ctx, "lead.convert", { type: "lead", id }, client.id);
  return { data: next, result: client, message: `${lead.company} est désormais client.` };
};

/* ----------------------------- Opportunités ----------------------------- */

export const createOpportunity: Command<OpportunityInput, Opportunity> = (data, input, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(opportunitySchema, input);
  const closed = v.stage === "won" || v.stage === "lost";
  const opp: Opportunity = { id: newId("opp"), ...v, lastInteractionAt: ctx.now, closedAt: closed ? ctx.now : null, lostReason: "", createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, opportunities: [...data.opportunities, opp] };
  next = activity(next, ctx, "opportunity_created", `Opportunité ${opp.name} créée`, { type: "opportunity", id: opp.id });
  return { data: next, result: opp, message: `Opportunité « ${opp.name} » créée.` };
};

export const updateOpportunity: Command<{ id: string; values: OpportunityInput }, Opportunity> = (data, { id, values }, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(opportunitySchema, values);
  const current = findOrThrow(data.opportunities, id, "Opportunité");
  const closedNow = (v.stage === "won" || v.stage === "lost") && current.stage !== v.stage;
  const reopened = v.stage !== "won" && v.stage !== "lost";
  const opp: Opportunity = { ...current, ...v, closedAt: closedNow ? ctx.now : reopened ? null : current.closedAt, updatedAt: ctx.now };
  return { data: { ...data, opportunities: replace(data.opportunities, opp) }, result: opp, message: "Opportunité mise à jour." };
};

/**
 * Déplacement dans le pipeline. Met à jour la probabilité par défaut de l'étape, la
 * date de dernière interaction et, pour une étape finale, la date de clôture.
 * Une opportunité gagnée n'est jamais comptée comme un encaissement.
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
    lostReason: stage === "lost" ? (lostReason ?? "") : "",
    updatedAt: ctx.now,
  };
  let next = { ...data, opportunities: replace(data.opportunities, opp) };
  const type = stage === "won" ? "opportunity_won" : stage === "lost" ? "opportunity_lost" : "opportunity_stage";
  next = activity(next, ctx, type, stage === "won" ? `Opportunité ${opp.name} gagnée` : stage === "lost" ? `Opportunité ${opp.name} perdue` : `${opp.name} → ${STAGE_LABELS[stage]}`, {
    type: "opportunity",
    id,
  });
  return { data: next, result: opp, message: `« ${opp.name} » → ${STAGE_LABELS[stage]}.` };
};

export const deleteOpportunity: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  const opp = findOrThrow(data.opportunities, id, "Opportunité");
  let next = {
    ...data,
    opportunities: data.opportunities.filter((o) => o.id !== id),
    projects: data.projects.map((p) => (p.opportunityId === id ? { ...p, opportunityId: null } : p)),
    quotes: data.quotes.map((q) => (q.opportunityId === id ? { ...q, opportunityId: null } : q)),
    salesActivities: data.salesActivities.map((a) => (a.opportunityId === id ? { ...a, opportunityId: null } : a)),
  };
  next = audit(next, ctx, "opportunity.delete", { type: "opportunity", id }, opp.name);
  return { data: next, result: undefined, message: "Opportunité supprimée." };
};

/* ----------------------------- Activités commerciales ----------------------------- */

export const logSalesActivity: Command<SalesActivityInput, SalesActivity> = (data, input, ctx) => {
  assertCan(ctx, "crm.write");
  const v = parse(salesActivitySchema, input);
  const act: SalesActivity = { id: newId("sa"), ...v, createdAt: ctx.now };
  let opportunities = data.opportunities;
  if (v.opportunityId && v.done) {
    opportunities = opportunities.map((o) => (o.id === v.opportunityId && v.date > o.lastInteractionAt ? { ...o, lastInteractionAt: v.date, updatedAt: ctx.now } : o));
  }
  return { data: { ...data, salesActivities: [...data.salesActivities, act], opportunities }, result: act, message: v.done ? "Activité consignée." : "Activité planifiée." };
};

/** Relance d'une facture : consigne l'action (aucun e-mail n'est envoyé par l'application). */
export const logInvoiceFollowUp: Command<{ invoiceId: string; notes: string }, SalesActivity> = (data, { invoiceId, notes }, ctx) => {
  const invoice = findOrThrow(data.invoices, invoiceId, "Facture");
  if (!can(ctx.user.role, "crm.write") && !can(ctx.user.role, "invoices.write")) throw new DomainError("Action non autorisée pour ce rôle.");
  const act: SalesActivity = {
    id: newId("sa"),
    type: "followup",
    date: ctx.now,
    subject: `Relance facture ${invoice.number}`,
    notes,
    clientId: invoice.clientId,
    leadId: null,
    opportunityId: null,
    invoiceId,
    ownerId: null,
    done: true,
    createdAt: ctx.now,
  };
  return { data: { ...data, salesActivities: [...data.salesActivities, act] }, result: act, message: "Relance consignée (aucun e-mail n'a été envoyé)." };
};

export const completeSalesActivity: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  const act = findOrThrow(data.salesActivities, id, "Activité");
  const updated = { ...act, done: true, date: act.date > ctx.now ? ctx.now : act.date };
  const opportunities = updated.opportunityId ? data.opportunities.map((o) => (o.id === updated.opportunityId ? { ...o, lastInteractionAt: ctx.now } : o)) : data.opportunities;
  return { data: { ...data, salesActivities: replace(data.salesActivities, updated), opportunities }, result: undefined, message: "Activité marquée comme réalisée." };
};

export const deleteSalesActivity: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "crm.write");
  findOrThrow(data.salesActivities, id, "Activité");
  return { data: { ...data, salesActivities: data.salesActivities.filter((a) => a.id !== id) }, result: undefined, message: "Activité supprimée." };
};
