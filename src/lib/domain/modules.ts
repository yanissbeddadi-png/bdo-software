import type { ModuleKey, ModuleSettings } from "./types";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  hint: string;
  /** Pages du module (et leurs sous-pages). */
  paths: string[];
}

/**
 * Modules activables par espace (Paramètres › Modules). Le CRM (pipeline, contacts,
 * entreprises, missions, calendrier, activités, statistiques), l'équipe et les paramètres
 * restent toujours disponibles. Désactiver un module masque ses pages sans supprimer de données.
 */
export const MODULES: ModuleDef[] = [
  { key: "assistant", label: "Assistant commercial", hint: "Rapport du matin, priorités expliquées, affaires à risque, brouillons de relance", paths: ["/assistant"] },
  { key: "quotes", label: "Propositions commerciales", hint: "Devis liés aux opportunités", paths: ["/crm/devis"] },
  { key: "finance", label: "Finances", hint: "Factures, avoirs, dépenses, trésorerie, TVA, abonnements", paths: ["/finances"] },
  { key: "analytics", label: "Analyses financières", hint: "Indicateurs financiers historiques", paths: ["/analyses"] },
  { key: "projects", label: "Projets et tâches internes", hint: "Projets clients, livrables, tâches hors CRM", paths: ["/projets", "/taches"] },
  { key: "catalog", label: "Produits et services", hint: "Catalogue et tarifs", paths: ["/catalogue"] },
  { key: "goals", label: "Objectifs", hint: "Objectifs chiffrés suivis automatiquement", paths: ["/objectifs"] },
  { key: "operations", label: "Opérations", hint: "Risques, notes et alertes", paths: ["/operations"] },
  { key: "offices", label: "Bureaux 3D", hint: "Visualisation de l'entreprise", paths: ["/bureaux"] },
];

const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

/** Module désactivé auquel appartient la page, s'il y en a un. */
export function disabledModuleAt(pathname: string, modules: ModuleSettings | undefined): ModuleDef | null {
  if (!modules) return null;
  return MODULES.find((m) => !modules[m.key] && m.paths.some((p) => under(pathname, p))) ?? null;
}
