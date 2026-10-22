import type { AppData, Cents, ID, ISODate, Opportunity, Task } from "@/lib/domain/types";
import { addDays } from "@/lib/calculations/dates";
import { isOpen, pipelineValue, weightedPipeline } from "@/lib/calculations/pipeline";
import { formatEUR } from "@/lib/formatters";
import { buildActionCenter, type ActionItem } from "@/lib/crm/action-center";
import { buildCrmIndex, compareMissions, isContactComplete, isMissionOpen, type CrmIndex, type DealView } from "@/lib/crm/views";
import { computeScope } from "@/lib/cloud/scope";
import { DEFAULT_WORKING_DAYS } from "@/lib/crm/model";
import { buildDrafts, type Draft } from "./drafts";
import { forecastByMonth, type Forecast } from "./forecast";
import { rankDealsByRisk, type DealRisk } from "./risk";

/**
 * Rapport du matin de l'assistant commercial : ce qui s'est passé depuis le dernier jour
 * ouvré, l'agenda du jour, les priorités expliquées, les affaires à risque, les brouillons
 * à valider, la prévision et la qualité des données. Calcul local et déterministe : les
 * mêmes données donnent toujours le même rapport.
 */

export interface BriefingSince {
  /** Premier jour couvert (dernier jour ouvré précédent). */
  from: ISODate;
  interactions: number;
  missionsDone: number;
  stageMoves: number;
  newContacts: number;
  won: Opportunity[];
  lost: Opportunity[];
}

export interface Hygiene {
  incompleteContacts: number;
  contactsWithoutOwner: number;
  dealsWithoutNextAction: number;
  dealsWithoutContact: number;
  overdueCloseDates: number;
}

export interface Briefing {
  /** Collaborateur concerné, ou `null` pour toute l'équipe. */
  employeeId: ID | null;
  headline: string;
  since: BriefingSince;
  agenda: Task[];
  priorities: ActionItem[];
  priorityTotal: number;
  atRisk: { deal: DealView; risk: DealRisk }[];
  riskCounts: { high: number; medium: number; amountAtRisk: Cents };
  drafts: Draft[];
  forecast: Forecast;
  pipeline: { open: number; value: Cents; weighted: Cents };
  hygiene: Hygiene;
}

/** Dernier jour ouvré strictement avant `today` (au plus 7 jours en arrière). */
export function previousWorkingDay(today: ISODate, workingDays: number[]): ISODate {
  const working = new Set(workingDays.length ? workingDays : DEFAULT_WORKING_DAYS);
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (working.has(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
  }
  return addDays(today, -1);
}

/** Données réduites au portefeuille d'un collaborateur (même règle que le cloisonnement serveur). */
export function scopeData(data: AppData, employeeId: ID | null): AppData {
  if (!employeeId) return data;
  const s = computeScope(data, employeeId);
  return {
    ...data,
    contacts: data.contacts.filter((c) => s.contacts.has(c.id)),
    clients: data.clients.filter((c) => s.clients.has(c.id)),
    opportunities: data.opportunities.filter((o) => s.opportunities.has(o.id)),
    tasks: data.tasks.filter((t) => t.type === "internal" ? t.assigneeId === employeeId : s.tasks.has(t.id)),
    salesActivities: data.salesActivities.filter((a) => s.activities.has(a.id)),
    notes: data.notes.filter((n) => s.notes.has(n.id)),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

function headlineOf(b: Omit<Briefing, "headline">): string {
  const parts: string[] = [];
  const overdue = b.priorities.filter((p) => p.kind === "overdue").length;
  const late = b.priorityTotal ? b.priorityTotal : 0;
  if (overdue) parts.push(plural(overdue, "action en retard", "actions en retard"));
  if (b.agenda.length) parts.push(`${plural(b.agenda.length, "action prévue", "actions prévues")} aujourd'hui`);
  if (b.riskCounts.high) parts.push(`${plural(b.riskCounts.high, "affaire à risque", "affaires à risque")} (${formatEUR(b.riskCounts.amountAtRisk, { compact: true })})`);
  if (b.drafts.length) parts.push(`${plural(b.drafts.length, "brouillon prêt", "brouillons prêts")} à valider`);
  if (!parts.length) return late ? `${plural(late, "action suggérée", "actions suggérées")} pour aujourd'hui.` : "Rien d'urgent aujourd'hui : c'est le bon moment pour prospecter.";
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function buildBriefing(all: AppData, today: ISODate, employeeId: ID | null, prebuilt?: CrmIndex): Briefing {
  const data = scopeData(all, employeeId);
  const index = employeeId || !prebuilt ? buildCrmIndex(data, today) : prebuilt;
  const from = previousWorkingDay(today, data.settings.crm.workingDays);
  const inWindow = (d: string | null | undefined) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= today;

  const since: BriefingSince = {
    from,
    interactions: data.salesActivities.filter((a) => a.type !== "stage_change" && a.type !== "task_done" && inWindow(a.date)).length,
    missionsDone: data.tasks.filter((t) => t.type !== "internal" && t.status === "done" && inWindow(t.completedAt)).length,
    stageMoves: data.salesActivities.filter((a) => a.type === "stage_change" && inWindow(a.date)).length,
    newContacts: data.contacts.filter((c) => inWindow(c.createdAt)).length,
    won: data.opportunities.filter((o) => o.stage === "won" && inWindow(o.closedAt)),
    lost: data.opportunities.filter((o) => o.stage === "lost" && inWindow(o.closedAt)),
  };

  const agenda = data.tasks.filter((t) => t.type !== "internal" && isMissionOpen(t) && t.dueDate === today).sort(compareMissions);
  const actions = buildActionCenter(data, index, today);
  const ranked = rankDealsByRisk(index.deals, data, today);
  const atRiskAll = ranked.filter((r) => r.risk.level !== "low");
  const high = ranked.filter((r) => r.risk.level === "high");
  const open = data.opportunities.filter(isOpen);

  const partial: Omit<Briefing, "headline"> = {
    employeeId,
    since,
    agenda,
    priorities: actions.slice(0, 8),
    priorityTotal: actions.length,
    atRisk: atRiskAll.slice(0, 6),
    riskCounts: { high: high.length, medium: atRiskAll.length - high.length, amountAtRisk: high.reduce((s, r) => s + r.deal.opportunity.amount, 0) },
    drafts: buildDrafts(data, index, actions, ranked),
    forecast: forecastByMonth(data.opportunities, today),
    pipeline: { open: open.length, value: pipelineValue(open), weighted: weightedPipeline(open) },
    hygiene: {
      incompleteContacts: index.contacts.filter((c) => !c.archived && !isContactComplete(c.contact)).length,
      contactsWithoutOwner: index.contacts.filter((c) => !c.archived && !c.contact.ownerId).length,
      dealsWithoutNextAction: index.deals.filter((d) => isOpen(d.opportunity) && !d.openMissions.length).length,
      dealsWithoutContact: open.filter((o) => !o.contactId).length,
      overdueCloseDates: open.filter((o) => o.expectedCloseDate && o.expectedCloseDate < today).length,
    },
  };
  return { ...partial, headline: headlineOf(partial) };
}
