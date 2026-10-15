import type { XpRuleKey } from "@/lib/domain/types";
import type { GameMetrics } from "./metrics";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type AchievementCategory = "commercial" | "finance" | "projets" | "equipe" | "strategie" | "rigueur";

export const RARITY_LABELS: Record<Rarity, string> = { common: "Commun", rare: "Rare", epic: "Épique", legendary: "Légendaire" };
export const RARITY_XP_RULE: Record<Rarity, XpRuleKey> = {
  common: "achievement_common",
  rare: "achievement_rare",
  epic: "achievement_epic",
  legendary: "achievement_legendary",
};

export interface AchievementContext {
  pipelineThreshold: number;
  rank: number;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** Nom d'icône Lucide. */
  icon: string;
  category: AchievementCategory;
  rarity: Rarity;
  /** Condition lisible, affichée à l'utilisateur. */
  condition: string;
  test: (m: GameMetrics, ctx: AchievementContext) => boolean;
  /** Progression optionnelle (valeur actuelle / cible). */
  progress?: (m: GameMetrics, ctx: AchievementContext) => { current: number; target: number };
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "first-client", name: "Premier client", description: "La première pierre de l'entreprise.", icon: "UserPlus", category: "commercial", rarity: "common", condition: "Avoir au moins un client.", test: (m) => m.clients >= 1, progress: (m) => ({ current: m.clients, target: 1 }) },
  { id: "first-quote", name: "Premier devis", description: "Une proposition chiffrée envoyée au marché.", icon: "FileSignature", category: "commercial", rarity: "common", condition: "Créer un devis.", test: (m) => m.quotes >= 1, progress: (m) => ({ current: m.quotes, target: 1 }) },
  { id: "first-sale", name: "Première vente", description: "Une opportunité transformée en affaire.", icon: "Handshake", category: "commercial", rarity: "common", condition: "Gagner une opportunité commerciale.", test: (m) => m.wonOpportunities >= 1, progress: (m) => ({ current: m.wonOpportunities, target: 1 }) },
  { id: "first-payment", name: "Premier paiement reçu", description: "Le premier euro encaissé.", icon: "Banknote", category: "finance", rarity: "common", condition: "Enregistrer un paiement client.", test: (m) => m.payments >= 1, progress: (m) => ({ current: m.payments, target: 1 }) },
  { id: "first-paid-invoice", name: "Facture soldée", description: "Une facture intégralement payée.", icon: "BadgeCheck", category: "finance", rarity: "common", condition: "Avoir une facture intégralement payée.", test: (m) => m.paidInvoices >= 1, progress: (m) => ({ current: m.paidInvoices, target: 1 }) },
  { id: "ten-active-clients", name: "Dix clients actifs", description: "Un portefeuille qui prend de l'ampleur.", icon: "Users", category: "commercial", rarity: "rare", condition: "Avoir 10 clients actifs.", test: (m) => m.activeClients >= 10, progress: (m) => ({ current: m.activeClients, target: 10 }) },
  { id: "first-recurring", name: "Premier contrat récurrent", description: "Le début des revenus prévisibles.", icon: "Repeat", category: "finance", rarity: "common", condition: "Avoir un abonnement actif.", test: (m) => m.activeSubscriptions >= 1, progress: (m) => ({ current: m.activeSubscriptions, target: 1 }) },
  { id: "first-project-done", name: "Premier projet livré", description: "Une livraison réussie.", icon: "PackageCheck", category: "projets", rarity: "common", condition: "Terminer un projet.", test: (m) => m.projectsDone >= 1, progress: (m) => ({ current: m.projectsDone, target: 1 }) },
  { id: "five-projects-done", name: "Atelier rodé", description: "Cinq projets menés à terme.", icon: "Layers", category: "projets", rarity: "rare", condition: "Terminer 5 projets.", test: (m) => m.projectsDone >= 5, progress: (m) => ({ current: m.projectsDone, target: 5 }) },
  { id: "ten-projects-done", name: "Usine à livraisons", description: "Dix projets terminés.", icon: "Factory", category: "projets", rarity: "epic", condition: "Terminer 10 projets.", test: (m) => m.projectsDone >= 10, progress: (m) => ({ current: m.projectsDone, target: 10 }) },
  { id: "first-goal", name: "Premier objectif atteint", description: "Une cible stratégique atteinte.", icon: "Target", category: "strategie", rarity: "rare", condition: "Atteindre un objectif.", test: (m) => m.goalsAchieved >= 1, progress: (m) => ({ current: m.goalsAchieved, target: 1 }) },
  { id: "late-free-week", name: "Semaine sans retard", description: "Sept jours consécutifs sans tâche en retard.", icon: "CalendarCheck", category: "rigueur", rarity: "rare", condition: "Aucune tâche en retard pendant 7 jours consécutifs.", test: (m) => m.daysWithoutLateTasks >= 7, progress: (m) => ({ current: Math.min(m.daysWithoutLateTasks, 7), target: 7 }) },
  { id: "positive-cash-3m", name: "Trésorerie solide", description: "Trois fins de mois consécutives en trésorerie positive.", icon: "PiggyBank", category: "finance", rarity: "rare", condition: "Trésorerie positive à la fin des 3 derniers mois complets.", test: (m) => m.payments > 0 && m.positiveCash3m },
  { id: "first-profit", name: "Premier mois rentable", description: "Un résultat opérationnel mensuel positif.", icon: "TrendingUp", category: "finance", rarity: "rare", condition: "Un mois complet avec résultat opérationnel estimé positif.", test: (m) => m.hadProfitableMonth },
  { id: "pipeline-threshold", name: "Pipeline ambitieux", description: "Un pipeline commercial bien rempli.", icon: "Gauge", category: "commercial", rarity: "rare", condition: "Pipeline ouvert supérieur au seuil configuré.", test: (m, c) => m.pipeline >= c.pipelineThreshold, progress: (m, c) => ({ current: Math.round(m.pipeline / 100), target: Math.round(c.pipelineThreshold / 100) }) },
  { id: "full-team", name: "Équipe complète", description: "Une équipe pluridisciplinaire.", icon: "UsersRound", category: "equipe", rarity: "rare", condition: "6 collaborateurs actifs répartis dans au moins 4 départements.", test: (m) => m.activeEmployees >= 6 && m.departments >= 4, progress: (m) => ({ current: Math.min(m.activeEmployees, 6), target: 6 }) },
  { id: "mrr-growth", name: "Croissance récurrente", description: "Le MRR a progressé d'un mois sur l'autre.", icon: "ChartNoAxesCombined", category: "finance", rarity: "common", condition: "Un mois où le MRR de fin de mois dépasse celui du mois précédent.", test: (m) => m.hadMrrGrowth },
  { id: "mrr-10k", name: "Cap des 10 k€ de MRR", description: "Une base récurrente solide.", icon: "Rocket", category: "finance", rarity: "epic", condition: "MRR ≥ 10 000 €.", test: (m) => m.mrr >= 1_000_000, progress: (m) => ({ current: Math.round(m.mrr / 100), target: 10_000 }) },
  { id: "rigorous-manager", name: "Gestionnaire rigoureux", description: "Aucune créance de plus de 30 jours, aucune dette échue.", icon: "ShieldCheck", category: "rigueur", rarity: "epic", condition: "Au moins une facture payée, 0 facture en retard de plus de 30 jours et 0 dépense impayée échue.", test: (m) => m.paidInvoices > 0 && m.overdue30 === 0 && m.overdueExpenses === 0 },
  { id: "customer-expert", name: "Expert de la relation client", description: "Un suivi commercial assidu.", icon: "MessagesSquare", category: "commercial", rarity: "rare", condition: "40 activités commerciales réalisées.", test: (m) => m.salesActivities >= 40, progress: (m) => ({ current: m.salesActivities, target: 40 }) },
  { id: "sales-strategist", name: "Stratège commercial", description: "Un taux de conversion remarquable.", icon: "Crosshair", category: "commercial", rarity: "epic", condition: "Taux de conversion ≥ 50 % sur au moins 6 opportunités clôturées.", test: (m) => m.closedOpportunities >= 6 && (m.conversionRate ?? 0) >= 50 },
  { id: "task-master", name: "Maître des tâches", description: "Cinquante tâches menées à bien.", icon: "ListChecks", category: "rigueur", rarity: "rare", condition: "Terminer 50 tâches.", test: (m) => m.tasksDone >= 50, progress: (m) => ({ current: m.tasksDone, target: 50 }) },
  { id: "revenue-250k", name: "Quart de million", description: "250 000 € HT facturés depuis le début.", icon: "Trophy", category: "finance", rarity: "epic", condition: "CA facturé cumulé ≥ 250 000 € HT.", test: (m) => m.billedTotal >= 25_000_000, progress: (m) => ({ current: Math.round(m.billedTotal / 100), target: 250_000 }) },
  { id: "company-builder", name: "Bâtisseur d'entreprise", description: "L'entreprise atteint le rang « Société structurée ».", icon: "Building2", category: "strategie", rarity: "legendary", condition: "Atteindre le rang 4 de l'entreprise.", test: (_m, c) => c.rank >= 4, progress: (_m, c) => ({ current: c.rank, target: 4 }) },
];

export const ACHIEVEMENT_ICON_NAMES = ACHIEVEMENTS.map((a) => a.icon);

export function getAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
