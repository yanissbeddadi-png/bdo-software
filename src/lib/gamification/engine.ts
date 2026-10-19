import type { ActivityEvent, AppData, AppNotification, EntityRef, ISODate, ISODateTime, Mission, ProgressionEntry, ProgressionKind, TaskComplexity, XpSource, XpTransaction } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import { summarizeData, type InvoiceSummary } from "@/lib/calculations/invoices";
import { evaluateGoal } from "@/lib/calculations/goals";
import { ACHIEVEMENTS, RARITY_XP_RULE, RARITY_LABELS } from "./achievements";
import { isContactComplete } from "@/lib/crm/views";
import { rigorousWeeks } from "@/lib/crm/streak";
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
  const summaries: InvoiceSummary[] = summarizeData(data, today);

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
      missions.push(draftToMission(draft, `mis_auto_${stableHash(draft.autoKey)}`, today, now));
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
      const crm = t.type !== "internal";
      // Anti-abus : une mission CRM non rattachée à un contact, une entreprise ou une
      // opportunité ne rapporte rien (pas de missions « vides » pour accumuler des points).
      if (crm && !t.contactId && !t.clientId && !t.opportunityId) continue;
      const amount = !crm
        ? rewards[TASK_RULE[t.complexity]]
        : t.type === "followup"
          ? rewards.crm_followup_done
          : t.type === "meeting" && t.result.trim()
            ? rewards.crm_meeting_report
            : rewards.crm_mission_done;
      candidates.push({
        key: `task:${t.id}`,
        amount,
        reason: crm ? `Mission terminée : ${t.title}` : `Tâche terminée : ${t.title}`,
        source: "task",
        ref: { type: "task", id: t.id },
        at: t.completedAt,
        capGroup: { name: "task", limit: DAILY_TASK_XP_CAP },
      });
    }
    // Interactions consignées : appels (avec résumé) et comptes rendus de rendez-vous.
    const meetingTasks = new Set(data.tasks.filter((t) => t.type === "meeting").map((t) => t.id));
    for (const a of data.salesActivities) {
      if (!a.done || (!a.contactId && !a.clientId)) continue;
      const summary = `${a.outcome} ${a.notes}`.trim();
      if (a.type === "call" && summary.length >= 5)
        candidates.push({
          key: `call:${a.id}`,
          amount: rewards.crm_call_logged,
          reason: `Appel consigné : ${a.subject}`,
          source: "interaction",
          ref: a.contactId ? { type: "contact", id: a.contactId } : { type: "client", id: a.clientId! },
          at: a.createdAt,
          capGroup: { name: "call", limit: data.settings.crm.dailyCallXpCap },
        });
      if (a.type === "meeting" && a.outcome.trim() && !(a.taskId && meetingTasks.has(a.taskId)))
        candidates.push({
          key: `meeting-report:${a.id}`,
          amount: rewards.crm_meeting_report,
          reason: `Compte rendu de rendez-vous : ${a.subject}`,
          source: "interaction",
          ref: a.contactId ? { type: "contact", id: a.contactId } : { type: "client", id: a.clientId! },
          at: a.createdAt,
          capGroup: { name: "meeting", limit: 5 },
        });
    }
    // Fiches contact complètes et prospects qualifiés (une fois par contact).
    const qualifiedByContact = new Map<string, string>();
    for (const o of data.opportunities) {
      if (!o.qualifiedAt) continue;
      candidates.push({
        key: `opportunity-qualified:${o.id}`,
        amount: rewards.crm_opportunity_qualified,
        reason: `Opportunité qualifiée : ${o.name}`,
        source: "opportunity",
        ref: { type: "opportunity", id: o.id },
        at: o.qualifiedAt,
      });
      if (o.contactId && (!qualifiedByContact.has(o.contactId) || o.qualifiedAt < qualifiedByContact.get(o.contactId)!)) qualifiedByContact.set(o.contactId, o.qualifiedAt);
    }
    for (const c of data.contacts) {
      if (!isContactComplete(c)) continue;
      candidates.push({
        key: `contact-complete:${c.id}`,
        amount: rewards.crm_contact_completed,
        reason: `Fiche contact complète : ${c.firstName} ${c.lastName}`,
        source: "contact",
        ref: { type: "contact", id: c.id },
        at: c.createdAt,
        capGroup: { name: "contact", limit: 10 },
      });
      const qualifiedAt = qualifiedByContact.get(c.id);
      if (qualifiedAt)
        candidates.push({
          key: `prospect-qualified:${c.id}`,
          amount: rewards.crm_prospect_qualified,
          reason: `Prospect qualifié : ${c.firstName} ${c.lastName}`,
          source: "contact",
          ref: { type: "contact", id: c.id },
          at: qualifiedAt,
        });
    }
    for (const w of rigorousWeeks(data, today)) {
      candidates.push({
        key: `week-on-track:${w.key}`,
        amount: rewards.crm_week_on_track,
        reason: `Semaine ${w.key} : toutes les relances faites à temps`,
        source: "streak",
        ref: null,
        at: `${w.end}T18:00:00.000Z`,
      });
    }
    for (const p of data.projects) {
      if (p.status !== "done" || !p.completedAt) continue;
      candidates.push({ key: `project:${p.id}`, amount: rewards.project_done, reason: `Projet terminé : ${p.name}`, source: "project", ref: { type: "project", id: p.id }, at: p.completedAt });
    }
    for (const o of data.opportunities) {
      if (o.stage !== "won" || !o.closedAt) continue;
      candidates.push({
        key: `opportunity:${o.id}`,
        amount: rewards.opportunity_won,
        reason: `Opportunité gagnée : ${o.name}`,
        source: "opportunity",
        ref: { type: "opportunity", id: o.id },
        at: o.closedAt,
      });
    }
    const firstValidation = new Map<string, ISODateTime>();
    for (const s of summaries) {
      if (s.status !== "paid" || s.totalTTC <= 0) continue;
      const at = `${s.lastPaymentDate ?? today}T12:00:00.000Z`;
      const prev = firstValidation.get(s.invoice.clientId);
      if (!prev || at < prev) firstValidation.set(s.invoice.clientId, at);
      // Les échéances d'abonnement (flux automatique) ne rapportent pas d'XP.
      if (s.invoice.subscriptionId) continue;
      candidates.push({
        key: `invoice:${s.invoice.id}`,
        amount: rewards.invoice_paid,
        reason: `Facture intégralement payée : ${s.invoice.number}`,
        source: "invoice",
        ref: { type: "invoice", id: s.invoice.id },
        at,
        capGroup: { name: "invoice", limit: g.dailyInvoiceXpCap },
      });
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
      candidates.push({
        key: `client:${clientId}`,
        amount: rewards.client_validated,
        reason: `Nouveau client validé : ${clientNames.get(clientId)}`,
        source: "client",
        ref: { type: "client", id: clientId },
        at,
      });
    }
    for (const goal of data.goals) {
      if (goal.archived) continue;
      const ev = evaluateGoal(goal, data, today, summaries);
      if (ev.progress >= 50)
        candidates.push({
          key: `goal:${goal.id}:50`,
          amount: rewards.goal_intermediate,
          reason: `Objectif à mi-parcours : ${goal.title}`,
          source: "goal",
          ref: { type: "goal", id: goal.id },
          at: now,
        });
      if (ev.progress >= 100)
        candidates.push({ key: `goal:${goal.id}:100`, amount: rewards.goal_major, reason: `Objectif atteint : ${goal.title}`, source: "goal", ref: { type: "goal", id: goal.id }, at: now });
    }
    for (const m of missions) {
      if (m.status !== "done" || !m.completedAt) continue;
      candidates.push({
        key: `mission:${m.id}`,
        amount: m.xpReward,
        reason: `Défi relevé : ${m.title}`,
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
      candidates.push({
        key: `achievement:${def.id}`,
        amount: rewards[RARITY_XP_RULE[def.rarity]],
        reason: `Succès débloqué : ${def.name}`,
        source: "achievement",
        ref: { type: "achievement", id: def.id },
        at: now,
      });
    }
  }

  // 5. Attribution idempotente avec plafonds quotidiens.
  const existingKeys = new Set([...data.xpTransactions.map((x) => x.idempotencyKey), ...data.retiredXpKeys]);
  const capUsage = new Map<string, number>();
  const capKey = (group: string, at: string) => `${group}:${at.slice(0, 10)}`;
  for (const x of data.xpTransactions) {
    const prefix = x.idempotencyKey.split(":")[0];
    const group = ({ task: "task", invoice: "invoice", call: "call", "meeting-report": "meeting", "contact-complete": "contact" } as Record<string, string>)[prefix ?? ""] ?? null;
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
  // Anti-abus : une facture intégralement annulée par avoir perd la récompense « facture payée ».
  for (const s of summaries) {
    if (s.status !== "credited") continue;
    const original = data.xpTransactions.find((x) => x.idempotencyKey === `invoice:${s.invoice.id}`) ?? awarded.find((x) => x.idempotencyKey === `invoice:${s.invoice.id}`);
    const key = `invoice-reversal:${s.invoice.id}`;
    if (!original || existingKeys.has(key)) continue;
    existingKeys.add(key);
    awarded.push({
      id: newId("xp"),
      at: now,
      amount: -original.amount,
      reason: `Facture ${s.invoice.number} annulée par avoir : récompense retirée`,
      source: "invoice",
      ref: { type: "invoice", id: s.invoice.id },
      idempotencyKey: key,
    });
  }
  const xpTransactions = [...data.xpTransactions, ...awarded];

  for (const m of completedMissions) {
    log("mission", `mission:${m.id}`, `Défi relevé : ${m.title}`, { type: "mission", id: m.id });
    notify(`mission:${m.id}`, "Défi relevé", m.title, { type: "mission", id: m.id });
    if (!silent) activity.push({ id: newId("act"), at: now, type: "mission_completed", description: `Défi « ${m.title} » relevé`, ref: { type: "mission", id: m.id } });
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
    if (!silent) activity.push({ id: newId("act"), at: now, type: "level_up", description: `Niveau ${level} atteint — ${titleForLevel(level)}`, ref: null });
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

/** Hachage déterministe (FNV-1a 32 bits) : une même clé de mission donne toujours le même identifiant. */
export function stableHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function totalXp(data: Pick<AppData, "xpTransactions">): number {
  return data.xpTransactions.reduce((s, x) => s + x.amount, 0);
}
