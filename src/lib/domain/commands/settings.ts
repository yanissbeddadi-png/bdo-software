import type { AppData, CompanySettings, GamificationSettings, NotificationSettings, PreferenceSettings, Role, RuleSettings } from "@/lib/domain/types";
import { ALL_REWARDS, isRewardUnlocked } from "@/lib/gamification/rewards";
import { levelFromXp } from "@/lib/gamification/levels";
import { totalXp } from "@/lib/gamification/engine";
import { activity, assertCan, audit, DomainError, type Command } from "./core";

export const updateCompanySettings: Command<Partial<CompanySettings>> = (data, input, ctx) => {
  assertCan(ctx, "settings.write");
  const company = { ...data.settings.company, ...input };
  if (!company.name.trim()) throw new DomainError("Le nom de l'entreprise est obligatoire.");
  if (!company.vatRates.length) throw new DomainError("Au moins un taux de TVA est requis.");
  if (company.vatRates.some((r) => !Number.isInteger(r.rate) || r.rate < 0 || r.rate > 10_000)) throw new DomainError("Taux de TVA invalide.");
  if (!company.vatRates.some((r) => r.rate === company.defaultVatRate)) throw new DomainError("Le taux par défaut doit faire partie des taux configurés.");
  if (!Number.isInteger(company.cashAlertThreshold) || company.cashAlertThreshold < 0) throw new DomainError("Seuil de trésorerie invalide.");
  const next = audit({ ...data, settings: { ...data.settings, company } }, ctx, "settings.company", null, Object.keys(input).join(", "));
  return { data: next, result: undefined, message: "Paramètres de l'entreprise enregistrés." };
};

export const updatePreferences: Command<Partial<PreferenceSettings>> = (data, input, ctx) => {
  const preferences = { ...data.settings.preferences, ...input };
  if (preferences.referenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(preferences.referenceDate)) throw new DomainError("Date de référence invalide.");
  void ctx;
  return { data: { ...data, settings: { ...data.settings, preferences } }, result: undefined, message: "Préférences enregistrées." };
};

export const updateGamificationSettings: Command<Partial<GamificationSettings>> = (data, input, ctx) => {
  const sensitive: (keyof GamificationSettings)[] = ["xpRewards", "dailyInvoiceXpCap", "dailyCustomMissionXpCap", "pipelineAchievementThreshold", "staleOpportunityDays", "weeklyProspectingTarget", "enabled"];
  if (Object.keys(input).some((k) => sensitive.includes(k as keyof GamificationSettings))) assertCan(ctx, "settings.write");
  const gamification = { ...data.settings.gamification, ...input };
  if (Object.values(gamification.xpRewards).some((v) => !Number.isInteger(v) || v < 0 || v > 5000)) throw new DomainError("Les récompenses XP doivent être des entiers entre 0 et 5000.");
  if (gamification.dailyInvoiceXpCap < 0 || gamification.dailyCustomMissionXpCap < 0) throw new DomainError("Plafond invalide.");
  if (gamification.staleOpportunityDays < 1) throw new DomainError("Le délai d'inactivité doit être d'au moins 1 jour.");
  let next = { ...data, settings: { ...data.settings, gamification } };
  if (input.xpRewards || input.dailyInvoiceXpCap !== undefined) next = audit(next, ctx, "settings.gamification", null, Object.keys(input).join(", "));
  return { data: next, result: undefined, message: "Paramètres de gamification enregistrés." };
};

export const updateRules: Command<Partial<RuleSettings>> = (data, input, ctx) => {
  assertCan(ctx, "settings.write");
  const rules = { ...data.settings.rules, ...input };
  if (Object.values(rules).some((v) => !Number.isFinite(v) || v < 0)) throw new DomainError("Les seuils doivent être positifs.");
  return { data: audit({ ...data, settings: { ...data.settings, rules } }, ctx, "settings.rules", null, ""), result: undefined, message: "Règles d'alerte enregistrées." };
};

