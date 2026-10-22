import type { AppData, ISODate } from "@/lib/domain/types";
import { STAGE_LABELS } from "@/lib/calculations/pipeline";
import { activityLabel, RELATION, TASK_TYPE_LABEL } from "@/lib/crm/model";
import { formatEUR } from "@/lib/formatters";
import { compareMissions, isMissionOpen, isRealInteraction } from "@/lib/crm/views";

/**
 * Contexte d'une relation transmis à l'IA pour un résumé. Minimisation des données :
 * ni e-mail, ni téléphone, ni coordonnées ; seulement ce qui sert à préparer l'échange,
 * et uniquement les données que l'utilisateur a le droit de voir (état déjà cloisonné).
 */

const MAX_INTERACTIONS = 12;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fr = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export function accountContext(data: AppData, contactId: string, today: ISODate): string | null {
  const contact = data.contacts.find((c) => c.id === contactId);
  if (!contact) return null;
  const company = contact.clientId ? data.clients.find((c) => c.id === contact.clientId) : undefined;
  const lines: string[] = [`Date du jour : ${fr(today)}`];
  lines.push(`Contact : ${contact.firstName} ${contact.lastName}${contact.jobTitle ? `, ${contact.jobTitle}` : ""} (${RELATION[contact.relation].label})`);
  if (company) lines.push(`Entreprise : ${company.name}${company.sector ? ` — ${company.sector}` : ""}${company.city ? `, ${company.city}` : ""}${company.size ? `, ${company.size} salariés` : ""}`);
  if (contact.notes.trim()) lines.push(`Notes sur le contact : ${clip(contact.notes.trim(), 600)}`);

  const opps = data.opportunities.filter((o) => o.contactId === contact.id || (!!company && o.clientId === company.id));
  if (opps.length) {
    lines.push("Opportunités :");
    for (const o of opps.slice(0, 10))
      lines.push(`- ${o.name} : ${STAGE_LABELS[o.stage]}, ${formatEUR(o.amount, { round: true })}, probabilité ${o.probability} %, signature prévue ${fr(o.expectedCloseDate)}${o.lostReason ? `, motif de perte : ${clip(o.lostReason, 120)}` : ""}`);
  }

  const acts = data.salesActivities
    .filter((a) => isRealInteraction(a) && (a.contactId === contact.id || (!!company && a.clientId === company.id)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_INTERACTIONS);
  if (acts.length) {
    lines.push(`Dernières interactions (${acts.length}, de la plus récente à la plus ancienne) :`);
    for (const a of acts) {
      const extra = [a.outcome && `résultat : ${clip(a.outcome, 160)}`, a.nextStep && `suite convenue : ${clip(a.nextStep, 160)}`, a.notes && `notes : ${clip(a.notes, 240)}`].filter(Boolean).join(" ; ");
      lines.push(`- ${fr(a.date)} · ${activityLabel(a)} · ${clip(a.subject, 140)}${extra ? ` (${extra})` : ""}`);
    }
  } else lines.push("Aucune interaction consignée.");

  const missions = data.tasks.filter((t) => t.type !== "internal" && isMissionOpen(t) && (t.contactId === contact.id || (!!company && t.clientId === company.id))).sort(compareMissions);
  if (missions.length) {
    lines.push("Missions ouvertes :");
    for (const t of missions.slice(0, 8)) lines.push(`- ${t.dueDate ? fr(t.dueDate) : "sans date"} · ${TASK_TYPE_LABEL[t.type]} · ${clip(t.title, 140)}${t.dueDate && t.dueDate < today ? " (en retard)" : ""}`);
  }

  const notes = data.notes.filter((n) => n.contactId === contact.id || (!!company && n.clientId === company.id)).slice(-5);
  if (notes.length) {
    lines.push("Notes :");
    for (const n of notes) lines.push(`- ${clip(`${n.title ? `${n.title} : ` : ""}${n.body}`, 300)}`);
  }
  return lines.join("\n");
}
