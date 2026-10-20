/**
 * Jeu de données de démonstration — ENTIÈREMENT FICTIF.
 *
 * Toutes les entreprises, personnes, adresses e-mail (domaine réservé `.example`),
 * numéros et montants sont inventés. Les dates sont générées relativement à une
 * date d'ancrage (`anchor`, par défaut la date du jour) afin que l'historique,
 * les échéances futures et les retards restent cohérents quel que soit le jour de
 * lancement. Le générateur aléatoire est déterministe (graine fixe) : pour une même
 * date d'ancrage, le jeu de données est identique.
 */
import type {
  AppData,
  BrandingSettings,
  CrmSettings,
  ModuleSettings,
  CreditNote,
  Refund,
  VatReturn,
  Employee,
  Expense,
  ExpenseCategory,
  Goal,
  Invoice,
  ISODate,
  ISODateTime,
  LineItem,
  Mission,
  Note,
  Payment,
  PaymentMethod,
  Product,
  Project,
  Quote,
  SalesActivity,
  Settings,
  Subscription,
  Task,
} from "@/lib/domain/types";
import { addDays, addMonths, endOfMonthISO, startOfMonthISO } from "@/lib/calculations/dates";
import { billingDates } from "@/lib/calculations/recurring";
import { documentTotals } from "@/lib/calculations/money";
import { vatAmounts, vatDueDate } from "@/lib/calculations/vat";
import { monthPeriod, monthsBetween } from "@/lib/calculations/dates";
import { finalize } from "@/lib/domain/runtime";
import { crmEntities, crmJournal } from "./seed-crm";
import { DEFAULT_SOURCES, DEFAULT_WORKING_DAYS } from "@/lib/crm/model";
import { DEFAULT_STAGES } from "@/lib/calculations/pipeline";

export const SEED_VERSION = 4;

/* ----------------------------- Utilitaires ----------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const eur = (v: number) => Math.round(v * 100);

export const DEFAULT_XP_REWARDS = {
  task_simple: 10,
  task_standard: 20,
  task_complex: 40,
  mission_daily: 30,
  goal_intermediate: 50,
  goal_major: 150,
  project_done: 100,
  client_validated: 75,
  opportunity_won: 50,
  invoice_paid: 30,
  achievement_common: 50,
  achievement_rare: 200,
  achievement_epic: 300,
  achievement_legendary: 500,
  crm_prospect_qualified: 10,
  crm_contact_completed: 5,
  crm_call_logged: 5,
  crm_followup_done: 10,
  crm_mission_done: 15,
  crm_meeting_report: 20,
  crm_opportunity_qualified: 20,
  crm_week_on_track: 40,
} as const;

export const DEFAULT_CRM_SETTINGS = {
  inactivityDays: 45,
  proposalPendingDays: 10,
  newProspectDays: 7,
  workingDays: [...DEFAULT_WORKING_DAYS],
  dailyCallXpCap: 8,
};

/** Réglages CRM complets par défaut (copies indépendantes à chaque appel). */
export function defaultCrmSettings(): CrmSettings {
  return {
    ...DEFAULT_CRM_SETTINGS,
    workingDays: [...DEFAULT_CRM_SETTINGS.workingDays],
    stages: Object.fromEntries(DEFAULT_STAGES.map((s) => [s.id, { label: s.label, probability: s.defaultProbability }])) as CrmSettings["stages"],
    sources: [...DEFAULT_SOURCES],
  };
}

/** Identité visuelle par défaut : charte BDO. */
export const DEFAULT_BRANDING: BrandingSettings = { logo: null, color: "#E81A3B", bdoMark: true };

/** Tous les modules sont actifs par défaut. */
export const DEFAULT_MODULES: ModuleSettings = { quotes: true, finance: true, projects: true, catalog: true, goals: true, analytics: true, operations: true, offices: true };

export function defaultSettings(anchor: ISODate, now: ISODateTime): Settings {
  const simulationStart = startOfMonthISO(addMonths(anchor, -12));
  return {
    company: {
      name: "BDO Software",
      legalName: "BDO Software SAS (fictive)",
      sector: "Édition de logiciels, SaaS et services numériques",
      country: "France",
      currency: "EUR",
      timezone: "Europe/Paris",
      address: "12 rue de l'Exemple, 69002 Lyon (adresse fictive)",
      email: "contact@bdo-software.example",
      phone: "+33 4 00 00 00 00",
      vatRates: [
        { id: "vat-20", label: "Taux normal", rate: 2000 },
        { id: "vat-10", label: "Taux intermédiaire", rate: 1000 },
        { id: "vat-55", label: "Taux réduit", rate: 550 },
        { id: "vat-0", label: "Exonéré / hors champ", rate: 0 },
      ],
      defaultVatRate: 2000,
      openingBalance: eur(150_000),
      openingBalanceDate: simulationStart,
      cashAlertThreshold: eur(40_000),
      simulationStartDate: simulationStart,
      vatTrackingStart: simulationStart,
      vatDueDay: 24,
    },
    rules: {
      bigInvoiceThreshold: eur(10_000),
      workloadHoursThreshold: 60,
      contractNoticeDays: 45,
      criticalTaskDays: 2,
    },
    preferences: { language: "fr", theme: "dark", dateFormat: "dd/MM/yyyy", compactSidebar: false, referenceDate: null },
    gamification: {
      enabled: true,
      animations: true,
      playfulNotifications: true,
      xpRewards: { ...DEFAULT_XP_REWARDS },
      dailyInvoiceXpCap: 10,
      dailyCustomMissionXpCap: 3,
      pipelineAchievementThreshold: eur(150_000),
      staleOpportunityDays: 14,
      weeklyProspectingTarget: 3,
      equippedTitle: null,
      equippedTheme: "theme-default",
      equippedFrame: null,
      noLateTaskSince: null,
      announcedLevel: 1,
      announcedRank: 1,
      lastCashReviewAt: null,
      progressionStart: addDays(anchor, -75),
    },
    notifications: { enabled: { finance: false, commercial: true, projet: false, taches: false, objectifs: true, gamification: true, systeme: true } },
    crm: defaultCrmSettings(),
    branding: { ...DEFAULT_BRANDING },
    modules: { ...DEFAULT_MODULES },
    user: { id: "usr_sacha", name: "Sacha Renard", email: "sacha.renard@bdo-software.example", role: "dirigeant", employeeId: "emp_sacha" },
    demo: { seededAt: now, anchorDate: anchor, version: SEED_VERSION },
  };
}

/* ----------------------------- Générateur ----------------------------- */

