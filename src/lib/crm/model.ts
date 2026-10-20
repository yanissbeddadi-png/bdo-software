import type { BadgeTone } from "@/components/ui/badge";
import type { CrmTaskType, Priority, RelationType, SalesActivity, SalesActivityType } from "@/lib/domain/types";

/**
 * Vocabulaire du CRM (libellés et tons d'affichage). Les énumérations elles-mêmes sont
 * définies dans `lib/domain/types.ts` ; ce module est l'unique source des libellés.
 */

type Meta = { label: string; tone: BadgeTone };

export const RELATION: Record<RelationType, Meta> = {
  prospect: { label: "Prospect", tone: "info" },
  customer: { label: "Client actif", tone: "success" },
  former: { label: "Ancien client", tone: "neutral" },
  partner: { label: "Partenaire", tone: "violet" },
  archived: { label: "Archivé", tone: "neutral" },
};

export const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** Types de missions CRM proposés dans les formulaires (`internal` exclu). */
export const TASK_TYPE: Record<Exclude<CrmTaskType, "internal">, { label: string; icon: string }> = {
  call: { label: "Appel", icon: "Phone" },
  email: { label: "E-mail", icon: "Mail" },
  followup: { label: "Relance", icon: "BellRing" },
  meeting: { label: "Rendez-vous", icon: "CalendarClock" },
  qualification: { label: "Qualification", icon: "Filter" },
  proposal_prep: { label: "Préparation de proposition", icon: "FilePen" },
  proposal_send: { label: "Envoi de proposition", icon: "Send" },
  sales_followup: { label: "Suivi commercial", icon: "TrendingUp" },
  retention: { label: "Fidélisation", icon: "HeartHandshake" },
  request: { label: "Résolution d'une demande", icon: "LifeBuoy" },
  other: { label: "Autre action", icon: "CircleDot" },
};

export const TASK_TYPE_LABEL: Record<CrmTaskType, string> = {
  ...Object.fromEntries(Object.entries(TASK_TYPE).map(([k, v]) => [k, v.label])),
  internal: "Tâche interne",
} as Record<CrmTaskType, string>;

export const ACTIVITY_TYPE: Record<SalesActivityType, string> = {
  call: "Appel",
  email: "E-mail",
  meeting: "Rendez-vous",
  demo: "Démonstration",
  message: "Message",
  followup: "Relance",
  note: "Note",
  stage_change: "Changement d'étape",
  task_done: "Mission terminée",
};

/** Types d'interaction saisissables par l'utilisateur (les deux derniers sont générés). */
export const LOGGABLE_ACTIVITY_TYPES: SalesActivityType[] = ["call", "email", "meeting", "demo", "message", "followup", "note"];

/** Libellé précis d'une interaction (appel sortant, e-mail reçu…). */
export function activityLabel(a: Pick<SalesActivity, "type" | "direction">): string {
  if (a.type === "call") return a.direction === "in" ? "Appel entrant" : "Appel sortant";
  if (a.type === "email") return a.direction === "in" ? "E-mail reçu" : "E-mail envoyé";
  if (a.type === "message") return a.direction === "in" ? "Message reçu" : "Message envoyé";
  return ACTIVITY_TYPE[a.type];
}

/** Sources de contacts par défaut. */
export const DEFAULT_SOURCES: readonly string[] = ["Site web", "Recommandation", "LinkedIn", "Salon", "Appel entrant", "Partenaire", "Client existant", "Campagne e-mail", "Autre"];

/** Sources en vigueur (personnalisables dans Paramètres › CRM, voir `lib/crm/vocabulary.ts`). */
export const SOURCES: string[] = [...DEFAULT_SOURCES];

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

/** Jours ouvrés par défaut : lundi à vendredi. */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
