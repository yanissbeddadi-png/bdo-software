import type { AppData, CurrentUser, EntityRef, ID, Role } from "@/lib/domain/types";

/**
 * Cloisonnement des données par collaborateur (mode multi-utilisateur).
 *
 * - Le directeur commercial (rôle `dirigeant`, administrateur de l'espace) voit tout.
 * - Les autres comptes ne reçoivent du serveur QUE leur portefeuille : contacts dont ils
 *   sont responsables, opportunités qu'ils portent (ou rattachées à leurs contacts),
 *   entreprises correspondantes, missions qui leur sont attribuées, interactions, notes et
 *   propositions liées, notifications et XP de ces éléments.
 * - Le serveur refuse toute modification touchant un élément hors de ce portefeuille.
 */

export const FULL_ACCESS_ROLES: readonly Role[] = ["dirigeant", "admin"];

export function hasFullAccess(role: Role): boolean {
  return FULL_ACCESS_ROLES.includes(role);
}

export interface Scope {
  contacts: Set<ID>;
  opportunities: Set<ID>;
  clients: Set<ID>;
  tasks: Set<ID>;
  activities: Set<ID>;
  notes: Set<ID>;
  quotes: Set<ID>;
}

/** Portefeuille d'un collaborateur, calculé à partir des responsables et des liens. */
export function computeScope(data: AppData, employeeId: ID | null): Scope {
  const scope: Scope = { contacts: new Set(), opportunities: new Set(), clients: new Set(), tasks: new Set(), activities: new Set(), notes: new Set(), quotes: new Set() };
  if (!employeeId) return scope;
  for (const c of data.contacts) if (c.ownerId === employeeId) scope.contacts.add(c.id);
  for (const o of data.opportunities) if (o.ownerId === employeeId || (o.contactId && scope.contacts.has(o.contactId))) scope.opportunities.add(o.id);
  for (const c of data.clients) if (c.ownerId === employeeId) scope.clients.add(c.id);
  for (const c of data.contacts) if (scope.contacts.has(c.id) && c.clientId) scope.clients.add(c.clientId);
  for (const o of data.opportunities) if (scope.opportunities.has(o.id) && o.clientId) scope.clients.add(o.clientId);
  const linked = (x: { contactId: ID | null; opportunityId: ID | null }) => (!!x.contactId && scope.contacts.has(x.contactId)) || (!!x.opportunityId && scope.opportunities.has(x.opportunityId));
  for (const t of data.tasks) if (t.type !== "internal" && (t.assigneeId === employeeId || (!t.assigneeId && linked(t)))) scope.tasks.add(t.id);
  for (const a of data.salesActivities) if (a.ownerId === employeeId || linked(a) || (!!a.taskId && scope.tasks.has(a.taskId))) scope.activities.add(a.id);
  for (const n of data.notes) if (linked(n) || (!n.contactId && !n.opportunityId && !!n.clientId && scope.clients.has(n.clientId))) scope.notes.add(n.id);
  for (const q of data.quotes) if (q.opportunityId && scope.opportunities.has(q.opportunityId)) scope.quotes.add(q.id);
  return scope;
}

function refInScope(ref: EntityRef | null | undefined, s: Scope): boolean {
  if (!ref) return false;
  switch (ref.type) {
    case "contact":
      return s.contacts.has(ref.id);
    case "client":
      return s.clients.has(ref.id);
    case "opportunity":
      return s.opportunities.has(ref.id);
    case "task":
      return s.tasks.has(ref.id);
    case "activity":
      return s.activities.has(ref.id);
    case "quote":
      return s.quotes.has(ref.id);
    case "note":
      return s.notes.has(ref.id);
    default:
      return false;
  }
}

/**
 * Données envoyées au navigateur d'un utilisateur. Les modules historiques (finances,
 * projets, équipe…) sont vides hors directeur commercial ; les coûts salariaux sont masqués.
 */
export function projectForUser(data: AppData, user: CurrentUser): AppData {
  if (hasFullAccess(user.role)) return data;
  const s = computeScope(data, user.employeeId ?? null);
  const visibleXp = data.xpTransactions.filter((x) => refInScope(x.ref, s));
  const visibleKeys = new Set(visibleXp.map((x) => x.idempotencyKey));
  return {
    ...data,
    clients: data.clients.filter((c) => s.clients.has(c.id)).map((c) => ({ ...c, documents: [] })),
    contacts: data.contacts.filter((c) => s.contacts.has(c.id)),
    leads: [],
    opportunities: data.opportunities.filter((o) => s.opportunities.has(o.id)),
    salesActivities: data.salesActivities.filter((a) => s.activities.has(a.id)),
    quotes: data.quotes.filter((q) => s.quotes.has(q.id)),
    tasks: data.tasks.filter((t) => s.tasks.has(t.id)),
    notes: data.notes.filter((n) => s.notes.has(n.id)),
    invoices: [],
    payments: [],
    creditNotes: [],
    refunds: [],
    vatReturns: [],
    expenses: [],
    subscriptions: [],
    projects: [],
    employees: data.employees.map((e) => ({ ...e, monthlyCost: 0 })),
    goals: data.goals.filter((g) => g.ownerId === user.employeeId),
    missions: data.missions.filter((m) => refInScope(m.entity, s)),
    xpTransactions: visibleXp,
    // Les récompenses déjà attribuées ailleurs ne doivent pas être « regagnées » localement.
    retiredXpKeys: [...new Set([...data.retiredXpKeys, ...data.xpTransactions.map((x) => x.idempotencyKey).filter((k) => !visibleKeys.has(k))])],
    progression: [],
    notifications: data.notifications.filter((n) => refInScope(n.ref, s)),
    activity: data.activity.filter((a) => refInScope(a.ref, s)),
    auditLogs: [],
  };
}

