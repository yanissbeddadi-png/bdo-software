/**
 * Modèle de domaine de BDO Software.
 *
 * Conventions :
 * - Montants monétaires : centimes entiers (`Cents`).
 * - Taux de TVA : points de base (`2000` = 20 %).
 * - Dates calendaires : chaîne ISO `yyyy-MM-dd` (`ISODate`).
 * - Horodatages : chaîne ISO 8601 complète (`ISODateTime`).
 * - Identifiants : chaînes stables (préfixe par entité + suffixe).
 */

export type ID = string;
export type Cents = number;
export type BasisPoints = number;
export type ISODate = string;
export type ISODateTime = string;

/* ------------------------------------------------------------------ */
/* Organisation, utilisateurs, paramètres                              */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "dirigeant" | "finance" | "commercial" | "chef_projet" | "collaborateur";

export interface VatRate {
  id: ID;
  label: string;
  rate: BasisPoints;
}

export interface CompanySettings {
  name: string;
  legalName: string;
  sector: string;
  country: string;
  currency: "EUR";
  timezone: string;
  address: string;
  email: string;
  phone: string;
  vatRates: VatRate[];
  defaultVatRate: BasisPoints;
  /** Solde bancaire au début de la simulation (donnée de démonstration). */
  openingBalance: Cents;
  openingBalanceDate: ISODate;
  /** Seuil d'alerte de trésorerie. */
  cashAlertThreshold: Cents;
  /** Date de démarrage de la simulation (début de l'historique). */
  simulationStartDate: ISODate;
}

export interface PreferenceSettings {
  language: "fr";
  theme: "dark";
  dateFormat: "dd/MM/yyyy" | "d MMM yyyy";
  compactSidebar: boolean;
  /** Date de référence forcée (sinon date du jour réelle). */
  referenceDate: ISODate | null;
}

export type XpRuleKey =
  | "task_simple"
  | "task_standard"
  | "task_complex"
  | "mission_daily"
  | "goal_intermediate"
  | "goal_major"
  | "project_done"
  | "client_validated"
  | "opportunity_won"
  | "invoice_paid"
  | "achievement_common"
  | "achievement_rare"
  | "achievement_epic"
  | "achievement_legendary";

export interface GamificationSettings {
  enabled: boolean;
  animations: boolean;
  playfulNotifications: boolean;
  xpRewards: Record<XpRuleKey, number>;
  /** Nombre maximal de récompenses « facture payée » par jour (anti-abus). */
  dailyInvoiceXpCap: number;
  /** Nombre maximal de missions personnalisées récompensées par jour. */
  dailyCustomMissionXpCap: number;
  /** Seuil du succès « pipeline commercial ». */
  pipelineAchievementThreshold: Cents;
  /** Nombre de jours d'inactivité avant qu'une opportunité soit jugée inactive. */
  staleOpportunityDays: number;
  /** Nombre de prospects à créer pour la mission hebdomadaire de prospection. */
  weeklyProspectingTarget: number;
  /** Seuls les événements métier datés à partir de cette date rapportent de l'XP. */
  progressionStart: ISODate;
  /** Titre et thème cosmétiques sélectionnés. */
  equippedTitle: string | null;
  equippedTheme: string;
  equippedFrame: string | null;
  /** Date depuis laquelle aucune tâche n'est en retard (succès « semaine sans retard »). */
  noLateTaskSince: ISODate | null;
  /** Niveaux / rangs déjà annoncés (sert uniquement à journaliser les passages). */
  announcedLevel: number;
  announcedRank: number;
  /** Dernière revue des prévisions de trésorerie validée par l'utilisateur. */
  lastCashReviewAt: ISODateTime | null;
}

export type NotificationCategory = "finance" | "commercial" | "projet" | "taches" | "objectifs" | "gamification" | "systeme";

export interface NotificationSettings {
  enabled: Record<NotificationCategory, boolean>;
}

export interface CurrentUser {
  id: ID;
  name: string;
  email: string;
  role: Role;
}

/** Seuils des règles d'alertes et de risques opérationnels (configurables). */
export interface RuleSettings {
  /** Montant à partir duquel une facture en retard est jugée « importante ». */
  bigInvoiceThreshold: Cents;
  /** Charge (heures estimées restantes sur 14 jours) au-delà de laquelle un collaborateur est surchargé. */
  workloadHoursThreshold: number;
  /** Préavis (jours) avant l'échéance d'un contrat récurrent. */
  contractNoticeDays: number;
  /** Fenêtre (jours) des tâches critiques à échéance proche. */
  criticalTaskDays: number;
}

