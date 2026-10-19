import type { BadgeTone } from "@/components/ui/badge";
import type { AppData, Client, Contact, Employee, ISODate, Opportunity, OpportunityStage, SalesActivity, Task } from "@/lib/domain/types";
import { daysBetween } from "@/lib/calculations/dates";
import { isOpen, stageIndex } from "@/lib/calculations/pipeline";

/**
 * Vues calculées du CRM (aucune donnée stockée en double) :
 * - dernière interaction = interaction consignée la plus récente (hors changement d'étape) ;
 * - prochaine action = mission ouverte la plus proche (jamais un texte libre) ;
 * - état de suivi = calcul explicable à partir des missions et des dates.
 */

/** État de suivi (distinct de l'étape commerciale et du statut de relation). */
export type FollowUpState = "overdue" | "due" | "to_process" | "waiting" | "no_next_action" | "up_to_date";

export const FOLLOW_UP: Record<FollowUpState, { label: string; tone: BadgeTone; explain: string }> = {
  overdue: { label: "En retard", tone: "danger", explain: "Au moins une mission ouverte dont l'échéance est dépassée." },
  due: { label: "À relancer", tone: "warning", explain: "Une action prévue arrive à échéance aujourd'hui." },
  to_process: { label: "À traiter", tone: "info", explain: "Nouveau prospect sans interaction ni action planifiée." },
  waiting: { label: "En attente de réponse", tone: "violet", explain: "Une mission est en attente d'un retour du contact." },
  no_next_action: { label: "Sans prochaine action", tone: "neutral", explain: "Aucune mission ouverte n'est planifiée." },
  up_to_date: { label: "Suivi à jour", tone: "success", explain: "Une prochaine action est planifiée dans les délais." },
};

export function isMissionOpen(t: Task): boolean {
  return t.status !== "done" && t.status !== "cancelled";
}

export function isCrmMission(t: Task): boolean {
  return t.type !== "internal";
}

/** Mission en retard : ouverte et échéance strictement dépassée. */
export function isMissionOverdue(t: Task, today: ISODate): boolean {
  return isMissionOpen(t) && !!t.dueDate && t.dueDate < today;
}

/** Tri des missions : échéance, heure, priorité. */
export function compareMissions(a: Task, b: Task): number {
  const order = { critical: 0, high: 1, normal: 2, low: 3 } as const;
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") || order[a.priority] - order[b.priority];
}

/** Interactions qui comptent comme un échange avec le contact (hors événements système). */
export function isRealInteraction(a: SalesActivity): boolean {
  return a.type !== "stage_change";
}

export interface ContactView {
  contact: Contact;
  name: string;
  company: Client | null;
  owner: Employee | null;
  opportunities: Opportunity[];
  /** Opportunité ouverte la plus avancée (sinon la dernière gagnée). */
  mainOpportunity: Opportunity | null;
  stage: OpportunityStage | null;
  interactions: SalesActivity[];
  lastInteraction: SalesActivity | null;
  openMissions: Task[];
  overdueMissions: Task[];
  nextMission: Task | null;
  followUp: FollowUpState;
  isNew: boolean;
  /** Jours depuis la dernière interaction (ou depuis la création). */
  daysSinceContact: number;
  pipelineValue: number;
  archived: boolean;
}

export interface DealView {
  opportunity: Opportunity;
  company: Client | null;
  contact: Contact | null;
  owner: Employee | null;
  lastInteractionAt: string;
  daysSinceInteraction: number;
  openMissions: Task[];
  nextMission: Task | null;
  overdue: boolean;
  followUp: FollowUpState;
  stale: boolean;
}

export interface CompanyView {
  company: Client;
  owner: Employee | null;
  contacts: Contact[];
  opportunities: Opportunity[];
  openOpportunities: Opportunity[];
  missions: Task[];
  openMissions: Task[];
  nextMission: Task | null;
  lastInteraction: SalesActivity | null;
  pipelineValue: number;
  followUp: FollowUpState;
}

export interface CrmIndex {
  contacts: ContactView[];
  contactById: Map<string, ContactView>;
  deals: DealView[];
  dealById: Map<string, DealView>;
  companies: CompanyView[];
  companyById: Map<string, CompanyView>;
}

