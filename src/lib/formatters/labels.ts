import type { BadgeTone } from "@/components/ui/badge";
import type {
  ClientStatus,
  Department,
  GoalType,
  InvoiceStatus,
  LeadStatus,
  PaymentMethod,
  Priority,
  ProjectStatus,
  QuoteStatus,
  Role,
  SkillKey,
  SubscriptionStatus,
  TaskComplexity,
  TaskStatus,
  BillingMode,
  NotificationCategory,
  MissionStatus,
} from "@/lib/domain/types";
import type { GoalStatus } from "@/lib/calculations/goals";

type Meta = { label: string; tone: BadgeTone };

export const INVOICE_STATUS: Record<InvoiceStatus, Meta> = {
  draft: { label: "Brouillon", tone: "neutral" },
  issued: { label: "Émise", tone: "info" },
  partially_paid: { label: "Partiellement payée", tone: "violet" },
  paid: { label: "Payée", tone: "success" },
  overdue: { label: "En retard", tone: "danger" },
  credited: { label: "Annulée par avoir", tone: "neutral" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const QUOTE_STATUS: Record<QuoteStatus, Meta> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyé", tone: "info" },
  accepted: { label: "Accepté", tone: "success" },
  refused: { label: "Refusé", tone: "danger" },
  expired: { label: "Expiré", tone: "warning" },
};

export const PROJECT_STATUS: Record<ProjectStatus, Meta> = {
  to_plan: { label: "À planifier", tone: "neutral" },
  planned: { label: "Planifié", tone: "info" },
  in_progress: { label: "En cours", tone: "violet" },
  on_hold: { label: "En attente", tone: "warning" },
  at_risk: { label: "En risque", tone: "danger" },
  done: { label: "Terminé", tone: "success" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const TASK_STATUS: Record<TaskStatus, Meta> = {
  todo: { label: "À faire", tone: "neutral" },
  in_progress: { label: "En cours", tone: "info" },
  waiting: { label: "En attente", tone: "warning" },
  done: { label: "Terminée", tone: "success" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const PRIORITY: Record<Priority, Meta> = {
  low: { label: "Basse", tone: "neutral" },
  normal: { label: "Normale", tone: "info" },
  high: { label: "Haute", tone: "warning" },
  critical: { label: "Critique", tone: "danger" },
};

export const COMPLEXITY: Record<TaskComplexity, string> = { simple: "Simple", standard: "Standard", complex: "Complexe" };

export const LEAD_STATUS: Record<LeadStatus, Meta> = {
  new: { label: "Nouveau", tone: "info" },
  contacted: { label: "Contacté", tone: "violet" },
  qualified: { label: "Qualifié", tone: "success" },
  unqualified: { label: "Non qualifié", tone: "neutral" },
  converted: { label: "Converti", tone: "gold" },
};

export const CLIENT_STATUS: Record<ClientStatus, Meta> = {
  active: { label: "Actif", tone: "success" },
  inactive: { label: "Inactif", tone: "warning" },
  churned: { label: "Perdu", tone: "neutral" },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, Meta> = {
  active: { label: "Actif", tone: "success" },
  paused: { label: "Suspendu", tone: "warning" },
  cancelled: { label: "Résilié", tone: "neutral" },
};

export const GOAL_STATUS: Record<GoalStatus, Meta> = {
  achieved: { label: "Atteint", tone: "gold" },
  on_track: { label: "En bonne voie", tone: "success" },
  at_risk: { label: "En risque", tone: "danger" },
  missed: { label: "Non atteint", tone: "neutral" },
  not_started: { label: "Pas commencé", tone: "neutral" },
};

export const MISSION_STATUS: Record<MissionStatus, Meta> = {
  todo: { label: "À faire", tone: "neutral" },
  in_progress: { label: "En cours", tone: "info" },
  done: { label: "Terminée", tone: "success" },
  overdue: { label: "En retard", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const GOAL_TYPE: Record<GoalType, string> = {
  financial: "Financier",
  commercial: "Commercial",
  operational: "Opérationnel",
  customer: "Clients",
  growth: "Croissance",
  team: "Équipe",
};

export { ACTIVITY_TYPE } from "@/lib/crm/model";

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  transfer: "Virement",
  card: "Carte bancaire",
  direct_debit: "Prélèvement",
  check: "Chèque",
  cash: "Espèces",
};

export const DEPARTMENT: Record<Department, string> = {
  direction: "Direction",
  development: "Développement",
  sales: "Commercial",
  marketing: "Marketing",
  finance: "Finance",
  support: "Support",
  operations: "Opérations",
};

export const SKILL: Record<SkillKey, string> = {
  development: "Développement",
  sales: "Vente",
  project_management: "Gestion de projet",
  support: "Support",
  finance: "Finance",
  communication: "Communication",
  analysis: "Analyse",
};

export const BILLING_MODE: Record<BillingMode, string> = {
  one_time: "Ponctuel",
  monthly: "Mensuel",
  yearly: "Annuel",
  daily: "Au jour",
  hourly: "À l'heure",
};

export const NOTIFICATION_CATEGORY: Record<NotificationCategory, string> = {
  finance: "Finance",
  commercial: "Commercial",
  projet: "Projets",
  taches: "Tâches",
  objectifs: "Objectifs",
  gamification: "Gamification",
  systeme: "Système",
};

export const ROLE: Record<Role, string> = {
  admin: "Administrateur technique",
  dirigeant: "Directeur commercial",
  finance: "Finance",
  commercial: "Commercial",
  chef_projet: "Chef de projet",
  collaborateur: "Collaborateur",
};

export function options<T extends string>(record: Record<T, Meta | string>): { value: T; label: string }[] {
  return (Object.keys(record) as T[]).map((value) => {
    const v = record[value];
    return { value, label: typeof v === "string" ? v : v.label };
  });
}
