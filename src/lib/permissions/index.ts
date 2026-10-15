import type { Role } from "@/lib/domain/types";

export type Permission =
  | "clients.write"
  | "crm.write"
  | "quotes.write"
  | "invoices.write"
  | "payments.write"
  | "expenses.write"
  | "subscriptions.write"
  | "products.write"
  | "projects.write"
  | "tasks.write"
  | "team.write"
  | "goals.write"
  | "missions.write"
  | "notes.write"
  | "settings.write"
  | "data.admin";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  dirigeant: "Dirigeant",
  finance: "Finance",
  commercial: "Commercial",
  chef_projet: "Chef de projet",
  collaborateur: "Collaborateur",
};

const ALL: Permission[] = [
  "clients.write",
  "crm.write",
  "quotes.write",
  "invoices.write",
  "payments.write",
  "expenses.write",
  "subscriptions.write",
  "products.write",
  "projects.write",
  "tasks.write",
  "team.write",
  "goals.write",
  "missions.write",
  "notes.write",
  "settings.write",
  "data.admin",
];

/**
 * Matrice des permissions d'écriture. La lecture est ouverte à tous les rôles
 * de l'organisation. En mode Supabase, cette matrice est dupliquée dans les
 * politiques RLS (voir supabase/migrations) afin d'être appliquée côté serveur.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  dirigeant: ALL,
  finance: [
    "clients.write",
    "invoices.write",
    "payments.write",
    "expenses.write",
    "subscriptions.write",
    "products.write",
    "quotes.write",
    "tasks.write",
    "goals.write",
    "missions.write",
    "notes.write",
  ],
  commercial: ["clients.write", "crm.write", "quotes.write", "tasks.write", "missions.write", "notes.write"],
  chef_projet: ["projects.write", "tasks.write", "expenses.write", "missions.write", "notes.write"],
  collaborateur: ["tasks.write", "missions.write", "notes.write"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  "clients.write": "Clients & contacts",
  "crm.write": "Prospects, opportunités, activités",
  "quotes.write": "Devis",
  "invoices.write": "Factures",
  "payments.write": "Paiements",
  "expenses.write": "Dépenses",
  "subscriptions.write": "Abonnements",
  "products.write": "Catalogue",
  "projects.write": "Projets",
  "tasks.write": "Tâches",
  "team.write": "Équipe",
  "goals.write": "Objectifs",
  "missions.write": "Missions",
  "notes.write": "Notes",
  "settings.write": "Paramètres",
  "data.admin": "Réinitialisation / import",
};