function group<T>(items: T[], key: (t: T) => string | null | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

function followUpOf(missions: Task[], today: ISODate, isNew: boolean): FollowUpState {
  const open = missions.filter(isMissionOpen);
  if (open.some((t) => t.dueDate && t.dueDate < today)) return "overdue";
  if (open.some((t) => t.status !== "waiting" && t.dueDate === today)) return "due";
  if (open.length && open.every((t) => t.status === "waiting")) return "waiting";
  if (!open.length) return isNew ? "to_process" : "no_next_action";
  return "up_to_date";
}

export function buildCrmIndex(data: AppData, today: ISODate): CrmIndex {
  const staleDays = data.settings.gamification.staleOpportunityDays;
  const newDays = data.settings.crm.newProspectDays;
  const crmMissions = data.tasks.filter(isCrmMission);
  const missionsByContact = group(crmMissions, (t) => t.contactId);
  const missionsByOpp = group(crmMissions, (t) => t.opportunityId);
  const missionsByCompany = group(crmMissions, (t) => t.clientId);
  const acts = [...data.salesActivities].sort((a, b) => b.date.localeCompare(a.date));
  const actsByContact = group(acts, (a) => a.contactId);
  const actsByOpp = group(acts, (a) => a.opportunityId);
  const actsByCompany = group(acts, (a) => a.clientId);
  const oppsByContact = group(data.opportunities, (o) => o.contactId);
  const oppsByCompany = group(data.opportunities, (o) => o.clientId);
  const companies = new Map(data.clients.map((c) => [c.id, c]));
  const employees = new Map(data.employees.map((e) => [e.id, e]));
  const contactsById = new Map(data.contacts.map((c) => [c.id, c]));

  const contacts: ContactView[] = data.contacts.map((contact) => {
    const company = contact.clientId ? (companies.get(contact.clientId) ?? null) : null;
    const own = oppsByContact.get(contact.id) ?? [];
    const companyOpps = company ? (oppsByCompany.get(company.id) ?? []) : [];
    const opportunities = [...own, ...companyOpps.filter((o) => !own.includes(o))];
    const openOwn = own.filter(isOpen).sort((a, b) => stageIndex(b.stage) - stageIndex(a.stage));
    const mainOpportunity = openOwn[0] ?? own.filter((o) => o.stage === "won").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))[0] ?? null;
    const interactions = actsByContact.get(contact.id) ?? [];
    const lastInteraction = interactions.find(isRealInteraction) ?? null;
    const missions = missionsByContact.get(contact.id) ?? [];
    const openMissions = missions.filter(isMissionOpen).sort(compareMissions);
    const archived = contact.relation === "archived" || !!contact.archivedAt;
    const isNew = !archived && contact.relation === "prospect" && !lastInteraction && daysBetween(contact.createdAt.slice(0, 10), today) <= newDays;
    return {
      contact,
      name: `${contact.firstName} ${contact.lastName}`,
      company,
      owner: contact.ownerId ? (employees.get(contact.ownerId) ?? null) : null,
      opportunities,
      mainOpportunity,
      stage: mainOpportunity?.stage ?? null,
      interactions,
      lastInteraction,
      openMissions,
      overdueMissions: openMissions.filter((t) => isMissionOverdue(t, today)),
      nextMission: openMissions[0] ?? null,
      followUp: archived ? "up_to_date" : followUpOf(missions, today, isNew),
      isNew,
      daysSinceContact: daysBetween((lastInteraction?.date ?? contact.createdAt).slice(0, 10), today),
      pipelineValue: own.filter(isOpen).reduce((s, o) => s + o.amount, 0),
      archived,
    };
  });

  const deals: DealView[] = data.opportunities.map((opportunity) => {
    const contact = opportunity.contactId ? (contactsById.get(opportunity.contactId) ?? null) : null;
    const lastAct = (actsByOpp.get(opportunity.id) ?? []).find(isRealInteraction);
    const lastInteractionAt = lastAct && lastAct.date > opportunity.lastInteractionAt ? lastAct.date : opportunity.lastInteractionAt;
    const missions = [...(missionsByOpp.get(opportunity.id) ?? []), ...(contact ? (missionsByContact.get(contact.id) ?? []).filter((t) => !t.opportunityId) : [])];
    const openMissions = missions.filter(isMissionOpen).sort(compareMissions);
    const open = isOpen(opportunity);
    const days = daysBetween(lastInteractionAt.slice(0, 10), today);
    return {
      opportunity,
      company: opportunity.clientId ? (companies.get(opportunity.clientId) ?? null) : null,
      contact,
      owner: opportunity.ownerId ? (employees.get(opportunity.ownerId) ?? null) : null,
      lastInteractionAt,
      daysSinceInteraction: days,
      openMissions,
      nextMission: openMissions[0] ?? null,
      overdue: openMissions.some((t) => isMissionOverdue(t, today)),
      followUp: open ? followUpOf(missions, today, opportunity.stage === "new" && days <= newDays && !lastAct) : "up_to_date",
      stale: open && days > staleDays,
    };
  });

  const companyViews: CompanyView[] = data.clients.map((company) => {
    const missions = missionsByCompany.get(company.id) ?? [];
    const opportunities = oppsByCompany.get(company.id) ?? [];
    const openMissions = missions.filter(isMissionOpen).sort(compareMissions);
    return {
      company,
      owner: company.ownerId ? (employees.get(company.ownerId) ?? null) : null,
      contacts: data.contacts.filter((c) => c.clientId === company.id),
      opportunities,
      openOpportunities: opportunities.filter(isOpen),
      missions,
      openMissions,
      nextMission: openMissions[0] ?? null,
      lastInteraction: (actsByCompany.get(company.id) ?? []).find(isRealInteraction) ?? null,
      pipelineValue: opportunities.filter(isOpen).reduce((s, o) => s + o.amount, 0),
      followUp: company.relation === "archived" ? "up_to_date" : followUpOf(missions, today, false),
    };
  });

  return {
    contacts,
    contactById: new Map(contacts.map((c) => [c.contact.id, c])),
    deals,
    dealById: new Map(deals.map((d) => [d.opportunity.id, d])),
    companies: companyViews,
    companyById: new Map(companyViews.map((c) => [c.company.id, c])),
  };
}

/** Une fiche contact est « complète » si elle permet réellement un suivi. */
export function isContactComplete(c: Contact): boolean {
  return !!c.clientId && !!c.jobTitle.trim() && !!c.email.trim() && !!c.phone.trim();
}
