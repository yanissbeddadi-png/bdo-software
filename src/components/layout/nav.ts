import { LayoutDashboard, Sparkles, Columns3, Contact, Building2, ListChecks, CalendarDays, MessagesSquare, ChartColumn, Trophy, Settings, type LucideIcon } from "lucide-react";
import type { ModuleKey, Settings as AppSettings } from "@/lib/domain/types";

/** Compteur calculé affiché à côté d'une entrée de navigation. */
export type NavCounter = "newProspects" | "missions" | "meetings";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  counter?: NavCounter;
  /** Module activable dont dépend l'entrée (masquée si le module est désactivé). */
  module?: ModuleKey;
  children?: { href: string; label: string }[];
}

/** Navigation principale du CRM. Les modules historiques restent accessibles depuis Paramètres. */
export const NAV: NavItem[] = [
  { href: "/", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/assistant", label: "Assistant", icon: Sparkles, module: "assistant" },
  { href: "/pipeline", label: "Pipeline CRM", icon: Columns3 },
  { href: "/contacts", label: "Contacts", icon: Contact, counter: "newProspects" },
  { href: "/entreprises", label: "Entreprises clientes", icon: Building2 },
  { href: "/missions", label: "Missions", icon: ListChecks, counter: "missions" },
  { href: "/calendrier", label: "Calendrier", icon: CalendarDays, counter: "meetings" },
  { href: "/activites", label: "Activités", icon: MessagesSquare },
  { href: "/statistiques", label: "Statistiques", icon: ChartColumn },
  { href: "/progression", label: "Progression", icon: Trophy },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

/** Entrées visibles selon les réglages de l'espace (gamification, modules activés). */
export function visibleNav(settings: Pick<AppSettings, "gamification" | "modules">): NavItem[] {
  return NAV.filter((item) => (settings.gamification.enabled || item.href !== "/progression") && (!item.module || settings.modules[item.module] !== false));
}

const LABELS: Record<string, string> = {
  "": "Vue d'ensemble",
  assistant: "Assistant",
  pipeline: "Pipeline CRM",
  contacts: "Contacts",
  entreprises: "Entreprises",
  calendrier: "Calendrier",
  statistiques: "Statistiques",
  propositions: "Propositions",
  missions: "Missions",
  bureaux: "Bureaux",
  finances: "Finances",
  factures: "Factures",
  depenses: "Dépenses",
  tresorerie: "Trésorerie",
  avoirs: "Avoirs",
  tva: "TVA",
  abonnements: "Revenus récurrents",
  crm: "Ventes et CRM",
  prospects: "Prospects",
  devis: "Devis",
  activites: "Activités",
  clients: "Clients",
  projets: "Projets",
  taches: "Tâches",
  equipe: "Équipe",
  catalogue: "Produits et services",
  operations: "Opérations",
  analyses: "Analyses",
  objectifs: "Objectifs",
  progression: "Progression",
  notifications: "Notifications",
  parametres: "Paramètres",
};

export function segmentLabel(segment: string): string | null {
  return LABELS[segment] ?? null;
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