export interface Settings {
  company: CompanySettings;
  rules: RuleSettings;
  preferences: PreferenceSettings;
  gamification: GamificationSettings;
  notifications: NotificationSettings;
  user: CurrentUser;
  /** Indique que le jeu de données provient du seed de démonstration. */
  demo: { seededAt: ISODateTime; anchorDate: ISODate; version: number };
}

/* ------------------------------------------------------------------ */
/* Clients, contacts, prospects                                        */
/* ------------------------------------------------------------------ */

export type ClientStatus = "active" | "inactive" | "churned";

export interface ClientDocument {
  id: ID;
  name: string;
  kind: string;
  addedAt: ISODateTime;
}

export interface Client {
  id: ID;
  name: string;
  sector: string;
  status: ClientStatus;
  city: string;
  website: string;
  /** Satisfaction déclarée (1 à 5), donnée de démonstration. */
  satisfaction: number | null;
  notes: string;
  documents: ClientDocument[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Contact {
  id: ID;
  clientId: ID | null;
  leadId: ID | null;
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted";
export type Priority = "low" | "normal" | "high" | "critical";

export interface Lead {
  id: ID;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  sector: string;
  source: string;
  priority: Priority;
  status: LeadStatus;
  nextAction: string;
  nextActionDate: ISODate | null;
  convertedClientId: ID | null;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Ventes                                                              */
/* ------------------------------------------------------------------ */

export type OpportunityStage = "new" | "contacted" | "qualification" | "meeting" | "proposal" | "negotiation" | "won" | "lost";

export interface Opportunity {
  id: ID;
  name: string;
  clientId: ID | null;
  leadId: ID | null;
  contactId: ID | null;
  amount: Cents;
  /** Probabilité de gain en pourcentage (0–100). */
  probability: number;
  stage: OpportunityStage;
  expectedCloseDate: ISODate;
  source: string;
  ownerId: ID | null;
  lastInteractionAt: ISODateTime;
  nextAction: string;
  notes: string;
  closedAt: ISODateTime | null;
  lostReason: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type SalesActivityType = "call" | "email" | "meeting" | "demo" | "followup" | "note";

export interface SalesActivity {
  id: ID;
  type: SalesActivityType;
  date: ISODateTime;
  subject: string;
  notes: string;
  clientId: ID | null;
  leadId: ID | null;
  opportunityId: ID | null;
  invoiceId: ID | null;
  ownerId: ID | null;
  /** `false` = activité planifiée à venir. */
  done: boolean;
  createdAt: ISODateTime;
}

export type ProductType = "saas" | "license" | "custom_dev" | "maintenance" | "consulting" | "integration" | "support";
export type BillingMode = "one_time" | "monthly" | "yearly" | "daily" | "hourly";

export interface Product {
  id: ID;
  name: string;
  sku: string;
  description: string;
  type: ProductType;
  category: string;
  unitPrice: Cents;
  unitCost: Cents;
  billingMode: BillingMode;
  vatRate: BasisPoints;
  status: "active" | "archived";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Ligne de devis ou de facture. Le prix est figé au moment de la saisie. */
export interface LineItem {
  id: ID;
  productId: ID | null;
  description: string;
  /** Quantité (jusqu'à 2 décimales). */
  quantity: number;
  unitPrice: Cents;
  vatRate: BasisPoints;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "expired";

export interface Quote {
  id: ID;
  number: string;
  clientId: ID;
  opportunityId: ID | null;
  issueDate: ISODate;
  expiryDate: ISODate;
  items: LineItem[];
  status: QuoteStatus;
  invoiceId: ID | null;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

/** Statut stocké. Les statuts « partiellement payée », « payée » et « en retard » sont calculés. */
export type InvoiceBaseStatus = "draft" | "issued" | "cancelled";
export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled";

export interface Invoice {
  id: ID;
  number: string;
  clientId: ID;
  issueDate: ISODate;
  dueDate: ISODate;
  items: LineItem[];
  baseStatus: InvoiceBaseStatus;
  projectId: ID | null;
  quoteId: ID | null;
  subscriptionId: ID | null;
  notes: string;
  cancelledAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type PaymentMethod = "transfer" | "card" | "direct_debit" | "check" | "cash";

export interface Payment {
  id: ID;
  invoiceId: ID;
  date: ISODate;
  amount: Cents;
  method: PaymentMethod;
  reference: string;
  notes: string;
  createdAt: ISODateTime;
}

export type ExpenseCategory = "salaries" | "software" | "hosting" | "marketing" | "contractors" | "hardware" | "office" | "travel" | "bank_fees" | "misc";

export interface Expense {
  id: ID;
  label: string;
  supplier: string;
  category: ExpenseCategory;
  date: ISODate;
  amountHT: Cents;
  vatRate: BasisPoints;
  paid: boolean;
  paidDate: ISODate | null;
  dueDate: ISODate;
  projectId: ID | null;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type SubscriptionPeriodicity = "monthly" | "quarterly" | "yearly";
export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface Subscription {
  id: ID;
  clientId: ID;
  productId: ID | null;
  offer: string;
  /** Montant HT facturé à chaque période. */
  amount: Cents;
  periodicity: SubscriptionPeriodicity;
  startDate: ISODate;
  endDate: ISODate | null;
  status: SubscriptionStatus;
  renewalTerms: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Projets & tâches                                                    */
/* ------------------------------------------------------------------ */

export type ProjectStatus = "to_plan" | "planned" | "in_progress" | "on_hold" | "at_risk" | "done" | "cancelled";

export interface Milestone {
  id: ID;
  title: string;
  dueDate: ISODate;
  done: boolean;
  doneAt: ISODateTime | null;
}

export interface Project {
  id: ID;
  code: string;
  name: string;
  clientId: ID;
  opportunityId: ID | null;
  description: string;
  managerId: ID | null;
  memberIds: ID[];
  startDate: ISODate;
  dueDate: ISODate;
  /** Enveloppe de coûts autorisée. */
  budget: Cents;
  /** Prix de vente contractuel HT. */
  salePrice: Cents;
  /** Coût estimé initial. */
  estimatedCost: Cents;
  priority: Priority;
  status: ProjectStatus;
  risks: string;
  milestones: Milestone[];
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type TaskComplexity = "simple" | "standard" | "complex";
export type TaskRecurrence = "none" | "weekly" | "monthly";

export interface TaskComment {
  id: ID;
  author: string;
  text: string;
  at: ISODateTime;
}

export interface Task {
  id: ID;
  title: string;
  description: string;
  assigneeId: ID | null;
  priority: Priority;
  status: TaskStatus;
  complexity: TaskComplexity;
  dueDate: ISODate | null;
  estimateHours: number;
  actualHours: number;
  projectId: ID | null;
  clientId: ID | null;
  goalId: ID | null;
  dependsOn: ID[];
  comments: TaskComment[];
  recurrence: TaskRecurrence;
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Équipe                                                              */
/* ------------------------------------------------------------------ */

export type Department = "direction" | "development" | "sales" | "marketing" | "finance" | "support" | "operations";
export type SkillKey = "development" | "sales" | "project_management" | "support" | "finance" | "communication" | "analysis";

export interface Employee {
  id: ID;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: Department;
  email: string;
  hireDate: ISODate;
  status: "active" | "leave" | "left";
  /** Coût mensuel chargé estimé. */
  monthlyCost: Cents;
  /** Niveau ludique de 1 à 5 par compétence. */
  skills: Partial<Record<SkillKey, number>>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Objectifs                                                           */
/* ------------------------------------------------------------------ */

export type GoalType = "financial" | "commercial" | "operational" | "customer" | "growth" | "team";

/** Indicateurs calculables automatiquement à partir des données métier. */
export type GoalMetric =
  "manual" | "mrr" | "overdue_receivables" | "won_opportunities" | "projects_completed" | "avg_project_margin" | "late_tasks" | "billed_revenue" | "active_clients" | "new_leads" | "new_subscriptions";

export interface KeyResult {
  id: ID;
  title: string;
  target: number;
  current: number;
  unit: string;
}

export interface Goal {
  id: ID;
  title: string;
  description: string;
  type: GoalType;
  periodLabel: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  ownerId: ID | null;
  metric: GoalMetric;
  startValue: number;
  targetValue: number;
  /** Valeur saisie manuellement (utilisée seulement si `metric === "manual"`). */
  manualValue: number;
  unit: string;
  keyResults: KeyResult[];
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Gamification                                                        */
/* ------------------------------------------------------------------ */

export type MissionCategory = "finance" | "commercial" | "operations" | "projects" | "team" | "strategy" | "personal";
export type MissionType = "daily" | "weekly" | "monthly" | "strategic" | "custom";
export type MissionDifficulty = "easy" | "medium" | "hard" | "epic";
export type MissionStoredStatus = "todo" | "in_progress" | "done" | "cancelled";
export type MissionStatus = MissionStoredStatus | "overdue";

/** Condition de réussite évaluée à partir des données. */
export type MissionCondition =
  | { kind: "manual" }
  | { kind: "invoice_followed_up"; invoiceId: ID }
  | { kind: "invoice_paid"; invoiceId: ID }
  | { kind: "task_done"; taskId: ID }
  | { kind: "opportunity_touched"; opportunityId: ID; since: ISODateTime }
  | { kind: "leads_created"; count: number; since: ISODate }
  | { kind: "sales_activities_logged"; count: number; since: ISODate }
  | { kind: "projects_done"; projectIds: ID[] }
  | { kind: "mrr_reached"; target: Cents }
  | { kind: "cash_review"; since: ISODateTime }
  | { kind: "no_late_tasks" };

export interface EntityRef {
  type: EntityType;
  id: ID;
}

export interface MissionHistoryEntry {
  at: ISODateTime;
  text: string;
}

export interface Mission {
  id: ID;
  title: string;
  description: string;
  category: MissionCategory;
  type: MissionType;
  difficulty: MissionDifficulty;
  priority: Priority;
  status: MissionStoredStatus;
  startDate: ISODate;
  dueDate: ISODate;
  xpReward: number;
  condition: MissionCondition;
  entity: EntityRef | null;
  history: MissionHistoryEntry[];
  /** `auto` = générée par une règle métier (clé d'idempotence `autoKey`). */
  source: "auto" | "custom" | "seed";
  autoKey: string | null;
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface UnlockedAchievement {
  achievementId: string;
  unlockedAt: ISODateTime;
}

export type XpSource = "task" | "mission" | "goal" | "project" | "client" | "opportunity" | "invoice" | "achievement";

export interface XpTransaction {
  id: ID;
  at: ISODateTime;
  amount: number;
  reason: string;
  source: XpSource;
  ref: EntityRef | null;
  /** Clé unique empêchant toute double attribution. */
  idempotencyKey: string;
}

export type ProgressionKind = "xp" | "level_up" | "mission" | "achievement" | "rank" | "reward";

export interface ProgressionEntry {
  id: ID;
  at: ISODateTime;
  kind: ProgressionKind;
  message: string;
  ref: EntityRef | null;
  key: string;
}

/* ------------------------------------------------------------------ */
/* Notifications, activité, audit, notes                               */
/* ------------------------------------------------------------------ */

export type EntityType =
  | "client"
  | "contact"
  | "lead"
  | "opportunity"
  | "activity"
  | "product"
  | "quote"
  | "invoice"
  | "payment"
  | "expense"
  | "subscription"
  | "project"
  | "task"
  | "employee"
  | "goal"
  | "mission"
  | "achievement"
  | "note";

export interface AppNotification {
  id: ID;
  /** Clé de déduplication. */
  key: string;
  category: NotificationCategory;
  severity: "info" | "success" | "warning" | "danger";
  title: string;
  body: string;
  at: ISODateTime;
  read: boolean;
  ref: EntityRef | null;
}

export type ActivityEventType =
  | "invoice_created"
  | "invoice_issued"
  | "invoice_cancelled"
  | "payment_recorded"
  | "client_created"
  | "client_updated"
  | "lead_created"
  | "lead_converted"
  | "opportunity_created"
  | "opportunity_stage"
  | "opportunity_won"
  | "opportunity_lost"
  | "quote_created"
  | "quote_status"
  | "project_created"
  | "project_completed"
  | "project_status"
  | "task_created"
  | "task_completed"
  | "expense_created"
  | "mission_completed"
  | "achievement_unlocked"
  | "goal_updated"
  | "level_up"
  | "rank_up"
  | "note_created"
  | "employee_created"
  | "subscription_created"
  | "product_created"
  | "data_reset";

export interface ActivityEvent {
  id: ID;
  at: ISODateTime;
  type: ActivityEventType;
  description: string;
  ref: EntityRef | null;
}

export interface AuditLog {
  id: ID;
  at: ISODateTime;
  actor: string;
  role: Role;
  action: string;
  ref: EntityRef | null;
  details: string;
}

export interface Note {
  id: ID;
  title: string;
  body: string;
  clientId: ID | null;
  projectId: ID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Agrégat racine                                                      */
/* ------------------------------------------------------------------ */

export interface AppData {
  settings: Settings;
  clients: Client[];
  contacts: Contact[];
  leads: Lead[];
  opportunities: Opportunity[];
  salesActivities: SalesActivity[];
  products: Product[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  subscriptions: Subscription[];
  projects: Project[];
  tasks: Task[];
  employees: Employee[];
  goals: Goal[];
  missions: Mission[];
  achievements: UnlockedAchievement[];
  xpTransactions: XpTransaction[];
  /** Clés d'idempotence déjà consommées avant une réinitialisation de progression (jamais réattribuées). */
  retiredXpKeys: string[];
  progression: ProgressionEntry[];
  notifications: AppNotification[];
  activity: ActivityEvent[];
  auditLogs: AuditLog[];
  notes: Note[];
  /** Compteurs pour la numérotation des pièces. */
  sequences: { invoice: number; quote: number; project: number };
}
