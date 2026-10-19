import type { AppData, ISODate, Priority, Task } from "@/lib/domain/types";
import { addDays, daysBetween } from "@/lib/calculations/dates";
import { STAGE_LABELS } from "@/lib/calculations/pipeline";
import { TASK_TYPE_LABEL } from "./model";
import { RELATION } from "./model";
import type { CrmIndex, ContactView } from "./views";
import { isMissionOpen } from "./views";

/**
 * Centre d'action du jour : liste des actions à mener, chacune justifiée par une règle
 * explicite (aucune recommandation « opaque »). Tri : urgence, échéance, priorité.
 */

export type ActionKind = "overdue" | "today" | "priority" | "proposal" | "new_prospect" | "inactive";

export const ACTION_KIND: Record<ActionKind, { label: string; rank: number }> = {
  overdue: { label: "En retard", rank: 0 },
  today: { label: "Aujourd'hui", rank: 1 },
  priority: { label: "Prioritaire", rank: 2 },
  proposal: { label: "Proposition en attente", rank: 3 },
  new_prospect: { label: "Nouveau prospect", rank: 4 },
  inactive: { label: "Contact inactif", rank: 5 },
};

export interface ActionItem {
  key: string;
  kind: ActionKind;
  /** Pourquoi cet élément est dans la liste (règle déclenchante). */
  reason: string;
  title: string;
  contact: ContactView | null;
  companyName: string;
  /** Contexte de la relation (statut + étape). */
  context: string;
  /** Date-heure ISO de la dernière interaction réelle (null si aucune). */
  lastInteraction: string | null;
  nextAction: string;
  dueDate: ISODate | null;
  dueTime: string | null;
  priority: Priority;
  task: Task | null;
  opportunityId: string | null;
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export function buildActionCenter(data: AppData, index: CrmIndex, today: ISODate): ActionItem[] {
  const items: ActionItem[] = [];
  const covered = new Set<string>();
  const companies = new Map(data.clients.map((c) => [c.id, c.name]));
  const contextOf = (cv: ContactView | null) => (cv ? [RELATION[cv.contact.relation].label, cv.stage ? STAGE_LABELS[cv.stage] : null].filter(Boolean).join(" · ") : "");

  for (const t of data.tasks) {
    if (t.type === "internal" || !isMissionOpen(t) || t.status === "waiting" || !t.dueDate) continue;
    const cv = t.contactId ? (index.contactById.get(t.contactId) ?? null) : null;
    let kind: ActionKind | null = null;
    let reason = "";
    if (t.dueDate < today) {
      kind = "overdue";
      const late = daysBetween(t.dueDate, today);
      reason = `${TASK_TYPE_LABEL[t.type]} en retard de ${late} jour${late > 1 ? "s" : ""}`;
    } else if (t.dueDate === today) {
      kind = "today";
      reason = `${TASK_TYPE_LABEL[t.type]} prévu(e) aujourd'hui${t.dueTime ? ` à ${t.dueTime}` : ""}`;
    } else if ((t.priority === "high" || t.priority === "critical") && t.dueDate <= addDays(today, 2)) {
      kind = "priority";
      reason = `Mission ${t.priority === "critical" ? "critique" : "prioritaire"} à échéance le ${t.dueDate.split("-").reverse().join("/")}`;
    }
    if (!kind) continue;
    if (cv) covered.add(cv.contact.id);
    if (t.opportunityId) covered.add(`opp:${t.opportunityId}`);
    items.push({
      key: `task:${t.id}`,
      kind,
      reason,
      title: t.title,
      contact: cv,
      companyName: (t.clientId && companies.get(t.clientId)) || cv?.company?.name || "",
      context: contextOf(cv),
      lastInteraction: cv?.lastInteraction?.date ?? null,
      nextAction: t.title,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      priority: t.priority,
      task: t,
      opportunityId: t.opportunityId,
    });
  }

  // Propositions sans réponse depuis le seuil configuré.
  for (const d of index.deals) {
    const o = d.opportunity;
    if (o.stage !== "proposal" || o.archivedAt || covered.has(`opp:${o.id}`)) continue;
    if (d.daysSinceInteraction < data.settings.crm.proposalPendingDays) continue;
    const cv = o.contactId ? (index.contactById.get(o.contactId) ?? null) : null;
    if (cv) covered.add(cv.contact.id);
    items.push({
      key: `proposal:${o.id}`,
      kind: "proposal",
      reason: `Proposition envoyée sans réponse depuis ${d.daysSinceInteraction} jours (seuil : ${data.settings.crm.proposalPendingDays})`,
      title: `Relancer la proposition « ${o.name} »`,
      contact: cv,
      companyName: d.company?.name ?? "",
      context: contextOf(cv),
      lastInteraction: d.lastInteractionAt,
      nextAction: d.nextMission?.title ?? "Aucune action planifiée",
      dueDate: d.nextMission?.dueDate ?? null,
      dueTime: null,
      priority: o.priority,
      task: null,
      opportunityId: o.id,
    });
  }

  for (const cv of index.contacts) {
    if (cv.archived || covered.has(cv.contact.id)) continue;
    // Nouveaux prospects non encore traités.
    if (cv.followUp === "to_process") {
      items.push({
        key: `new:${cv.contact.id}`,
        kind: "new_prospect",
        reason: `Prospect créé le ${cv.contact.createdAt.slice(0, 10).split("-").reverse().join("/")} sans prise de contact ni action planifiée`,
        title: `Prendre contact avec ${cv.name}`,
        contact: cv,
        companyName: cv.company?.name ?? "",
        context: contextOf(cv),
        lastInteraction: null,
        nextAction: "Aucune action planifiée",
        dueDate: null,
        dueTime: null,
        priority: cv.contact.priority,
        task: null,
        opportunityId: cv.mainOpportunity?.id ?? null,
      });
      continue;
    }
    // Clients inactifs depuis le seuil configuré, sans action prévue.
    if (cv.contact.relation === "customer" && cv.contact.isPrimary && !cv.openMissions.length && cv.daysSinceContact >= data.settings.crm.inactivityDays) {
      items.push({
        key: `inactive:${cv.contact.id}`,
        kind: "inactive",
        reason: `Aucune interaction depuis ${cv.daysSinceContact} jours (seuil : ${data.settings.crm.inactivityDays})`,
        title: `Reprendre contact avec ${cv.name}`,
        contact: cv,
        companyName: cv.company?.name ?? "",
        context: contextOf(cv),
        lastInteraction: cv.lastInteraction?.date ?? null,
        nextAction: "Aucune action planifiée",
        dueDate: null,
        dueTime: null,
        priority: cv.contact.priority,
        task: null,
        opportunityId: null,
      });
    }
  }

  return items.sort(
    (a, b) =>
      ACTION_KIND[a.kind].rank - ACTION_KIND[b.kind].rank ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}
