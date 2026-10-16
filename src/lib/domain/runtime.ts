import type { AppData, AppNotification, ISODate, ISODateTime } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import { computeAlerts, type Alert } from "@/lib/calculations/alerts";
import { summarizeData } from "@/lib/calculations/invoices";
import { reconcileGamification, type ReconcileResult } from "@/lib/gamification/engine";
import { DomainError, type Command, type CommandContext } from "./commands/core";

/** Nombre maximal de notifications conservées. */
const MAX_NOTIFICATIONS = 300;

/** Ajoute les notifications correspondant aux alertes, une seule fois par clé et selon les préférences. */
export function syncNotifications(data: AppData, alerts: Alert[], now: ISODateTime): AppData {
  const known = new Set(data.notifications.map((n) => n.key));
  const enabled = data.settings.notifications.enabled;
  const fresh: AppNotification[] = [];
  for (const a of alerts) {
    if (known.has(a.key) || !enabled[a.category]) continue;
    known.add(a.key);
    fresh.push({ id: newId("ntf"), key: a.key, category: a.category, severity: a.severity, title: a.title, body: a.body, at: now, read: false, ref: a.ref });
  }
  if (!fresh.length) return data;
  const notifications = [...data.notifications, ...fresh].sort((x, y) => x.at.localeCompare(y.at)).slice(-MAX_NOTIFICATIONS);
  return { ...data, notifications };
}

/** Post-traitement commun à toutes les commandes : notifications puis gamification. */
export function finalize(data: AppData, ctx: { now: ISODateTime; today: ISODate }, silent = false): ReconcileResult {
  const summaries = summarizeData(data, ctx.today);
  const withNotifications = syncNotifications(data, computeAlerts(data, ctx.today, summaries), ctx.now);
  return reconcileGamification(withNotifications, { now: ctx.now, today: ctx.today, silent });
}

export type ExecuteResult<R> = ({ ok: true; result: R; message: string } & ReconcileResult) | { ok: false; error: string; fieldErrors: Record<string, string> };

/** Exécute une commande métier de manière transactionnelle : tout ou rien. */
export function execute<I, R>(data: AppData, command: Command<I, R>, input: I, ctx: CommandContext): ExecuteResult<R> {
  try {
    const out = command(data, input, ctx);
    const reconciled = finalize(out.data, ctx);
    return { ok: true, result: out.result, message: out.message, ...reconciled };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    console.error(error);
    return { ok: false, error: "Une erreur inattendue est survenue. Aucune modification n'a été enregistrée.", fieldErrors: {} };
  }
}
