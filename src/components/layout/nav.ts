import {
  LayoutDashboard,
  Swords,
  Wallet,
  Handshake,
  Building2,
  FolderKanban,
  ListTodo,
  Users,
  Package,
  CalendarClock,
  ChartColumn,
  Target,
  Trophy,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: { href: string; label: string }[];
}

export const NAV: NavItem[] = [
  { href: "/", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/missions", label: "Centre de missions", icon: Swords },
  {
    href: "/finances",
    label: "Finances",
    icon: Wallet,
    children: [
      { href: "/finances", label: "Synthèse" },
      { href: "/finances/factures", label: "Factures" },
      { href: "/finances/depenses", label: "Dépenses" },
      { href: "/finances/tresorerie", label: "Trésorerie" },
      { href: "/finances/abonnements", label: "Revenus récurrents" },
    ],
  },
  {
    href: "/crm",
    label: "Ventes et CRM",
    icon: Handshake,
    children: [
      { href: "/crm", label: "Pipeline" },
      { href: "/crm/prospects", label: "Prospects" },
      { href: "/crm/devis", label: "Devis" },
      { href: "/crm/activites", label: "Activités" },
    ],
  },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/projets", label: "Projets", icon: FolderKanban },
  { href: "/taches", label: "Tâches", icon: ListTodo },
  { href: "/equipe", label: "Équipe", icon: Users },
  { href: "/catalogue", label: "Produits et services", icon: Package },
  { href: "/operations", label: "Opérations", icon: CalendarClock },
  { href: "/analyses", label: "Analyses", icon: ChartColumn },
  { href: "/objectifs", label: "Objectifs", icon: Target },
  { href: "/progression", label: "Progression", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

const LABELS: Record<string, string> = {
  "": "Vue d'ensemble",
  missions: "Centre de missions",
  finances: "Finances",
  factures: "Factures",
  depenses: "Dépenses",
  tresorerie: "Trésorerie",
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