export const updateNotificationSettings: Command<NotificationSettings> = (data, input, ctx) => {
  void ctx;
  return { data: { ...data, settings: { ...data.settings, notifications: input } }, result: undefined, message: "Préférences de notification enregistrées." };
};

/** Changement de rôle — fonctionnalité de démonstration uniquement (aucune authentification en mode local). */
export const switchDemoRole: Command<{ role: Role }> = (data, { role }, ctx) => {
  const next = audit({ ...data, settings: { ...data.settings, user: { ...data.settings.user, role } } }, ctx, "demo.switch_role", null, role);
  return { data: next, result: undefined, message: "Rôle de démonstration modifié." };
};

export const equipReward: Command<{ rewardId: string | null; kind: "title" | "theme" | "frame" }> = (data, { rewardId, kind }, ctx) => {
  void ctx;
  const g = data.settings.gamification;
  if (rewardId) {
    const reward = ALL_REWARDS.find((r) => r.id === rewardId && r.kind === kind);
    if (!reward) throw new DomainError("Récompense inconnue.");
    const level = levelFromXp(totalXp(data)).level;
    const unlocked = isRewardUnlocked(reward, { level, rank: g.announcedRank, achievements: new Set(data.achievements.map((a) => a.achievementId)) });
    if (!unlocked) throw new DomainError("Cette récompense n'est pas encore débloquée.");
  }
  const patch = kind === "title" ? { equippedTitle: rewardId } : kind === "theme" ? { equippedTheme: rewardId ?? "theme-default" } : { equippedFrame: rewardId };
  return { data: { ...data, settings: { ...data.settings, gamification: { ...g, ...patch } } }, result: undefined, message: "Apparence mise à jour." };
};

/**
 * Réinitialise la progression du dirigeant (XP, niveau, journal). Les clés
 * d'idempotence déjà consommées sont conservées dans `retiredXpKeys` : les actions
 * passées ne peuvent pas être récompensées une seconde fois. Les succès restent
 * acquis (ils décrivent l'historique de l'entreprise).
 */
export const resetProgression: Command<void> = (data, _input, ctx) => {
  assertCan(ctx, "data.admin");
  const retired = new Set([...data.retiredXpKeys, ...data.xpTransactions.map((x) => x.idempotencyKey)]);
  let next: AppData = {
    ...data,
    xpTransactions: [],
    retiredXpKeys: [...retired],
    progression: [],
    settings: { ...data.settings, gamification: { ...data.settings.gamification, announcedLevel: 1, progressionStart: ctx.today, equippedTitle: null, equippedTheme: "theme-default", equippedFrame: null } },
  };
  next = audit(next, ctx, "gamification.reset", null, `${retired.size} clés retirées`);
  next = activity(next, ctx, "data_reset", "Progression du dirigeant réinitialisée", null);
  return { data: next, result: undefined, message: "Progression réinitialisée." };
};

export const recordCashReview: Command<void> = (data, _input, ctx) => {
  assertCan(ctx, "expenses.write");
  return {
    data: audit({ ...data, settings: { ...data.settings, gamification: { ...data.settings.gamification, lastCashReviewAt: ctx.now } } }, ctx, "cash.review", null, ""),
    result: undefined,
    message: "Revue des prévisions de trésorerie enregistrée.",
  };
};

/* ----------------------------- Notifications ----------------------------- */

export const markNotificationRead: Command<{ id: string; read: boolean }> = (data, { id, read }) => ({
  data: { ...data, notifications: data.notifications.map((n) => (n.id === id ? { ...n, read } : n)) },
  result: undefined,
  message: read ? "Notification lue." : "Notification marquée non lue.",
});

export const markAllNotificationsRead: Command<{ ids?: string[] }> = (data, { ids }) => ({
  data: { ...data, notifications: data.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) },
  result: undefined,
  message: "Notifications marquées comme lues.",
});
