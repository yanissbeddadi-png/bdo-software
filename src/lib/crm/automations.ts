import type { AppData, ISODate } from "@/lib/domain/types";
import type { Alert } from "@/lib/calculations/alerts";
import type { CrmIndex } from "./views";
import { isMissionOpen } from "./views";

/**
 * Automatisations locales, déterministes et explicables. Chaque alerte porte une clé
 * stable : une actualisation de page ne recrée jamais la même notification. Les seuils
 * sont configurables (Paramètres › CRM). Aucune action externe n'est déclenchée.
 *
 * Points d'extension (non implémentés, aucune intégration simulée) : envoi d'e-mails,
 * synchronisation de calendriers, import de contacts, formulaires de génération de
 * leads et webhooks se brancheront sur les commandes de `lib/domain/commands/crm.ts`.
 */
export function crmAlerts(data: AppData, index: CrmIndex, today: ISODate): Alert[] {
  const alerts: Alert[] = [];
  const s = data.settings.crm;

  const overdue = data.tasks.filter((t) => t.type !== "internal" && isMissionOpen(t) && t.dueDate && t.dueDate < today);
  if (overdue.length)
    alerts.push({
      key: `crm-overdue:${today}`,
      kind: "crm_overdue",
      category: "commercial",
      severity: "danger",
      title: `${overdue.length} action${overdue.length > 1 ? "s" : ""} commerciale${overdue.length > 1 ? "s" : ""} en retard`,
      body: "Déclencheur : missions ouvertes dont l'échéance est dépassée. Consultez la vue « En retard » des missions.",
      ref: null,
      weight: 300 + overdue.length,
    });

  for (const t of data.tasks) {
    if (t.type !== "meeting" || !isMissionOpen(t) || t.dueDate !== today) continue;
    alerts.push({
      key: `crm-meeting:${t.id}:${today}`,
      kind: "crm_meeting_today",
      category: "commercial",
      severity: "info",
      title: `Rendez-vous aujourd'hui${t.dueTime ? ` à ${t.dueTime}` : ""}`,
      body: `${t.title}. Déclencheur : rendez-vous planifié à la date du jour (rappel interne, aucune invitation n'est envoyée).`,
      ref: t.contactId ? { type: "contact", id: t.contactId } : { type: "task", id: t.id },
      weight: 220,
    });
  }

  for (const d of index.deals) {
    const o = d.opportunity;
    if (o.archivedAt) continue;
    if (o.stage === "proposal" && d.daysSinceInteraction >= s.proposalPendingDays)
      alerts.push({
        key: `crm-proposal:${o.id}:${d.lastInteractionAt.slice(0, 10)}`,
        kind: "crm_proposal",
        category: "commercial",
        severity: "warning",
        title: `Proposition sans réponse : ${o.name}`,
        body: `Aucune interaction depuis ${d.daysSinceInteraction} jours (seuil : ${s.proposalPendingDays} jours).`,
        ref: { type: "opportunity", id: o.id },
        weight: 250,
      });
    else if (d.stale && !d.openMissions.length)
      alerts.push({
        key: `crm-stale:${o.id}:${d.lastInteractionAt.slice(0, 10)}`,
        kind: "crm_stale",
        category: "commercial",
        severity: "warning",
        title: `Opportunité sans interaction : ${o.name}`,
        body: `Dernière interaction il y a ${d.daysSinceInteraction} jours et aucune action planifiée.`,
        ref: { type: "opportunity", id: o.id },
        weight: 200,
      });
  }

  for (const cv of index.contacts) {
    if (cv.followUp === "to_process")
      alerts.push({
        key: `crm-new:${cv.contact.id}`,
        kind: "crm_new_prospect",
        category: "commercial",
        severity: "info",
        title: `Nouveau prospect à traiter : ${cv.name}`,
        body: `Créé sans interaction ni action planifiée${cv.company ? ` (${cv.company.name})` : ""}.`,
        ref: { type: "contact", id: cv.contact.id },
        weight: 180,
      });
    else if (cv.contact.relation === "customer" && cv.contact.isPrimary && !cv.openMissions.length && cv.daysSinceContact >= s.inactivityDays)
      alerts.push({
        key: `crm-inactive:${cv.contact.id}:${cv.lastInteraction?.date.slice(0, 10) ?? "none"}`,
        kind: "crm_inactive",
        category: "commercial",
        severity: "info",
        title: `Client inactif : ${cv.company?.name ?? cv.name}`,
        body: `Aucune interaction depuis ${cv.daysSinceContact} jours (seuil : ${s.inactivityDays} jours).`,
        ref: { type: "contact", id: cv.contact.id },
        weight: 150,
      });
  }
  return alerts.sort((a, b) => b.weight - a.weight);
}
