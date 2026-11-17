/**
 * Règles de l'historique des versions (`app_state_history`), sans accès à Supabase :
 * fréquence des instantanés automatiques et rétention. Fonctions pures, testées.
 */

export type SnapshotKind = "auto" | "manual" | "before_import" | "before_reset" | "before_replace" | "before_restore";

export const SNAPSHOT_KINDS: readonly SnapshotKind[] = ["auto", "manual", "before_import", "before_reset", "before_replace", "before_restore"];

/** Libellés affichés dans l'historique. */
export const SNAPSHOT_KIND_LABELS: Record<SnapshotKind, string> = {
  auto: "Automatique",
  manual: "Point de restauration",
  before_import: "Avant un import",
  before_reset: "Avant une réinitialisation",
  before_replace: "Avant un remplacement",
  before_restore: "Avant une restauration",
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Intervalle minimal entre deux instantanés automatiques. */
export const AUTO_SNAPSHOT_INTERVAL_MS = HOUR;
/** Tout est conservé sur cette durée. */
export const KEEP_ALL_MS = 48 * HOUR;
/** Au-delà, un instantané par jour sur cette durée. */
export const KEEP_DAILY_MS = 30 * DAY;
/** Les points de restauration nommés sont conservés sur cette durée. */
export const KEEP_NAMED_MS = 90 * DAY;
/** Nombre maximal d'instantanés conservés par organisation. */
export const MAX_SNAPSHOTS = 200;
/** Longueur maximale du nom d'un point de restauration (contrainte SQL identique). */
export const MAX_LABEL_LENGTH = 120;

export const HISTORY_UNAVAILABLE = "Historique non disponible : appliquez la migration 0007 (supabase/migrations/20261022000007_state_history.sql).";

export interface DbError {
  code?: string;
  message?: string;
}

/** Table absente (migration 0007 non appliquée) : erreur PostgreSQL ou PostgREST. */
export function isMissingTable(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /app_state_history/.test(message) && /does not exist|could not find|schema cache/i.test(message);
}

/** Un instantané automatique est dû si aucun instantané n'a été pris depuis une heure. */
export function autoSnapshotDue(lastCreatedAt: string | null, now: Date): boolean {
  if (!lastCreatedAt) return true;
  const last = Date.parse(lastCreatedAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= AUTO_SNAPSHOT_INTERVAL_MS;
}

export interface RetentionRow {
  id: number;
  kind: SnapshotKind;
  label: string | null;
  createdAt: string;
}

/** Un point nommé : créé à la main par le directeur commercial, avec un nom. */
export function isNamed(row: Pick<RetentionRow, "kind" | "label">): boolean {
  return row.kind === "manual" && Boolean(row.label?.trim());
}

/** Jour calendaire d'un horodatage dans le fuseau de l'espace (repli UTC si fuseau invalide). */
function dayKey(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Identifiants des instantanés à purger : tout est gardé sur 48 h, puis le plus récent de
 * chaque jour sur 30 jours, les points nommés sur 90 jours, et 200 lignes au plus (les plus
 * récentes). Un horodatage illisible est conservé par prudence (sauf au-delà du plafond).
 */
export function snapshotsToPurge(rows: readonly RetentionRow[], now: Date, timeZone = "Europe/Paris"): number[] {
  const t = now.getTime();
  const sorted = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
  const kept: RetentionRow[] = [];
  const days = new Set<string>();
  for (const row of sorted) {
    const at = Date.parse(row.createdAt);
    const age = Number.isFinite(at) ? t - at : 0;
    let keep = age <= KEEP_ALL_MS || (isNamed(row) && age <= KEEP_NAMED_MS);
    if (!keep && age <= KEEP_DAILY_MS) {
      const day = dayKey(row.createdAt, timeZone);
      if (!days.has(day)) {
        days.add(day);
        keep = true;
      }
    }
    if (keep) kept.push(row);
  }
  const keepIds = new Set(kept.slice(0, MAX_SNAPSHOTS).map((r) => r.id));
  return sorted.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
}