export function createSeedData(anchor: ISODate, now: ISODateTime = `${anchor}T09:00:00.000Z`): AppData {
  const rand = mulberry32(20_260_101);
  const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
  /** Date du mois `offset` (0 = mois d'ancrage), jour borné à la fin du mois. */
  const M = (offset: number, day: number): ISODate => {
    const start = startOfMonthISO(addMonths(anchor, offset));
    const end = endOfMonthISO(start);
    const d = `${start.slice(0, 8)}${String(day).padStart(2, "0")}`;
    return d > end ? end : d;
  };
  const D = (days: number): ISODate => addDays(anchor, days);
  const ts = (date: ISODate, hour = 10): ISODateTime => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  const settings = defaultSettings(anchor, now);

  /* ---------- Équipe ---------- */
  const emp = (id: string, firstName: string, lastName: string, jobTitle: string, department: Employee["department"], hireDate: ISODate, monthly: number, skills: Employee["skills"]): Employee => ({
    id,
    firstName,
    lastName,
    jobTitle,
    department,
    email: `${firstName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${lastName.toLowerCase()}@bdo-software.example`,
    hireDate,
    status: "active",
    monthlyCost: eur(monthly),
    skills,
    createdAt: ts(hireDate),
    updatedAt: ts(hireDate),
  });
  const employees: Employee[] = [
    emp("emp_sacha", "Sacha", "Renard", "Responsable commercial & relation client", "sales", "2022-04-01", 6400, { sales: 5, communication: 5, analysis: 4 }),
    emp("emp_camille", "Camille", "Laurent", "Chargée d'affaires", "sales", "2023-03-01", 5600, { sales: 5, communication: 4, analysis: 3 }),
    emp("emp_hugo", "Hugo", "Martin", "Lead développeur", "development", "2022-09-01", 6200, { development: 5, analysis: 4, project_management: 3 }),
    emp("emp_ines", "Inès", "Moreau", "Développeuse full-stack", "development", M(-6, 1), 4700, { development: 4, support: 2 }),
    emp("emp_thomas", "Thomas", "Petit", "Chef de projet", "operations", "2023-06-01", 5200, { project_management: 5, communication: 4, finance: 2 }),
    emp("emp_lea", "Léa", "Dubois", "Responsable support", "support", "2024-01-15", 3900, { support: 5, communication: 4 }),
    emp("emp_nora", "Nora", "Benali", "Contrôleuse de gestion", "finance", M(-4, 1), 4600, { finance: 5, analysis: 5 }),
  ];

  /* ---------- Catalogue ---------- */
  const prod = (id: string, name: string, sku: string, type: Product["type"], category: string, price: number, cost: number, billingMode: Product["billingMode"], description: string): Product => ({
    id,
    name,
    sku,
    description,
    type,
    category,
    unitPrice: eur(price),
    unitCost: eur(cost),
    billingMode,
    vatRate: 2000,
    status: "active",
    createdAt: ts(settings.company.simulationStartDate),
    updatedAt: ts(settings.company.simulationStartDate),
  });
  const products: Product[] = [
    prod("prd_analytics", "BDO Analytics", "SAAS-ANA", "saas", "Logiciels SaaS", 490, 90, "monthly", "Tableaux de bord décisionnels et reporting automatisé (abonnement par espace)."),
    prod("prd_crm", "BDO CRM", "SAAS-CRM", "saas", "Logiciels SaaS", 350, 60, "monthly", "CRM collaboratif pour PME (abonnement par équipe de 5 utilisateurs)."),
    prod("prd_flow", "BDO Flow", "SAAS-FLW", "saas", "Logiciels SaaS", 290, 50, "monthly", "Orchestration de workflows et validations."),
    prod("prd_cloud", "BDO Cloud", "SAAS-CLD", "saas", "Infrastructure", 690, 260, "monthly", "Hébergement managé, sauvegardes et supervision."),
    prod("prd_dev", "BDO Custom Development", "SRV-DEV", "custom_dev", "Services", 650, 380, "daily", "Développement sur mesure (jour/homme)."),
    prod("prd_maint", "BDO Maintenance", "SRV-MNT", "maintenance", "Services récurrents", 900, 350, "monthly", "Maintenance corrective et évolutive (forfait mensuel)."),
    prod("prd_auto", "BDO Automation", "SRV-AUT", "integration", "Services", 750, 420, "daily", "Automatisation de processus et intégration IA (jour/homme)."),
    prod("prd_consult", "BDO Consulting", "SRV-CNS", "consulting", "Services", 1100, 500, "daily", "Conseil, audit et accompagnement stratégique (jour)."),
    prod("prd_license", "BDO On-Premise", "LIC-ONP", "license", "Licences", 4800, 600, "yearly", "Licence annuelle de la suite BDO installée chez le client."),
    prod("prd_support", "BDO Support Premium", "SUP-PRM", "support", "Services récurrents", 250, 90, "monthly", "Support prioritaire 8h–19h, engagement de délai."),
  ];

  /* ---------- Entreprises, contacts, opportunités (CRM) ---------- */
  const seedHelpers = { anchor, D, M, ts, between };
  const crm = crmEntities(seedHelpers);
  const { clients, contacts, opportunities } = crm;

  /* ---------- Projets ---------- */
  const proj = (
    id: string,
    code: string,
    name: string,
    clientId: string,
    opportunityId: string | null,
    managerId: string,
    memberIds: string[],
    start: ISODate,
    due: ISODate,
    budget: number,
    salePrice: number,
    estimatedCost: number,
    priority: Project["priority"],
    status: Project["status"],
    completed: ISODate | null,
    description: string,
    risks = "",
  ): Project => ({
    id,
    code,
    name,
    clientId,
    opportunityId,
    description,
    managerId,
    memberIds,
    startDate: start,
    dueDate: due,
    budget: eur(budget),
    salePrice: eur(salePrice),
    estimatedCost: eur(estimatedCost),
    priority,
    status,
    risks,
    milestones: [],
    completedAt: completed ? ts(completed, 17) : null,
    createdAt: ts(start),
    updatedAt: ts(completed ?? start),
  });
  const projects: Project[] = [
    proj(
      "prj_001",
      "PRJ-001",
      "Refonte du portail e-commerce B2B",
      "cli_novaretail",
      null,
      "emp_thomas",
      ["emp_hugo", "emp_thomas"],
      M(-12, 3),
      M(-8, 20),
      30_000,
      58_000,
      29_000,
      "high",
      "done",
      M(-8, 18),
      "Refonte complète du portail de commande B2B et connexion à l'ERP du client.",
    ),
    proj(
      "prj_002",
      "PRJ-002",
      "Intégration TMS & BDO Flow",
      "cli_hexa",
      null,
      "emp_thomas",
      ["emp_hugo"],
      M(-11, 1),
      M(-7, 15),
      24_000,
      44_000,
      23_000,
      "normal",
      "done",
      M(-7, 12),
      "Connexion du TMS aux workflows BDO Flow et automatisation des validations.",
    ),
    proj(
      "prj_003",
      "PRJ-003",
      "Site vitrine & configurateur produits",
      "cli_horizon",
      null,
      "emp_thomas",
      ["emp_hugo"],
      M(-9, 5),
      M(-6, 30),
      14_000,
      26_000,
      13_500,
      "normal",
      "done",
      M(-6, 26),
      "Site vitrine et configurateur 3D simplifié des créations.",
    ),
    proj(
      "prj_004",
      "PRJ-004",
      "Tableaux de bord BDO Analytics",
      "cli_finova",
      null,
      "emp_thomas",
      ["emp_ines", "emp_hugo"],
      M(-8, 1),
      M(-5, 10),
      12_000,
      22_000,
      11_000,
      "normal",
      "done",
      M(-4, 28),
      "Déploiement de BDO Analytics et création de 12 tableaux de bord.",
      "Livré avec retard (reprise des données historiques).",
    ),
    proj(
      "prj_005",
      "PRJ-005",
      "Migration cloud & BDO Cloud",
      "cli_cloudnest",
      null,
      "emp_hugo",
      ["emp_hugo", "emp_ines"],
      M(-6, 3),
      M(-2, 28),
      28_000,
      52_000,
      27_000,
      "high",
      "done",
      M(-2, 24),
      "Migration de l'infrastructure vers BDO Cloud et mise en place de la supervision.",
    ),
    proj(
      "prj_006",
      "PRJ-006",
      "Automatisation des devis (BDO Automation)",
      "cli_orbis",
      "opp_orbis_auto",
      "emp_thomas",
      ["emp_hugo", "emp_ines", "emp_thomas"],
      M(-4, 18),
      D(30),
      24_000,
      68_000,
      34_000,
      "critical",
      "in_progress",
      null,
      "Génération automatique des devis à partir de l'ERP et assistant IA de chiffrage.",
      "Complexité de l'interface ERP sous-estimée.",
    ),
    proj(
      "prj_007",
      "PRJ-007",
      "Application mobile de suivi PixelForge",
      "cli_pixelforge",
      "opp_pixel_app",
      "emp_thomas",
      ["emp_ines", "emp_hugo"],
      M(-4, 28),
      D(60),
      44_000,
      82_000,
      42_000,
      "high",
      "in_progress",
      null,
      "Application iOS/Android de suivi de production et notifications temps réel.",
    ),
    proj(
      "prj_008",
      "PRJ-008",
      "Déploiement BDO CRM",
      "cli_greenpulse",
      null,
      "emp_thomas",
      ["emp_lea", "emp_ines"],
      M(-3, 1),
      D(-6),
      14_000,
      28_000,
      13_000,
      "high",
      "at_risk",
      null,
      "Paramétrage, reprise des données et formation des équipes.",
      "Données sources de mauvaise qualité, disponibilité client limitée.",
    ),
    proj(
      "prj_009",
      "PRJ-009",
      "Portail collaborateurs Synapse RH",
      "cli_synapse",
      "opp_synapse_portal",
      "emp_thomas",
      ["emp_hugo", "emp_ines"],
      M(-3, 22),
      D(45),
      24_000,
      46_000,
      23_500,
      "normal",
      "in_progress",
      null,
      "Portail RH en libre-service (congés, documents, entretiens).",
    ),
    proj(
      "prj_010",
      "PRJ-010",
      "Data warehouse & BDO Analytics",
      "cli_dataspring",
      "opp_dataspring_dw",
      "emp_hugo",
      ["emp_hugo", "emp_nora"],
      D(10),
      D(100),
      30_000,
      56_000,
      29_000,
      "normal",
      "planned",
      null,
      "Entrepôt de données et tableaux de bord de pilotage.",
    ),
    proj(
      "prj_011",
      "PRJ-011",
      "Audit SI & feuille de route",
      "cli_ecobatir",
      null,
      "emp_thomas",
      ["emp_thomas"],
      M(-2, 5),
      D(20),
      7_000,
      13_200,
      6_500,
      "low",
      "on_hold",
      null,
      "Audit du système d'information et feuille de route à 3 ans.",
      "En attente des accès aux systèmes existants.",
    ),
    proj(
      "prj_012",
      "PRJ-012",
      "Chatbot support IA",
      "cli_lumina",
      "opp_lumina_bot",
      "emp_hugo",
      ["emp_hugo", "emp_lea"],
      D(14),
      D(90),
      16_000,
      32_000,
      15_500,
      "normal",
      "to_plan",
      null,
      "Assistant conversationnel de support basé sur la base de connaissances.",
    ),
  ];
  const ms = (projectId: string, title: string, due: ISODate, done: boolean) => {
    const p = projects.find((x) => x.id === projectId)!;
    p.milestones.push({ id: `ms_${projectId}_${p.milestones.length + 1}`, title, dueDate: due, done, doneAt: done ? ts(due, 17) : null });
  };
  ms("prj_006", "Cadrage & spécifications", M(-3, 10), true);
  ms("prj_006", "Connecteur ERP", M(-1, 20), true);
  ms("prj_006", "Assistant de chiffrage IA", D(10), false);
  ms("prj_006", "Recette & mise en production", D(28), false);
  ms("prj_007", "Maquettes validées", M(-3, 25), true);
  ms("prj_007", "Version bêta", D(15), false);
  ms("prj_007", "Publication sur les stores", D(58), false);
  ms("prj_008", "Paramétrage", M(-2, 15), true);
  ms("prj_008", "Reprise des données", D(-12), false);
  ms("prj_008", "Formation des utilisateurs", D(-6), false);
  ms("prj_009", "Spécifications fonctionnelles", M(-2, 20), true);
  ms("prj_009", "Module congés", D(5), false);
  ms("prj_009", "Mise en production", D(44), false);
  ms("prj_010", "Atelier de cadrage", D(15), false);

  /* ---------- Tâches ---------- */
  const tasks: Task[] = [];
  let taskN = 0;
  const task = (
    title: string,
    projectId: string | null,
    assigneeId: string,
    priority: Task["priority"],
    status: Task["status"],
    complexity: Task["complexity"],
    due: ISODate | null,
    estimate: number,
    actual: number,
    opts: Partial<Task> = {},
  ) => {
    taskN++;
    const id = `tsk_${String(taskN).padStart(3, "0")}`;
    const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
    const created = opts.createdAt ?? ts(project ? project.startDate : addDays(due ?? anchor, -14));
    const completedAt = status === "done" ? (opts.completedAt ?? ts(due && due < anchor ? addDays(due, -between(0, 2)) : addDays(anchor, -between(1, 5)), 16)) : null;
    tasks.push({
      id,
      title,
      description: opts.description ?? "",
      type: "internal",
      contactId: null,
      opportunityId: null,
      dueTime: null,
      result: "",
      assigneeId,
      priority,
      status,
      complexity,
      dueDate: due,
      estimateHours: estimate,
      actualHours: actual,
      projectId,
      clientId: project?.clientId ?? opts.clientId ?? null,
      goalId: opts.goalId ?? null,
      dependsOn: opts.dependsOn ?? [],
      comments: opts.comments ?? [],
      recurrence: opts.recurrence ?? "none",
      completedAt,
      createdAt: created,
      updatedAt: completedAt ?? created,
    });
    return id;
  };
  // Projets terminés (historique).
  task("Ateliers de cadrage portail B2B", "prj_001", "emp_thomas", "high", "done", "standard", M(-11, 10), 40, 44);
  task("Développement du catalogue et du panier", "prj_001", "emp_hugo", "high", "done", "complex", M(-9, 20), 380, 402);
  task("Connecteur ERP NovaRetail", "prj_001", "emp_hugo", "high", "done", "complex", M(-8, 10), 200, 214);
  task("Cartographie des workflows HexaLogistics", "prj_002", "emp_thomas", "normal", "done", "standard", M(-10, 5), 30, 28);
  task("Intégration API TMS", "prj_002", "emp_hugo", "high", "done", "complex", M(-8, 25), 420, 410);
  task("Maquettes du configurateur", "prj_003", "emp_hugo", "normal", "done", "standard", M(-8, 10), 60, 58);
  task("Intégration du configurateur 3D", "prj_003", "emp_hugo", "normal", "done", "complex", M(-7, 15), 170, 182);
  task("Reprise des données historiques Finova", "prj_004", "emp_ines", "normal", "done", "complex", M(-5, 5), 120, 168);
  task("Conception des tableaux de bord", "prj_004", "emp_ines", "normal", "done", "standard", M(-5, 20), 90, 96);
  task("Plan de migration CloudNest", "prj_005", "emp_hugo", "high", "done", "standard", M(-5, 10), 40, 38);
  task("Migration des environnements", "prj_005", "emp_ines", "high", "done", "complex", M(-3, 20), 480, 520);
  task("Supervision & runbooks", "prj_005", "emp_hugo", "normal", "done", "standard", M(-2, 20), 60, 56);
  // PRJ-006 Orbis (dépassement budgétaire).
  const t6a = task("Spécifications du connecteur ERP", "prj_006", "emp_thomas", "high", "done", "standard", M(-3, 8), 30, 38);
  const t6b = task("Connecteur ERP Orbis", "prj_006", "emp_hugo", "critical", "done", "complex", M(-1, 18), 160, 236, { dependsOn: [t6a] });
  const t6c = task("Moteur de règles de chiffrage", "prj_006", "emp_ines", "high", "in_progress", "complex", D(6), 110, 96, { dependsOn: [t6b] });
  task("Assistant IA de chiffrage", "prj_006", "emp_hugo", "critical", "in_progress", "complex", D(1), 90, 40, {
    dependsOn: [t6b],
    comments: [{ id: "cmt_1", author: "Thomas Petit", text: "Point de vigilance : le jeu de données d'entraînement n'est pas encore complet.", at: ts(D(-3), 11) }],
  });
  task("Recette utilisateur Orbis", "prj_006", "emp_thomas", "high", "todo", "standard", D(24), 24, 0, { dependsOn: [t6c] });
  // PRJ-007 PixelForge.
  task("Maquettes UX de l'application", "prj_007", "emp_ines", "high", "done", "standard", M(-3, 22), 80, 88);
  task("Socle technique mobile", "prj_007", "emp_hugo", "high", "done", "complex", M(-2, 15), 180, 176);
  task("Notifications temps réel", "prj_007", "emp_hugo", "normal", "in_progress", "complex", D(8), 160, 60);
  task("Écrans de suivi de production", "prj_007", "emp_ines", "normal", "in_progress", "standard", D(12), 120, 44);
  task("Tests sur appareils", "prj_007", "emp_lea", "normal", "todo", "standard", D(40), 24, 0);
  // PRJ-008 GreenPulse (en risque, en retard).
  task("Paramétrage des pipelines CRM", "prj_008", "emp_ines", "high", "done", "standard", M(-2, 12), 50, 56);
  task("Nettoyage et import des contacts", "prj_008", "emp_lea", "critical", "in_progress", "complex", D(-9), 80, 74, {
    comments: [{ id: "cmt_2", author: "Léa Dubois", text: "Fichier source avec 18 % de doublons, en attente de validation client.", at: ts(D(-8), 9) }],
  });
  task("Sessions de formation GreenPulse", "prj_008", "emp_lea", "high", "todo", "standard", D(-4), 30, 0);
  task("Rédaction du guide utilisateur", "prj_008", "emp_lea", "normal", "waiting", "simple", D(-2), 8, 3);
  // PRJ-009 Synapse.
  task("Spécifications du portail RH", "prj_009", "emp_thomas", "normal", "done", "standard", M(-2, 18), 40, 36);
  task("Module de gestion des congés", "prj_009", "emp_ines", "high", "in_progress", "complex", D(4), 140, 90);
  task("Coffre-fort de documents", "prj_009", "emp_hugo", "normal", "todo", "standard", D(25), 40, 0);
  task("Paramétrage SSO", "prj_009", "emp_hugo", "normal", "todo", "standard", D(30), 16, 0);
  // PRJ-010, 011, 012.
  task("Préparer l'atelier de cadrage DataSpring", "prj_010", "emp_nora", "normal", "todo", "simple", D(12), 6, 0);
  task("Collecter les accès aux systèmes ÉcoBâtir", "prj_011", "emp_thomas", "low", "waiting", "simple", D(-15), 2, 0.5);
  task("Rédiger le plan projet du chatbot", "prj_012", "emp_hugo", "normal", "todo", "standard", D(16), 12, 0);
  // Tâches internes / transverses.
  task("Clôture mensuelle de septembre", null, "emp_nora", "high", "done", "standard", M(-1, 8), 12, 11, { recurrence: "monthly" });
  task("Clôture mensuelle d'octobre", null, "emp_nora", "high", "todo", "standard", M(1, 8), 12, 0, { recurrence: "monthly" });
  task("Relancer les factures GreenPulse échues", null, "emp_nora", "critical", "todo", "simple", D(-1), 2, 0, { clientId: "cli_greenpulse" });
  task("Mettre à jour la grille tarifaire 2027", null, "emp_camille", "normal", "in_progress", "standard", D(20), 10, 4);
  task("Préparer le webinar BDO Analytics", null, "emp_camille", "normal", "todo", "standard", D(18), 14, 0);
  task("Revue hebdomadaire du pipeline", null, "emp_camille", "normal", "done", "simple", D(-4), 1, 1, { recurrence: "weekly" });
  task("Revue hebdomadaire du pipeline", null, "emp_camille", "normal", "todo", "simple", D(3), 1, 0, { recurrence: "weekly" });
  task("Renouvellement du contrat Synapse RH", null, "emp_camille", "high", "todo", "simple", D(10), 3, 0, { clientId: "cli_synapse" });
  task("Mise à jour de la base de connaissances support", null, "emp_lea", "low", "in_progress", "simple", D(14), 8, 3);
  task("Audit des abonnements logiciels internes", null, "emp_nora", "normal", "todo", "standard", D(9), 6, 0);
  task("Onboarding LuminaTech", null, "emp_lea", "normal", "done", "simple", D(-5), 4, 4, { clientId: "cli_lumina" });
  task("Entretien annuel — équipe développement", null, "emp_hugo", "normal", "todo", "simple", D(-3), 3, 0);
  task("Préparer le comité de direction trimestriel", null, "emp_nora", "high", "todo", "standard", D(7), 8, 0);
  task("Analyse de satisfaction client T3", null, "emp_lea", "normal", "done", "standard", M(-1, 25), 10, 9, { goalId: "goal_satisfaction" });

  /* ---------- Abonnements ---------- */
  const sub = (
    id: string,
    clientId: string,
    productId: string,
    offer: string,
    amount: number,
    periodicity: Subscription["periodicity"],
    start: ISODate,
    end: ISODate | null,
    status: Subscription["status"],
    renewalTerms = "Tacite reconduction annuelle, préavis 2 mois",
  ): Subscription => ({
    id,
    clientId,
    productId,
    offer,
    amount: eur(amount),
    periodicity,
    startDate: start,
    endDate: end,
    status,
    renewalTerms,
    createdAt: ts(start),
    updatedAt: ts(start),
  });
  const subscriptions: Subscription[] = [
    sub("sub_nova_ana", "cli_novaretail", "prd_analytics", "BDO Analytics — 2 espaces", 980, "monthly", M(-12, 5), null, "active"),
    sub("sub_hexa_flow", "cli_hexa", "prd_flow", "BDO Flow", 290, "monthly", M(-10, 1), null, "active"),
    sub("sub_hexa_cloud", "cli_hexa", "prd_cloud", "BDO Cloud", 690, "monthly", M(-10, 1), null, "active"),
    sub("sub_green_crm", "cli_greenpulse", "prd_crm", "BDO CRM — 3 équipes", 1050, "monthly", M(-8, 10), null, "active"),
    sub("sub_finova_ana", "cli_finova", "prd_analytics", "BDO Analytics — licence annuelle", 5400, "yearly", M(-9, 15), null, "active"),
    sub("sub_cloudnest", "cli_cloudnest", "prd_cloud", "BDO Cloud — 2 environnements", 1380, "monthly", M(-7, 1), null, "active"),
    sub("sub_orbis_maint", "cli_orbis", "prd_maint", "BDO Maintenance", 900, "monthly", M(-6, 5), null, "active"),
    sub("sub_pixel_crm", "cli_pixelforge", "prd_crm", "BDO CRM — 2 équipes", 700, "monthly", M(-5, 12), null, "active"),
    sub("sub_bluepeak_sup", "cli_bluepeak", "prd_support", "BDO Support Premium", 750, "quarterly", M(-6, 15), null, "active"),
    sub("sub_dataspring_ana", "cli_dataspring", "prd_analytics", "BDO Analytics — 2 espaces", 980, "monthly", M(-2, 1), null, "active"),
    sub("sub_lumina_flow", "cli_lumina", "prd_flow", "BDO Flow — 2 instances", 580, "monthly", M(-1, 6), null, "active"),
    sub("sub_synapse_maint", "cli_synapse", "prd_maint", "BDO Maintenance", 900, "monthly", M(-3, 25), D(25), "active", "Contrat de 4 mois, renouvellement à négocier"),
    sub("sub_horizon_sup", "cli_horizon", "prd_support", "BDO Support Premium", 250, "monthly", M(-6, 1), null, "active"),
    sub("sub_urban_crm", "cli_urbanflow", "prd_crm", "BDO CRM", 350, "monthly", M(-12, 10), M(-5, 9), "cancelled", "Résilié"),
  ];

  /* ---------- Factures & paiements ---------- */
  type Draft = Omit<Invoice, "number"> & { pay?: { delay: number; share?: number; method?: PaymentMethod } | "unpaid" };
  const drafts: Draft[] = [];
  let invN = 0;
  const line = (productId: string | null, description: string, quantity: number, unitPrice: number, vatRate = 2000): LineItem => ({
    id: `li_${++invN}_${between(100, 999)}`,
    productId,
    description,
    quantity,
    unitPrice: eur(unitPrice),
    vatRate,
  });
  const inv = (
    clientId: string,
    issue: ISODate,
    items: LineItem[],
    opts: { projectId?: string; subscriptionId?: string; quoteId?: string; term?: number; pay?: Draft["pay"]; notes?: string } = {},
  ) => {
    const id = `inv_${String(drafts.length + 1).padStart(3, "0")}`;
    drafts.push({
      id,
      clientId,
      issueDate: issue,
      dueDate: addDays(issue, opts.term ?? 30),
      items,
      baseStatus: "issued",
      projectId: opts.projectId ?? null,
      quoteId: opts.quoteId ?? null,
      subscriptionId: opts.subscriptionId ?? null,
      notes: opts.notes ?? "",
      cancelledAt: null,
      createdAt: ts(issue, 8),
      updatedAt: ts(issue, 8),
      pay: opts.pay,
    });
    return id;
  };
  // Factures de projets (acompte / jalons / solde).
  const projectProduct: Record<string, string> = { prj_006: "prd_auto", prj_012: "prd_auto", prj_011: "prd_consult", prj_004: "prd_consult", prj_005: "prd_dev" };
  const projectBill = (p: Project, share: number, issue: ISODate, label: string, pay?: Draft["pay"]) =>
    inv(p.clientId, issue, [line(projectProduct[p.id] ?? "prd_dev", `${p.name} — ${label}`, 1, (p.salePrice / 100) * share)], { projectId: p.id, pay });
  const byId = (id: string) => projects.find((p) => p.id === id)!;
  projectBill(byId("prj_001"), 0.3, M(-12, 5), "acompte 30 %");
  projectBill(byId("prj_001"), 0.4, M(-10, 15), "jalon recette 40 %");
  projectBill(byId("prj_001"), 0.3, M(-8, 20), "solde 30 %");
  projectBill(byId("prj_002"), 0.4, M(-11, 3), "acompte 40 %");
  projectBill(byId("prj_002"), 0.6, M(-7, 14), "solde 60 %");
  projectBill(byId("prj_003"), 0.5, M(-9, 6), "acompte 50 %");
  projectBill(byId("prj_003"), 0.5, M(-6, 28), "solde 50 %");
  projectBill(byId("prj_004"), 0.3, M(-8, 3), "acompte 30 %");
  projectBill(byId("prj_004"), 0.7, M(-4, 29), "solde 70 %", { delay: 52 });
  projectBill(byId("prj_005"), 0.3, M(-6, 5), "acompte 30 %");
  projectBill(byId("prj_005"), 0.3, M(-4, 10), "jalon migration 30 %");
  projectBill(byId("prj_005"), 0.4, M(-2, 26), "solde 40 %", { delay: 28 });
  projectBill(byId("prj_006"), 0.3, M(-4, 20), "acompte 30 %");
  projectBill(byId("prj_006"), 0.4, M(-1, 21), "jalon connecteur ERP 40 %", { delay: 21, share: 0.5 });
  projectBill(byId("prj_007"), 0.3, M(-4, 30), "acompte 30 %", { delay: 40, share: 0.6, method: "transfer" });
  projectBill(byId("prj_008"), 0.3, M(-3, 2), "acompte 30 %");
  projectBill(byId("prj_008"), 0.4, M(-2, 16), "jalon paramétrage 40 %", "unpaid");
  projectBill(byId("prj_009"), 0.3, M(-3, 23), "acompte 30 %");
  projectBill(byId("prj_010"), 0.3, D(-12), "acompte 30 %", "unpaid");
  projectBill(byId("prj_011"), 0.5, M(-2, 6), "acompte 50 %", { delay: 15 });
  projectBill(byId("prj_012"), 0.3, D(-7), "acompte 30 %", "unpaid");
  // Prestations ponctuelles.
  inv("cli_medialink", M(-9, 12), [line("prd_consult", "Atelier de cadrage intranet", 4, 1100)], { pay: { delay: 35 } });
  inv("cli_medialink", M(-5, 18), [line("prd_consult", "Étude de faisabilité intranet", 6, 1100)], { pay: "unpaid", notes: "Relancé à plusieurs reprises." });
  inv("cli_bluepeak", M(-6, 16), [line("prd_auto", "Automatisation des réservations", 8, 750)]);
  inv("cli_urbanflow", M(-11, 20), [line("prd_dev", "Développements spécifiques application mobilité", 12, 650)]);
  inv("cli_horizon", M(-3, 14), [line("prd_dev", "Évolutions du configurateur", 5, 650)]);
  inv("cli_novaretail", M(-2, 9), [line("prd_consult", "Audit de performance du portail", 3, 1100), line("prd_dev", "Optimisations front-end", 6, 650)], { pay: { delay: 18, method: "card" } });
  inv("cli_finova", M(-1, 12), [line("prd_license", "Licence BDO On-Premise — poste supplémentaire", 1, 4800)], { pay: "unpaid", term: 45 });
  inv("cli_pixelforge", D(-20), [line("prd_auto", "Pipeline d'intégration continue", 4, 750)], { pay: "unpaid" });
  // Factures d'abonnements, à chaque échéance jusqu'à la date d'ancrage.
  for (const s of subscriptions) {
    for (const d of billingDates(s, s.startDate, anchor)) {
      const greenOverdue = s.id === "sub_green_crm" && d >= M(-2, 1);
      const recent = d > addDays(anchor, -25);
      inv(s.clientId, d, [line(s.productId, `${s.offer} — échéance du ${d.split("-").reverse().join("/")}`, 1, s.amount / 100)], {
        subscriptionId: s.id,
        pay: greenOverdue || recent ? "unpaid" : { delay: between(3, 26), method: "direct_debit" },
      });
    }
  }
  // Un brouillon et une facture annulée pour illustrer les statuts.
  const draftId = inv("cli_ecobatir", D(-1), [line("prd_consult", "Restitution de l'audit SI", 2, 1100)], { pay: "unpaid", notes: "À émettre après la restitution." });
  drafts.find((d) => d.id === draftId)!.baseStatus = "draft";
  const cancelledId = inv("cli_bluepeak", M(-2, 3), [line("prd_dev", "Développement application terrain (erreur de saisie)", 10, 650)], { pay: "unpaid" });
  Object.assign(
    drafts.find((d) => d.id === cancelledId)!,
    { baseStatus: "cancelled", cancelledAt: ts(M(-2, 4)), notes: "Annulée : projet perdu, facture émise par erreur." },
  );

  // Numérotation chronologique continue des factures émises.
  drafts.sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id.localeCompare(b.id));
  let invoiceSeq = 0;
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  for (const d of drafts) {
    const { pay, ...rest } = d;
    let number: string;
    if (d.baseStatus === "draft") number = `BROUILLON-${d.id.slice(4).toUpperCase()}`;
    else number = `FAC-${d.issueDate.slice(0, 4)}-${String(++invoiceSeq).padStart(4, "0")}`;
    invoices.push({ ...rest, number });
    if (d.baseStatus !== "issued" || pay === "unpaid") continue;
    const ttc = documentTotals(d.items).totalTTC;
    const delay = pay?.delay ?? between(8, 38);
    const date = addDays(d.issueDate, delay);
    if (date >= anchor) continue;
    const share = pay?.share ?? 1;
    payments.push({
      id: `pay_${String(payments.length + 1).padStart(3, "0")}`,
      invoiceId: d.id,
      date,
      amount: Math.round(ttc * share),
      method: pay?.method ?? "transfer",
      reference: `VIR-${date.replace(/-/g, "")}-${between(100, 999)}`,
      notes: share < 1 ? "Paiement partiel" : "",
      createdAt: ts(date, 11),
    });
  }

  /* ---------- Devis ---------- */
  const quote = (id: string, number: string, clientId: string, opportunityId: string | null, issue: ISODate, status: Quote["status"], items: LineItem[], invoiceId: string | null = null): Quote => ({
    id,
    number,
    clientId,
    opportunityId,
    issueDate: issue,
    expiryDate: addDays(issue, 30),
    items,
    status,
    invoiceId,
    notes: "",
    createdAt: ts(issue),
    updatedAt: ts(issue),
  });
  const y = (d: ISODate) => d.slice(0, 4);
  const quotes: Quote[] = [
    quote("quo_001", `DEV-${y(M(-5, 20))}-0001`, "cli_orbis", "opp_orbis_auto", M(-5, 20), "accepted", [
      line("prd_auto", "Automatisation des devis — forfait", 60, 750),
      line("prd_consult", "Pilotage & cadrage", 21, 1100),
      line(null, "Remise commerciale", 1, -100),
    ]),
    quote("quo_002", `DEV-${y(M(-5, 28))}-0002`, "cli_pixelforge", "opp_pixel_app", M(-5, 28), "accepted", [
      line("prd_dev", "Application mobile iOS/Android", 120, 650),
      line("prd_consult", "Direction de projet", 4, 1100),
      line(null, "Remise commerciale", 1, -400),
    ]),
    quote("quo_003", `DEV-${y(M(-4, 28))}-0003`, "cli_synapse", "opp_synapse_portal", M(-4, 28), "accepted", [
      line("prd_dev", "Portail collaborateurs", 64, 650),
      line("prd_consult", "Ateliers RH", 4, 1100),
    ]),
    quote("quo_004", `DEV-${y(M(-2, 20))}-0004`, "cli_dataspring", "opp_dataspring_dw", M(-2, 20), "accepted", [
      line("prd_dev", "Data warehouse", 72, 650),
      line("prd_consult", "Architecture data", 10, 1100),
      line(null, "Remise volume", 1, -1800),
    ]),
    quote("quo_005", `DEV-${y(M(-1, 25))}-0005`, "cli_lumina", "opp_lumina_bot", M(-1, 25), "accepted", [
      line("prd_auto", "Chatbot support IA", 40, 750),
      line("prd_consult", "Conception conversationnelle", 4, 1100),
      line(null, "Remise lancement", 1, -2400),
    ]),
    quote("quo_006", `DEV-${y(M(-4, 12))}-0006`, "cli_medialink", "opp_medialink_intranet", M(-4, 12), "refused", [
      line("prd_dev", "Refonte intranet", 52, 650),
      line("prd_consult", "Conduite du changement", 4, 1100),
    ]),
    quote("quo_007", `DEV-${y(M(-3, 6))}-0007`, "cli_bluepeak", "opp_bluepeak_field", M(-3, 6), "expired", [line("prd_dev", "Application terrain", 32, 650), line("prd_consult", "Cadrage", 3, 1100)]),
    quote("quo_008", `DEV-${y(D(-12))}-0008`, "cli_novaretail", "opp_nova_multisite", D(-12), "sent", [
      line("prd_analytics", "BDO Analytics — 4 espaces supplémentaires (12 mois)", 48, 490),
      line("prd_consult", "Déploiement multi-sites", 8, 1100),
    ]),
    quote("quo_009", `DEV-${y(D(-7))}-0009`, "cli_hexa", "opp_hexa_ai", D(-7), "sent", [
      line("prd_auto", "Module IA de prévision des flux", 50, 750),
      line("prd_consult", "Data science & cadrage", 7, 1100),
    ]),
    quote("quo_010", `DEV-${y(D(-2))}-0010`, "cli_greenpulse", "opp_green_training", D(-2), "draft", [
      line("prd_consult", "Formation & accompagnement BDO CRM", 6, 1100),
      line("prd_support", "Support Premium (6 mois)", 6, 250),
      line(null, "Remise fidélité", 1, -600),
    ]),
  ];

  /* ---------- Dépenses ---------- */
  const expenses: Expense[] = [];
  const expense = (
    label: string,
    supplier: string,
    category: ExpenseCategory,
    date: ISODate,
    amountHT: number,
    vatRate: number,
    paidDelay: number | null,
    opts: { projectId?: string; due?: ISODate; notes?: string } = {},
  ) => {
    const paidDate = paidDelay === null ? null : addDays(date, paidDelay);
    const paid = paidDate !== null && paidDate <= anchor;
    expenses.push({
      id: `exp_${String(expenses.length + 1).padStart(3, "0")}`,
      label,
      supplier,
      category,
      date,
      amountHT: eur(amountHT),
      vatRate,
      paid,
      paidDate: paid ? paidDate : null,
      dueDate: opts.due ?? addDays(date, 30),
      projectId: opts.projectId ?? null,
      notes: opts.notes ?? "",
      createdAt: ts(date),
      updatedAt: ts(paid ? paidDate! : date),
    });
  };
  const monthsBack = 12;
  for (let i = monthsBack; i >= 0; i--) {
    const first = M(-i, 1);
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${first}T12:00:00Z`));
    const payroll = employees.filter((e) => e.hireDate <= endOfMonthISO(first)).reduce((s, e) => s + e.monthlyCost, 0) / 100;
    if (M(-i, 28) < anchor) expense(`Salaires et charges — ${label}`, "Paie interne", "salaries", M(-i, 28), payroll, 0, 0, { due: M(-i, 28) });
    if (M(-i, 1) <= anchor) expense(`Loyer bureaux Lyon — ${label}`, "Foncière Rhône Exemple", "office", M(-i, 1), 2900, 2000, 4, { due: M(-i, 5) });
    if (M(-i, 3) <= anchor) expense(`Licences logicielles — ${label}`, "Éditeurs SaaS (regroupés)", "software", M(-i, 3), 980, 2000, 0, { due: M(-i, 3) });
    if (M(-i, 2) <= anchor) expense(`Infrastructure cloud — ${label}`, "Hébergeur Exemple", "hosting", M(-i, 2), 1450 + (12 - i) * 35, 2000, 10, { due: M(-i, 12) });
    if (M(-i, 25) < anchor) expense(`Frais bancaires — ${label}`, "Banque Exemple", "bank_fees", M(-i, 25), 42, 0, 0, { due: M(-i, 25) });
  }
  expense("Stand salon Tech&Co", "Salons Exemple", "marketing", M(-10, 8), 3200, 2000, 15);
  expense("Campagne LinkedIn Ads T2", "Régie publicitaire Exemple", "marketing", M(-6, 3), 1800, 2000, 0);
  expense("Campagne LinkedIn Ads T3", "Régie publicitaire Exemple", "marketing", M(-3, 4), 2100, 2000, 0);
  expense("Webinar & landing page", "Studio graphique Exemple", "marketing", D(-6), 950, 2000, null, { due: D(24) });
  expense("Designer UI freelance — PixelForge", "Studio Freelance Exemple", "contractors", M(-3, 15), 4500, 2000, 30, { projectId: "prj_007" });
  expense("Expert ERP freelance — Orbis", "Conseil ERP Exemple", "contractors", M(-2, 10), 6800, 2000, 30, { projectId: "prj_006" });
  expense("Expert ERP freelance — Orbis (complément)", "Conseil ERP Exemple", "contractors", D(-10), 3400, 2000, null, { projectId: "prj_006", due: D(20) });
  expense("Ordinateurs portables (x2)", "Matériel Pro Exemple", "hardware", M(-6, 2), 4200, 2000, 5);
  expense("Écrans et accessoires", "Matériel Pro Exemple", "hardware", M(-4, 2), 1150, 2000, 5);
  expense("Déplacement Saint-Étienne — ateliers Orbis", "SNCF (exemple)", "travel", M(-3, 9), 380, 1000, 0, { projectId: "prj_006" });
  expense("Déplacement Montpellier — PixelForge", "SNCF (exemple)", "travel", M(-2, 22), 620, 1000, 0, { projectId: "prj_007" });
  expense("Déplacement Grenoble — GreenPulse", "SNCF (exemple)", "travel", M(-1, 6), 240, 1000, 0, { projectId: "prj_008" });
  expense("Assurance responsabilité civile pro", "Assureur Exemple", "misc", M(-7, 1), 1600, 0, 20);
  expense("Honoraires expert-comptable T3", "Cabinet comptable Exemple", "contractors", M(-1, 5), 2400, 2000, null, { due: D(-3), notes: "Facture reçue, paiement en attente." });
  expense("Formation sécurité cloud", "Organisme de formation Exemple", "misc", D(-4), 1200, 2000, null, { due: D(26) });

  /* ---------- Objectifs ---------- */
  const q = Math.floor((Number(anchor.slice(5, 7)) - 1) / 3);
  const quarterStart = `${anchor.slice(0, 4)}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const quarterEnd = endOfMonthISO(addMonths(quarterStart, 2));
  const semesterStart = Number(anchor.slice(5, 7)) <= 6 ? `${anchor.slice(0, 4)}-01-01` : `${anchor.slice(0, 4)}-07-01`;
  const semesterEnd = endOfMonthISO(addMonths(semesterStart, 5));
  const goal = (
    id: string,
    title: string,
    type: Goal["type"],
    periodLabel: string,
    start: ISODate,
    end: ISODate,
    ownerId: string,
    metric: Goal["metric"],
    startValue: number,
    targetValue: number,
    unit: string,
    opts: Partial<Goal> = {},
  ): Goal => ({
    id,
    title,
    description: opts.description ?? "",
    type,
    periodLabel,
    periodStart: start,
    periodEnd: end,
    ownerId,
    metric,
    startValue,
    targetValue,
    manualValue: opts.manualValue ?? startValue,
    unit,
    keyResults: opts.keyResults ?? [],
    archived: false,
    createdAt: ts(start),
    updatedAt: ts(start),
  });
  const qLabel = `T${q + 1} ${anchor.slice(0, 4)}`;
  // Objectifs commerciaux (indicateurs CRM calculés automatiquement).
  const goals: Goal[] = [
    goal(
      "goal_contracts",
      "Signer 5 nouveaux contrats",
      "commercial",
      `S${Number(anchor.slice(5, 7)) <= 6 ? 1 : 2} ${anchor.slice(0, 4)}`,
      semesterStart,
      semesterEnd,
      "emp_sacha",
      "won_opportunities",
      0,
      5,
      "contrats",
      { description: "Opportunités gagnées sur le semestre." },
    ),
    goal("goal_leads", "Générer 15 nouveaux prospects", "commercial", qLabel, quarterStart, quarterEnd, "emp_sacha", "new_leads", 0, 15, "prospects", {
      description: "Contacts prospects créés sur le trimestre.",
    }),
    goal("goal_missions", "Réaliser 40 actions commerciales", "commercial", qLabel, quarterStart, quarterEnd, "emp_sacha", "missions_done", 0, 40, "missions", {
      description: "Missions CRM terminées (appels, relances, rendez-vous…).",
    }),
    goal("goal_followups", "Zéro relance en retard", "customer", qLabel, quarterStart, quarterEnd, "emp_sacha", "overdue_followups", 8, 0, "relances", {
      description: "Missions de suivi échues et non réalisées.",
    }),
    goal("goal_pipeline", "Porter le pipeline actif à 400 k€", "growth", qLabel, quarterStart, quarterEnd, "emp_camille", "pipeline_value", 150_000, 400_000, "€", {
      description: "Valeur brute des opportunités ouvertes.",
    }),
    goal("goal_satisfaction", "Satisfaction client ≥ 4,5 / 5", "customer", qLabel, quarterStart, quarterEnd, "emp_lea", "manual", 3.9, 4.5, "/ 5", {
      manualValue: 4.2,
      description: "Mesurée par l'enquête trimestrielle (saisie manuelle).",
      keyResults: [
        { id: "kr_sat_1", title: "Clients interrogés", target: 12, current: 9, unit: "clients" },
        { id: "kr_sat_2", title: "Délai moyen de première réponse support", target: 4, current: 5, unit: "heures" },
      ],
    }),
  ];

  /* ---------- Missions (seed) ---------- */
  const mission = (
    id: string,
    title: string,
    description: string,
    category: Mission["category"],
    type: Mission["type"],
    difficulty: Mission["difficulty"],
    priority: Mission["priority"],
    start: ISODate,
    due: ISODate,
    xp: number,
    status: Mission["status"],
    completed: ISODate | null = null,
  ): Mission => ({
    id,
    title,
    description,
    category,
    type,
    difficulty,
    priority,
    status,
    startDate: start,
    dueDate: due,
    xpReward: xp,
    condition: { kind: "manual" },
    entity: null,
    history: [
      { at: ts(start), text: "Mission planifiée." },
      ...(status === "done" ? [{ at: ts(completed ?? due, 17), text: "Validée par Sacha Renard." }] : []),
      ...(status === "cancelled" ? [{ at: ts(addDays(start, 3), 17), text: "Annulée par Sacha Renard — priorités revues." }] : []),
    ],
    source: "seed",
    autoKey: null,
    completedAt: status === "done" ? ts(completed ?? due, 17) : null,
    createdAt: ts(start),
  });
  const missions: Mission[] = [
    mission(
      "mis_seed_02",
      "Mettre à jour la grille tarifaire 2027",
      "Revoir les prix proposés aux prospects au regard des retours terrain.",
      "commercial",
      "strategic",
      "hard",
      "normal",
      D(-10),
      D(30),
      30,
      "todo",
    ),
    mission(
      "mis_seed_05",
      "Organiser un webinar client BDO Analytics",
      "Présenter les nouveautés et détecter les montées en gamme.",
      "commercial",
      "monthly",
      "medium",
      "normal",
      D(-2),
      D(25),
      30,
      "todo",
    ),
    mission("mis_seed_08", "Signer le contrat DataSpring", "Finaliser la négociation du data warehouse.", "commercial", "strategic", "hard", "high", M(-2, 20), M(-1, 15), 30, "done", M(-1, 14)),
    mission("mis_seed_10", "Participer au salon Tech&Co de printemps", "Stand partagé avec un partenaire.", "commercial", "strategic", "medium", "low", M(-5, 1), M(-4, 20), 30, "cancelled"),
  ];

  /* ---------- Interactions, missions CRM et notes ---------- */
  const journal = crmJournal(seedHelpers, crm, { medialinkInvoiceId: invoices.find((i) => i.clientId === "cli_medialink" && i.issueDate === M(-5, 18))?.id ?? null });
  const salesActivities: SalesActivity[] = journal.salesActivities;
  tasks.push(...journal.tasks);
  const notes: Note[] = [
    ...journal.notes,
    {
      id: "note_002",
      title: "Risques PRJ-006",
      body: "Le connecteur ERP a consommé 236 h pour 160 h prévues. Prévoir un avenant ou une revue du périmètre de l'assistant IA.",
      clientId: "cli_orbis",
      projectId: "prj_006",
      contactId: null,
      opportunityId: null,
      createdAt: ts(D(-8), 18),
      updatedAt: ts(D(-8), 18),
    },
    {
      id: "note_003",
      title: "Idées pour 2027",
      body: "Packager BDO Flow + BDO Automation en offre « Opérations augmentées ». Étudier un programme partenaires intégrateurs.",
      clientId: null,
      projectId: null,
      contactId: "con_nexus_thomas",
      opportunityId: null,
      createdAt: ts(D(-15), 19),
      updatedAt: ts(D(-15), 19),
    },
  ];

  /* ---------- Avoirs et remboursements ---------- */
  const creditNotes: CreditNote[] = [];
  const refunds: Refund[] = [];
  const medialink = invoices.find((i) => i.clientId === "cli_medialink" && i.issueDate === M(-5, 18));
  if (medialink) {
    const date = M(-1, 10);
    creditNotes.push({
      id: "cn_001",
      number: "",
      invoiceId: medialink.id,
      clientId: medialink.clientId,
      issueDate: date,
      items: [line("prd_consult", "Geste commercial — 1 jour d'étude non réalisé", 1, 1100)],
      reason: "Geste commercial accordé après réclamation (journée annulée).",
      createdAt: ts(date, 9),
    });
  }
  const urbanLast = invoices
    .filter((i) => i.subscriptionId === "sub_urban_crm")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    .at(-1);
  if (urbanLast) {
    const date = M(-5, 12);
    const cn: CreditNote = {
      id: "cn_002",
      number: "",
      invoiceId: urbanLast.id,
      clientId: urbanLast.clientId,
      issueDate: date,
      items: urbanLast.items.map((l) => ({ ...l, id: `${l.id}_cn` })),
      reason: "Résiliation anticipée : dernière échéance non due.",
      createdAt: ts(date, 9),
    };
    creditNotes.push(cn);
    const paid = payments.filter((p) => p.invoiceId === urbanLast.id && p.date <= M(-5, 20)).reduce((t, p) => t + p.amount, 0);
    if (paid > 0)
      refunds.push({
        id: "ref_001",
        invoiceId: urbanLast.id,
        creditNoteId: cn.id,
        date: M(-5, 20),
        amount: Math.min(paid, documentTotals(cn.items).totalTTC),
        method: "transfer",
        reference: `REMB-${M(-5, 20).replace(/-/g, "")}`,
        createdAt: ts(M(-5, 20), 11),
      });
  }

  // Numérotation chronologique des avoirs (séquence unique, préfixe de l'année d'émission).
  creditNotes.sort((x, y) => x.issueDate.localeCompare(y.issueDate)).forEach((c, i) => (c.number = `AV-${c.issueDate.slice(0, 4)}-${String(i + 1).padStart(4, "0")}`));

  /* ---------- Déclarations de TVA (historique) ---------- */
  // Toutes les périodes complètes sont déclarées le 12 et payées le 18 du mois suivant,
  // sauf la dernière (mois précédent l'ancrage), encore à déclarer avant l'échéance.
  const vatReturns: VatReturn[] = [];
  const vatData = { invoices, payments, refunds, expenses, vatReturns, settings };
  const lastDeclared = addMonths(startOfMonthISO(anchor), -2).slice(0, 7);
  let carry = 0;
  for (const period of monthsBetween(settings.company.simulationStartDate, `${lastDeclared}-01`)) {
    const { collected, deductible } = vatAmounts(vatData, monthPeriod(period));
    const net = collected - deductible - carry;
    const next = addMonths(`${period}-01`, 1).slice(0, 7);
    vatReturns.push({
      id: `vat_${period}`,
      period,
      collected,
      deductible,
      creditCarriedIn: carry,
      net,
      status: net > 0 ? "paid" : "credit",
      dueDate: vatDueDate(period, settings.company.vatDueDay),
      declaredAt: ts(`${next}-12`, 10),
      paidDate: net > 0 ? `${next}-18` : null,
      reference: net > 0 ? `TVA-${period.replace("-", "")}` : "",
    });
    carry = net < 0 ? -net : 0;
  }

  /* ---------- Assemblage ---------- */
  const activity: AppData["activity"] = [];
  const ev = (at: ISODateTime, type: AppData["activity"][number]["type"], description: string, ref: AppData["activity"][number]["ref"]) =>
    activity.push({ id: `act_seed_${activity.length + 1}`, at, type, description, ref });
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  for (const c of clients) ev(c.createdAt, "client_created", `Entreprise ${c.name} ajoutée`, { type: "client", id: c.id });
  for (const i of invoices) if (i.baseStatus === "issued") ev(ts(i.issueDate, 8), "invoice_issued", `Facture ${i.number} émise · ${clientName.get(i.clientId)}`, { type: "invoice", id: i.id });
  for (const p of payments) {
    const i = invoices.find((x) => x.id === p.invoiceId)!;
    ev(p.createdAt, "payment_recorded", `Paiement reçu sur ${i.number} · ${clientName.get(i.clientId)}`, { type: "invoice", id: i.id });
  }
  for (const c of creditNotes) ev(c.createdAt, "credit_note_issued", `Avoir ${c.number} émis · ${clientName.get(c.clientId)}`, { type: "credit_note", id: c.id });
  for (const v of vatReturns) ev(v.declaredAt, "vat_declared", `TVA de ${v.period} déclarée`, { type: "vat_return", id: v.id });
  for (const o of opportunities) if (o.stage === "won") ev(o.closedAt!, "opportunity_won", `Opportunité ${o.name} gagnée`, { type: "opportunity", id: o.id });
  for (const p of projects) if (p.completedAt) ev(p.completedAt, "project_completed", `Projet ${p.code} terminé`, { type: "project", id: p.id });
  for (const t of tasks) if (t.completedAt && t.completedAt >= ts(addDays(anchor, -21))) ev(t.completedAt, "task_completed", `Tâche « ${t.title} » terminée`, { type: "task", id: t.id });
  for (const c of contacts) if (c.createdAt >= ts(addDays(anchor, -30))) ev(c.createdAt, "contact_created", `Contact ${c.firstName} ${c.lastName} ajouté`, { type: "contact", id: c.id });
  for (const a of salesActivities)
    if (a.type !== "stage_change" && a.date >= ts(addDays(anchor, -14))) ev(a.date, "interaction_logged", `${a.subject}`, a.contactId ? { type: "contact", id: a.contactId } : null);
  activity.sort((a, b) => a.at.localeCompare(b.at));

  const base: AppData = {
    settings,
    clients,
    contacts,
    leads: [],
    opportunities,
    salesActivities,
    products,
    quotes,
    invoices,
    payments,
    creditNotes,
    refunds,
    vatReturns,
    expenses,
    subscriptions,
    projects,
    tasks,
    employees,
    goals,
    missions,
    achievements: [],
    xpTransactions: [],
    retiredXpKeys: [],
    progression: [],
    notifications: [
      {
        id: "ntf_welcome",
        key: "system:welcome",
        category: "systeme",
        severity: "info",
        title: "Bienvenue dans BDO Software CRM",
        body: "Les données affichées sont fictives (mode démonstration). Elles sont stockées uniquement dans ce navigateur.",
        at: now,
        read: false,
        ref: null,
      },
    ],
    activity: activity.slice(-80),
    auditLogs: [{ id: "aud_seed", at: now, actor: "Système", role: "admin", action: "demo.seed", ref: null, details: `Jeu de démonstration v${SEED_VERSION}, ancrage ${anchor}` }],
    notes,
    sequences: { invoice: invoiceSeq, quote: quotes.length, project: projects.length, creditNote: creditNotes.length },
  };

  // Rattrapage de la gamification sur l'historique (XP datée des événements d'origine).
  return finalize(base, { now, today: anchor }, true).data;
}