/** Modules historiques réservés au directeur commercial (finances, équipe, projets…). */
export const DIRECTOR_ONLY_PATHS = ["/finances", "/projets", "/taches", "/equipe", "/catalogue", "/objectifs", "/analyses", "/operations", "/bureaux"];

export function isDirectorOnlyPath(pathname: string): boolean {
  return DIRECTOR_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Réglages modifiables par une action, hors suivi automatique de la gamification. */
function userSettings(data: AppData) {
  const { noLateTaskSince: _a, announcedLevel: _b, announcedRank: _c, ...gamification } = data.settings.gamification;
  void _a;
  void _b;
  void _c;
  return { ...data.settings, user: null, gamification };
}

/** Collections que seul le directeur commercial peut modifier (modules historiques, équipe, réglages). */
const RESTRICTED: (keyof AppData)[] = ["invoices", "payments", "creditNotes", "refunds", "vatReturns", "expenses", "subscriptions", "projects", "products", "employees", "goals", "leads", "settings"];

const SCOPED: { key: "contacts" | "clients" | "opportunities" | "tasks" | "salesActivities" | "notes" | "quotes"; scope: keyof Scope }[] = [
  { key: "contacts", scope: "contacts" },
  { key: "clients", scope: "clients" },
  { key: "opportunities", scope: "opportunities" },
  { key: "tasks", scope: "tasks" },
  { key: "salesActivities", scope: "activities" },
  { key: "notes", scope: "notes" },
  { key: "quotes", scope: "quotes" },
];

/**
 * Vérifie qu'une commande d'un collaborateur ne touche que son portefeuille : tout élément
 * modifié ou supprimé devait lui appartenir, tout élément créé ou modifié doit lui
 * appartenir après coup. Renvoie un message d'erreur, ou `null` si tout est conforme.
 */
export function scopeViolation(before: AppData, after: AppData, user: CurrentUser): string | null {
  if (hasFullAccess(user.role)) return null;
  for (const key of RESTRICTED) {
    const a = key === "settings" ? userSettings(before) : before[key];
    const b = key === "settings" ? userSettings(after) : after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) return "Cette action est réservée au directeur commercial.";
  }
  const sb = computeScope(before, user.employeeId ?? null);
  const sa = computeScope(after, user.employeeId ?? null);
  for (const { key, scope } of SCOPED) {
    const prev = new Map((before[key] as { id: ID }[]).map((x) => [x.id, JSON.stringify(x)]));
    const next = new Map((after[key] as { id: ID }[]).map((x) => [x.id, JSON.stringify(x)]));
    for (const [id, json] of prev) {
      const now = next.get(id);
      if (now === json) continue;
      if (!sb[scope].has(id)) return "Cette action concerne des données qui ne vous sont pas attribuées.";
      if (now !== undefined && !sa[scope].has(id)) return "Vous ne pouvez pas attribuer cet élément à un autre collaborateur : seul le directeur commercial peut réaffecter un portefeuille.";
    }
    for (const id of next.keys()) {
      if (!prev.has(id) && !sa[scope].has(id)) return "Un élément créé doit vous être attribué.";
    }
  }
  return null;
}

/**
 * Répartit le portefeuille de démonstration entre les collaborateurs (hors directeur
 * commercial), entreprise par entreprise : chacun dispose ainsi de ses propres
 * entreprises, contacts, opportunités, missions et interactions pour tester sa session.
 */
export function distributePortfolio(data: AppData, directorEmployeeId: ID | null): AppData {
  const owners = data.employees.filter((e) => e.status === "active" && e.id !== directorEmployeeId).map((e) => e.id);
  if (!owners.length) return data;
  const byCompany = new Map<ID, ID>();
  [...data.clients].sort((a, b) => a.name.localeCompare(b.name, "fr")).forEach((c, i) => byCompany.set(c.id, owners[i % owners.length]!));
  const contactOwner = new Map<ID, ID>();
  let k = 0;
  const contacts = data.contacts.map((c) => {
    const ownerId = (c.clientId && byCompany.get(c.clientId)) || owners[k++ % owners.length]!;
    contactOwner.set(c.id, ownerId);
    return { ...c, ownerId };
  });
  const oppOwner = new Map<ID, ID>();
  const opportunities = data.opportunities.map((o) => {
    const ownerId = (o.contactId && contactOwner.get(o.contactId)) || (o.clientId && byCompany.get(o.clientId)) || o.ownerId;
    if (ownerId) oppOwner.set(o.id, ownerId);
    return { ...o, ownerId };
  });
  const ownerOf = (x: { contactId: ID | null; opportunityId: ID | null; clientId: ID | null }) =>
    (x.contactId && contactOwner.get(x.contactId)) || (x.opportunityId && oppOwner.get(x.opportunityId)) || (x.clientId && byCompany.get(x.clientId)) || null;
  return {
    ...data,
    clients: data.clients.map((c) => ({ ...c, ownerId: byCompany.get(c.id) ?? c.ownerId })),
    contacts,
    opportunities,
    tasks: data.tasks.map((t) => (t.type === "internal" ? t : { ...t, assigneeId: ownerOf(t) ?? t.assigneeId })),
    salesActivities: data.salesActivities.map((a) => ({ ...a, ownerId: ownerOf(a) ?? a.ownerId })),
  };
}
