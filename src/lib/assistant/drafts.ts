import type { AppData, EmailSituation, ID } from "@/lib/domain/types";
import { STAGE_LABELS } from "@/lib/calculations/pipeline";
import { formatEUR } from "@/lib/formatters";
import type { ActionItem } from "@/lib/crm/action-center";
import type { CrmIndex, ContactView, DealView } from "@/lib/crm/views";
import type { DealRisk } from "./risk";
import { renderTemplate, templateFor, type TemplateVars } from "./templates";

/**
 * Brouillons de relance préparés par l'assistant à partir des règles du centre d'action.
 * Ils ne partent jamais seuls : l'utilisateur les relit, les ouvre dans sa messagerie ou
 * les copie, puis peut consigner l'envoi dans le CRM.
 */

export interface Draft {
  /** Clé stable (situation + contact + opportunité) : sert à masquer un brouillon traité. */
  key: string;
  situation: EmailSituation;
  /** Règle qui a déclenché le brouillon. */
  reason: string;
  contactId: ID;
  contactName: string;
  email: string;
  companyName: string;
  opportunityId: ID | null;
  /** Mission terminée lorsque l'envoi est consigné (relance planifiée). */
  taskId: ID | null;
  subject: string;
  body: string;
}

export interface Sender {
  name: string;
  title: string;
  company: string;
}

export function senderOf(data: Pick<AppData, "settings" | "employees">): Sender {
  const user = data.settings.user;
  const employee = user.employeeId ? data.employees.find((e) => e.id === user.employeeId) : undefined;
  return {
    name: employee ? `${employee.firstName} ${employee.lastName}` : user.name,
    title: employee?.jobTitle ?? "",
    company: data.settings.company.name,
  };
}

const fr = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

export function draftVars(cv: ContactView, deal: DealView | null, sender: Sender): TemplateVars {
  const opp = deal?.opportunity ?? cv.mainOpportunity;
  return {
    prenom: cv.contact.firstName,
    nom: cv.contact.lastName,
    entreprise: cv.company?.name ?? "",
    affaire: opp?.name ?? "",
    montant: opp ? formatEUR(opp.amount, { round: true }) : "",
    etape: opp ? STAGE_LABELS[opp.stage] : "",
    dernier_echange: fr(cv.lastInteraction?.date ?? deal?.lastInteractionAt ?? null),
    expediteur: sender.name,
    fonction: sender.title,
    societe: sender.company,
  };
}

export function buildDraft(data: Pick<AppData, "settings">, situation: EmailSituation, cv: ContactView, deal: DealView | null, sender: Sender, reason: string, taskId: ID | null = null): Draft | null {
  const email = cv.contact.email.trim();
  if (!email || cv.archived) return null;
  const template = templateFor(data.settings.emailTemplates, situation);
  const vars = draftVars(cv, deal, sender);
  const opportunityId = deal?.opportunity.id ?? cv.mainOpportunity?.id ?? null;
  return {
    key: `${situation}:${cv.contact.id}:${opportunityId ?? "-"}`,
    situation,
    reason,
    contactId: cv.contact.id,
    contactName: cv.name,
    email,
    companyName: cv.company?.name ?? "",
    opportunityId,
    taskId,
    subject: renderTemplate(template.subject, vars),
    body: renderTemplate(template.body, vars),
  };
}

/** Types de mission pour lesquels un e-mail est une façon naturelle de relancer. */
const WRITABLE_TASKS = new Set(["email", "followup", "sales_followup", "proposal_send", "retention", "request"]);

/**
 * Brouillons pour les actions du jour (propositions sans réponse, clients inactifs,
 * nouveaux prospects, relances en retard) puis pour les affaires au point mort.
 */
export function buildDrafts(data: Pick<AppData, "settings" | "employees">, index: CrmIndex, actions: ActionItem[], risks: { deal: DealView; risk: DealRisk }[], limit = 8): Draft[] {
  const sender = senderOf(data);
  const out: Draft[] = [];
  const seen = new Set<string>();
  const push = (d: Draft | null) => {
    if (!d || seen.has(d.contactId) || out.length >= limit) return;
    seen.add(d.contactId);
    out.push(d);
  };
  for (const a of actions) {
    const cv = a.contact;
    if (!cv) continue;
    const deal = a.opportunityId ? (index.dealById.get(a.opportunityId) ?? null) : null;
    if (a.kind === "proposal") push(buildDraft(data, "proposal_followup", cv, deal, sender, a.reason));
    else if (a.kind === "inactive") push(buildDraft(data, "reengage_customer", cv, null, sender, a.reason));
    else if (a.kind === "new_prospect") push(buildDraft(data, "first_contact", cv, deal, sender, a.reason));
    else if (a.kind === "overdue" && a.task && WRITABLE_TASKS.has(a.task.type)) push(buildDraft(data, "overdue_followup", cv, deal, sender, a.reason, a.task.id));
  }
  for (const { deal, risk } of risks) {
    if (risk.level !== "high" || !risk.factors.some((f) => f.key === "silence")) continue;
    const cv = deal.contact ? index.contactById.get(deal.contact.id) : undefined;
    if (cv) push(buildDraft(data, "stalled_deal", cv, deal, sender, `Affaire à risque : ${risk.factors[0]?.label ?? "aucun échange récent"}`));
  }
  return out;
}
