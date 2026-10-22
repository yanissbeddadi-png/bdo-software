import type { AppData, Employee, ISODate, ISODateTime } from "@/lib/domain/types";
import { defaultSettings } from "./seed";

/** Fiche du premier collaborateur d'un espace vide (le directeur commercial). */
export interface OwnerInput {
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
}

/** Collections métier d'un espace sans données (identiques pour un espace neuf et une remise à zéro). */
function emptyCollections(): Omit<AppData, "settings" | "employees"> {
  return {
    clients: [],
    contacts: [],
    leads: [],
    opportunities: [],
    salesActivities: [],
    products: [],
    quotes: [],
    invoices: [],
    payments: [],
    creditNotes: [],
    refunds: [],
    vatReturns: [],
    expenses: [],
    subscriptions: [],
    projects: [],
    tasks: [],
    goals: [],
    missions: [],
    achievements: [],
    xpTransactions: [],
    retiredXpKeys: [],
    progression: [],
    notifications: [],
    activity: [],
    auditLogs: [],
    notes: [],
    sequences: { invoice: 0, quote: 0, project: 0, creditNote: 0 },
  };
}

export function ownerEmployee(owner: OwnerInput, id: string, today: ISODate, now: ISODateTime): Employee {
  return {
    id,
    firstName: owner.firstName.trim(),
    lastName: owner.lastName.trim(),
    jobTitle: owner.jobTitle.trim() || "Directeur commercial",
    department: "sales",
    email: owner.email.trim().toLowerCase(),
    hireDate: today,
    status: "active",
    monthlyCost: 0,
    skills: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Espace vide pour un nouveau client : réglages par défaut (pipeline, règles CRM, TVA…),
 * identité visuelle neutre (pas de marque BDO), aucune donnée commerciale ni financière,
 * et une seule fiche collaborateur — celle de la personne qui installe l'espace.
 */
export function createEmptyData(today: ISODate, now: ISODateTime, company: string, owner: OwnerInput, ownerId: string): AppData {
  const base = defaultSettings(today, now);
  const employee = ownerEmployee(owner, ownerId, today, now);
  return {
    ...emptyCollections(),
    employees: [employee],
    settings: {
      ...base,
      company: {
        ...base.company,
        name: company.trim(),
        legalName: company.trim(),
        sector: "",
        address: "",
        email: employee.email,
        phone: "",
        openingBalance: 0,
        openingBalanceDate: today,
        cashAlertThreshold: 0,
        simulationStartDate: today,
        vatTrackingStart: today.slice(0, 8) + "01",
      },
      branding: { logo: null, color: "#2F5BC4", bdoMark: false },
      // Espace d'un client : les modules financiers (outil de gestion interne, non certifié
      // comme logiciel comptable) sont masqués par défaut et s'activent dans Paramètres › Modules.
      modules: { ...base.modules, finance: false, analytics: false },
      gamification: { ...base.gamification, progressionStart: today },
      user: { id: `usr_${ownerId}`, name: `${employee.firstName} ${employee.lastName}`, email: employee.email, role: "dirigeant", employeeId: ownerId },
      demo: { ...base.demo, seededAt: now, anchorDate: today, sample: false },
    },
  };
}

/**
 * Remise à zéro d'un espace existant : conserve les réglages (entreprise, identité
 * visuelle, modules, pipeline…) et l'équipe, supprime toutes les données métier.
 */
export function clearWorkspace(data: AppData, today: ISODate): AppData {
  return {
    ...emptyCollections(),
    employees: data.employees,
    settings: {
      ...data.settings,
      demo: { ...data.settings.demo, sample: false },
      gamification: {
        ...data.settings.gamification,
        progressionStart: today,
        noLateTaskSince: null,
        announcedLevel: 1,
        announcedRank: 1,
        equippedTitle: null,
        equippedTheme: "theme-default",
        equippedFrame: null,
      },
    },
  };
}

/**
 * Jeu de démonstration chargé dans un espace existant : conserve l'identité de l'espace
 * (nom, identité visuelle, modules) et ajoute les fiches collaborateurs propres à l'espace,
 * pour que les comptes déjà créés restent rattachés à leur fiche.
 */
export function demoInWorkspace(seed: AppData, current: AppData): AppData {
  const ids = new Set(seed.employees.map((e) => e.id));
  return {
    ...seed,
    employees: [...seed.employees, ...current.employees.filter((e) => !ids.has(e.id))],
    settings: {
      ...seed.settings,
      demo: { ...seed.settings.demo, sample: true },
      company: { ...seed.settings.company, name: current.settings.company.name, legalName: current.settings.company.legalName },
      branding: current.settings.branding,
      modules: current.settings.modules,
      ai: current.settings.ai,
      customFields: current.settings.customFields,
      emailTemplates: current.settings.emailTemplates,
    },
  };
}
