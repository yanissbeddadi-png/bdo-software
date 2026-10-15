import type {
  ActivityEvent,
  AppData,
  AppNotification,
  EntityRef,
  ISODate,
  ISODateTime,
  Mission,
  ProgressionEntry,
  ProgressionKind,
  TaskComplexity,
  XpSource,
  XpTransaction,
} from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import { summarizeInvoices, type InvoiceSummary } from "@/lib/calculations/invoices";
import { evaluateGoal } from "@/lib/calculations/goals";
import { ACHIEVEMENTS, RARITY_XP_RULE, RARITY_LABELS } from "./achievements";
import { computeGameMetrics, trackNoLateTasks } from "./metrics";
import { levelFromXp, titleForLevel } from "./levels";
import { computeRank, rankName } from "./ranks";
import { autoMissionDrafts, draftToMission, evaluateCondition } from "./missions";
import { ALL_REWARDS, isRewardUnlocked } from "./rewards";
import { addDays } from "@/lib/calculations/dates";

/**
 * Moteur de gamification.
 *
 * Il fonctionne par **réconciliation idempotente** : à partir de l'état métier, il
 * détermine les récompenses dues et n'ajoute que celles dont la clé d'idempotence
 * n'existe pas encore. Exécuter le moteur deux fois de suite ne change rien.
 *
 * Clés d'idempotence :
 *   task:<id> · project:<id> · opportunity:<id> · invoice:<id> · client:<id>
 *   goal:<id>:50 · goal:<id>:100 · mission:<id> · achievement:<id>
 */

const TASK_RULE: Record<TaskComplexity, "task_simple" | "task_standard" | "task_complex"> = {
  simple: "task_simple",
  standard: "task_standard",
  complex: "task_complex",
};

/** Plafond quotidien de tâches récompensées (anti-abus). */
export const DAILY_TASK_XP_CAP = 20;

export interface ReconcileOptions {
  now: ISODateTime;
  today: ISODate;
  /** Mode silencieux : pas de notifications (utilisé pour le seed). */
  silent?: boolean;
}

export interface ReconcileResult {
  data: AppData;
  /** Récompenses nouvellement attribuées pendant ce passage (pour les toasts). */
  awarded: XpTransaction[];
  unlockedAchievements: string[];
  levelUps: number[];
  rankUp: number | null;
  completedMissions: Mission[];
}

interface Candidate {
  key: string;
  amount: number;
  reason: string;
  source: XpSource;
  ref: EntityRef | null;
  at: ISODateTime;
  /** Groupe soumis à un plafond quotidien. */
  capGroup?: { name: string; limit: number };
}

export function reconcileGamification(input: AppData, opts: ReconcileOptions): ReconcileResult {
  const { now, today, silent } = opts;
  let data: AppData = { ...input, settings: { ...input.settings, gamification: { ...input.settings.gamification } } };
  const g = data.settings.gamification;
  const rewards = g.xpRewards;
  const summaries: InvoiceSummary[] = summarizeInvoices(data.invoices, data.payments, today);

  const progression: ProgressionEntry[] = [...data.progression];
  const progressionKeys = new Set(progression.map((p) => p.key));
  const notifications: AppNotification[] = [...data.notifications];
  const notificationKeys = new Set(notifications.map((n) => n.key));
  const activity: ActivityEvent[] = [...data.activity];

  const log = (kind: ProgressionKind, key: string, message: string, ref: EntityRef | null, at = now) => {
    if (progressionKeys.has(key)) return false;
    progressionKeys.add(key);
    progression.push({ id: newId("prog"), at, kind, message, ref, key });
    return true;
  };
  const notify = (key: string, title: string, body: string, ref: EntityRef | null) => {
    if (silent || !g.playfulNotifications || !data.settings.notifications.enabled.gamification) return;
    if (notificationKeys.has(key)) return;
    notificationKeys.add(key);
    notifications.push({ id: newId("ntf"), key, category: "gamification", severity: "success", title, body, at: now, read: false, ref });
  };

  // 1. Suivi « aucune tâche en retard ».
  const preMetrics = computeGameMetrics(data, today, summaries);
  g.noLateTaskSince = trackNoLateTasks(g.noLateTaskSince, preMetrics.lateTasks, today);

  // 2. Missions automatiques (création idempotente) puis évaluation des conditions.
  const missions: Mission[] = data.missions.map((m) => ({ ...m }));
  const autoKeys = new Set(missions.map((m) => m.autoKey).filter(Boolean));
  if (g.enabled) {
    for (const draft of autoMissionDrafts(data, today, summaries)) {
      if (autoKeys.has(draft.autoKey)) continue;
      autoKeys.add(draft.autoKey);
      missions.push(draftToMission(draft, newId("mis"), today, now));
    }
  }
  const completedMissions: Mission[] = [];
  for (const m of missions) {
    if (m.status === "done" || m.status === "cancelled") continue;
    const ev = evaluateCondition(m.condition, data, today, summaries);
    if (ev.obsolete) {
      m.status = "cancelled";
      m.history = [...m.history, { at: now, text: "Mission annulée : la condition n'a plus d'objet (élément supprimé ou annulé)." }];
    } else if (ev.satisfied) {
      m.status = "done";
      m.completedAt = now;
      m.history = [...m.history, { at: now, text: "Condition de réussite remplie — mission validée automatiquement." }];
      completedMissions.push(m);
    } else if (m.source === "auto" && m.type === "daily" && addDays(m.dueDate, 7) < today) {
      m.status = "cancelled";
      m.history = [...m.history, { at: now, text: "Mission expirée (échéance dépassée de plus de 7 jours)." }];
    } else if (ev.current > 0 && m.status === "todo") {
      m.status = "in_progress";
      m.history = [...m.history, { at: now, text: "Progression détectée." }];
    }
  }
  data = { ...data, missions };

  // 3. Candidats XP issus de l'état métier.
  const candidates: Candidate[] = [];
  if (g.enabled) {
    for (const t of data.tasks) {
      if (t.status !== "done" || !t.completedAt) continue;
      candidates.push({ key: `task:${t.id}`, amount: rewards[TASK_RULE[t.complexity]], reason: `Tâche terminée : ${t.title}`, source: "task", ref: { type: "task", id: t.id }, at: t.completedAt, capGroup: { name: "task", limit: DAILY_TASK_XP_CAP } });
    }
    for (const p of data.projects) {
      if (p.status !== "done" || !p.completedAt) continue;
      candidates.push({ key: `project:${p.id}`, amount: rewards.project_done, reason: `Projet terminé : ${p.name}`, source: "project", ref: { type: "project", id: p.id }, at: p.completedAt });
    }
    for (const o of data.opportunities) {
      if (o.stage !== "won" || !o.closedAt) continue;
      candidates.push({ key: `opportunity:${o.id}`, amount: rewards.opportunity_won, reason: `Opportunité gagnée : ${o.name}`, source: "opportunity", ref: { type: "opportunity", id: o.id }, at: o.closedAt });
    }
    const firstValidation = new Map<string, ISODateTime>();
    for (const s of summaries) {
      if (s.status !== "paid" || s.totalTTC <= 0) continue;
      const at = `${s.lastPaymentDate ?? today}T12:00:00.000Z`;
      const prev = firstValidation.get(s.invoice.clientId);
      if (!prev || at < prev) firstValidation.set(s.invoice.clientId, at);
      // Les échéances d'abonnement (flux automatique) ne rapportent pas d'XP.
      if (s.invoice.subscriptionId) continue;
      candidates.push({ key: `invoice:${s.invoice.id}`, amount: rewards.invoice_paid, reason: `Facture intégralement payée : ${s.invoice.number}`, source: "invoice", ref: { type: "invoice", id: s.invoice.id }, at, capGroup: { name: "invoice", limit: g.dailyInvoiceXpCap } });
    }
    for (const sub of data.subscriptions) {
      if (sub.startDate > today) continue;
      const at = `${sub.startDate}T12:00:00.000Z`;
      const prev = firstValidation.get(sub.clientId);
      if (!prev || at < prev) firstValidation.set(sub.clientId, at);
    }
    const clientNames = new Map(data.clients.map((c) => [c.id, c.name]));
    for (const [clientId, at] of firstValidation) {
      if (!clientNames.has(clientId)) continue;
      candidates.push({ key: `client:${clientId}`, amount: rewards.client_validated, reason: `Nouveau client validé : ${clientNames.get(clientId)}`, source: "client", ref: { type: "client", id: clientId }, at });
    }
    for (const goal of data.goals) {
      if (goal.archived) continue;
      const ev = evaluateGoal(goal, data, today, summaries);
      if (ev.progress >= 50) candidates.push({ key: `goal:${goal.id}:50`, amount: rewards.goal_intermediate, reason: `Objectif à mi-parcours : ${goal.title}`, source: "goal", ref: { type: "goal", id: goal.id }, at: now });
      if (ev.progress >= 100) candidates.push({ key: `goal:${goal.id}:100`, amount: rewards.goal_major, reason: `Objectif atteint : ${goal.title}`, source: "goal", ref: { type: "goal", id: goal.id }, at: now });
    }
    for (const m of missions) {
      if (m.status !== "done" || !m.completedAt) continue;
      candidates.push({
        key: `mission:${m.id}`,
        amount: m.xpReward,
        reason: `Mission terminée : ${m.title}`,
        source: "mission",
        ref: { type: "mission", id: m.id },
        at: m.completedAt,
        capGroup: m.source === "custom" ? { name: "custom-mission", limit: g.dailyCustomMissionXpCap } : undefined,
      });
    }
  }

  // 4. Succès (le rang est calculé avant pour le succès « Bâtisseur »).
  const metrics = computeGameMetrics(data, today, summaries);
  const rank = computeRank(metrics);
  const unlocked = new Set(data.achievements.map((a) => a.achievementId));
  const achievements = [...data.achievements];
  const unlockedAchievements: string[] = [];
  if (g.enabled) {
    for (const def of ACHIEVEMENTS) {
      if (unlocked.has(def.id)) continue;
      if (!def.test(metrics, { pipelineThreshold: g.pipelineAchievementThreshold, rank: rank.rank })) continue;
      unlocked.add(def.id);
      achievements.push({ achievementId: def.id, unlockedAt: now });
      unlockedAchievements.push(def.id);
      log("achievement", `achievement:${def.id}`, `Succès débloqué : ${def.name} (${RARITY_LABELS[def.rarity]})`, { type: "achievement", id: def.id });
      notify(`achievement:${def.id}`, `Succès débloqué : ${def.name}`, def.description, { type: "achievement", id: def.id });
      if (!silent) activity.push({ id: newId("act"), at: now, type: "achievement_unlocked", description: `Succès « ${def.name} » débloqué`, ref: { type: "achievement", id: def.id } });
      candidates.push({ key: `achievement:${def.id}`, amount: rewards[RARITY_XP_RULE[def.rarity]], reason: `Succès débloqué : ${def.name}`, source: "achievement", ref: { type: "achievement", id: def.id }, at: now });
    }
  }

  // 5. Attribution idempotente avec plafonds quotidiens.
  const existingKeys = new Set([...data.xpTransactions.map((x) => x.idempotencyKey), ...data.retiredXpKeys]);
  const capUsage = new Map<string, number>();
  const capKey = (group: string, at: string) => `${group}:${at.slice(0, 10)}`;
  for (const x of data.xpTransactions) {
    const group = x.idempotencyKey.startsWith("task:") ? "task" : x.idempotencyKey.startsWith("invoice:") ? "invoice" : null;
    if (group) capUsage.set(capKey(group, x.at), (capUsage.get(capKey(group, x.at)) ?? 0) + 1);
  }
  const customMissionIds = new Set(missions.filter((m) => m.source === "custom").map((m) => `mission:${m.id}`));
  for (const x of data.xpTransactions) {
    if (customMissionIds.has(x.idempotencyKey)) capUsage.set(capKey("custom-mission", x.at), (capUsage.get(capKey("custom-mission", x.at)) ?? 0) + 1);
  }
  const awarded: XpTransaction[] = [];
  candidates.sort((a, b) => a.at.localeCompare(b.at));
  for (const c of candidates) {
    if (existingKeys.has(c.key) || c.amount <= 0) continue;
    if (c.at.slice(0, 10) < g.progressionStart) continue;
    if (c.capGroup) {
      const k = capKey(c.capGroup.name, c.at);
      const used = capUsage.get(k) ?? 0;
      if (used >= c.capGroup.limit) continue;
      capUsage.set(k, used + 1);
    }
    existingKeys.add(c.key);
    awarded.push({ id: newId("xp"), at: c.at, amount: c.amount, reason: c.reason, source: c.source, ref: c.ref, idempotencyKey: c.key });
  }
  const xpTransactions = [...data.xpTransactions, ...awarded];

  for (const m of completedMissions) {
    log("mission", `mission:${m.id}`, `Mission terminée : ${m.title}`, { type: "mission", id: m.id });
    notify(`mission:${m.id}`, "Mission accomplie", m.title, { type: "mission", id: m.id });
    if (!silent) activity.push({ id: newId("act"), at: now, type: "mission_completed", description: `Mission « ${m.title} » validée`, ref: { type: "mission", id: m.id } });
  }

  // 6. Niveaux (dérivés de l'XP totale ; seul le dernier niveau annoncé est mémorisé).
  const totalXp = xpTransactions.reduce((s, x) => s + x.amount, 0);
  const level = levelFromXp(totalXp).level;
  const levelUps: number[] = [];
  for (let l = g.announcedLevel + 1; l <= level; l++) {
    levelUps.push(l);
    log("level_up", `level:${l}`, `Niveau ${l} atteint — ${titleForLevel(l)}`, null);
  }
  if (levelUps.length) {
    notify(`level:${level}`, `Niveau ${level} atteint`, `Nouveau titre : ${titleForLevel(level)}`, null);
    if (!silent) activity.push({ id: newId("act"), at: now, type: "level_up", description: `Le dirigeant passe au niveau ${level}`, ref: null });
  }
  g.announcedLevel = Math.max(g.announcedLevel, level);

  // 7. Rang de l'entreprise.
  let rankUp: number | null = null;
  if (rank.rank > g.announcedRank) {
    for (let r = g.announcedRank + 1; r <= rank.rank; r++) log("rank", `rank:${r}`, `Rang d'entreprise atteint : ${rankName(r)}`, null);
    notify(`rank:${rank.rank}`, `Nouveau rang : ${rank.name}`, "L'entreprise progresse dans le classement des rangs.", null);
    if (!silent) activity.push({ id: newId("act"), at: now, type: "rank_up", description: `BDO Software atteint le rang « ${rank.name} »`, ref: null });
    rankUp = rank.rank;
  }
  g.announcedRank = rank.rank;

  // 8. Récompenses débloquées (journalisées une seule fois).
  const ctx = { level, rank: rank.rank, achievements: unlocked };
  for (const reward of ALL_REWARDS) {
    if (reward.unlock.type === "level" && reward.unlock.level === 1) continue;
    if (reward.unlock.type === "rank" && reward.unlock.rank === 1) continue;
    if (isRewardUnlocked(reward, ctx)) log("reward", `reward:${reward.id}`, `Récompense débloquée : ${reward.name}`, null);
  }

  data = {
    ...data,
    achievements,
    xpTransactions,
    progression,
    notifications,
    activity,
  };
  return { data, awarded, unlockedAchievements, levelUps, rankUp, completedMissions };
}

export function totalXp(data: Pick<AppData, "xpTransactions">): number {
  return data.xpTransactions.reduce((s, x) => s + x.amount, 0);
}
