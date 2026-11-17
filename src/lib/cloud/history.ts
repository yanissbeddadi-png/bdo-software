import "server-only";
import type { AppData } from "@/lib/domain/types";
import { adminClient, supabaseStore } from "./server";
import type { StateStore, StoredState } from "./engine";
import { autoSnapshotDue, AUTO_SNAPSHOT_INTERVAL_MS, HISTORY_UNAVAILABLE, isMissingTable, snapshotsToPurge, type DbError, type RetentionRow, type SnapshotKind } from "./retention";

/**
 * Historique des versions du document partagé (`app_state_history`, migration 0007).
 * Serveur uniquement, avec la clé de service : la table n'a aucune politique RLS ni aucun
 * droit pour les navigateurs. Un échec d'instantané est journalisé et n'empêche jamais
 * l'enregistrement (voir `captureBefore` dans engine.ts).
 */

const TABLE = "app_state_history";


/** Dernier instantané connu par organisation (évite une requête à chaque enregistrement). */
const lastSnapshotAt = new Map<string, number>();
/** Table absente : on ne réessaie qu'après ce délai (pas de requête inutile à chaque action). */
let unavailableUntil = 0;
const RETRY_MISSING_MS = 10 * 60_000;

function markMissing(error: DbError): void {
  unavailableUntil = Date.now() + RETRY_MISSING_MS;
  console.warn(HISTORY_UNAVAILABLE, error.message ?? "");
}

export type InsertResult = { ok: true; id: number } | { ok: false; error: string };

/** Enregistre une copie de `state`, puis applique la rétention (sans bloquer en cas d'échec). */
export async function insertSnapshot(organizationId: string, state: StoredState, kind: SnapshotKind, userId: string | null, now: Date, label: string | null = null): Promise<InsertResult> {
  const { data, error } = await adminClient()
    .from(TABLE)
    .insert({ organization_id: organizationId, version: state.version, data: state.data, kind, label, created_by: userId, created_at: now.toISOString() })
    .select("id")
    .single<{ id: number }>();
  if (error || !data) {
    if (isMissingTable(error)) {
      markMissing(error!);
      return { ok: false, error: HISTORY_UNAVAILABLE };
    }
    return { ok: false, error: `Instantané impossible : ${error?.message ?? "erreur inconnue"}` };
  }
  lastSnapshotAt.set(organizationId, now.getTime());
  try {
    await purgeHistory(organizationId, now, state.data.settings?.company?.timezone || "Europe/Paris");
  } catch (e) {
    console.error("Purge de l'historique impossible", e);
  }
  return { ok: true, id: Number(data.id) };
}

/** Rétention : purge par le client supabase-js des instantanés devenus inutiles. */
export async function purgeHistory(organizationId: string, now: Date, timeZone: string): Promise<number> {
  const { data, error } = await adminClient().from(TABLE).select("id, kind, label, created_at").eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  const rows: RetentionRow[] = (data as { id: number; kind: SnapshotKind; label: string | null; created_at: string }[]).map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    label: r.label,
    createdAt: r.created_at,
  }));
  const ids = snapshotsToPurge(rows, now, timeZone);
  if (ids.length === 0) return 0;
  const { error: e2 } = await adminClient().from(TABLE).delete().eq("organization_id", organizationId).in("id", ids);
  if (e2) throw new Error(e2.message);
  return ids.length;
}

/** Instantané pris par le moteur avant un enregistrement (automatique au plus une fois par heure). */
async function snapshotBefore(organizationId: string, previous: StoredState, kind: SnapshotKind, userId: string, now: Date): Promise<void> {
  if (kind === "auto") {
    if (Date.now() < unavailableUntil) return;
    const known = lastSnapshotAt.get(organizationId);
    if (known !== undefined && now.getTime() - known < AUTO_SNAPSHOT_INTERVAL_MS) return;
    const { data, error } = await adminClient()
      .from(TABLE)
      .select("created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>();
    if (error) {
      if (isMissingTable(error)) markMissing(error);
      else console.error("Lecture de l'historique impossible", error.message);
      return;
    }
    if (data && !autoSnapshotDue(data.created_at, now)) {
      lastSnapshotAt.set(organizationId, Date.parse(data.created_at));
      return;
    }
  }
  const res = await insertSnapshot(organizationId, previous, kind, userId, now);
  if (!res.ok && res.error !== HISTORY_UNAVAILABLE) console.error(res.error);
}

/** Stockage du document partagé avec historique des versions (utilisé par les Server Actions). */
export const sharedStore: StateStore = {
  load: (organizationId) => supabaseStore.load(organizationId),
  save: (organizationId, data, expectedVersion, userId) => supabaseStore.save(organizationId, data, expectedVersion, userId),
  snapshot: snapshotBefore,
};

export interface SnapshotRow {
  id: number;
  version: number;
  kind: SnapshotKind;
  label: string | null;
  createdAt: string;
  createdBy: string | null;
}

export async function listHistory(organizationId: string): Promise<{ ok: true; rows: SnapshotRow[] } | { ok: false; error: string }> {
  const { data, error } = await adminClient()
    .from(TABLE)
    .select("id, version, kind, label, created_at, created_by")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: isMissingTable(error) ? HISTORY_UNAVAILABLE : error.message };
  return {
    ok: true,
    rows: (data as { id: number; version: number; kind: SnapshotKind; label: string | null; created_at: string; created_by: string | null }[]).map((r) => ({
      id: Number(r.id),
      version: Number(r.version),
      kind: r.kind,
      label: r.label,
      createdAt: r.created_at,
      createdBy: r.created_by,
    })),
  };
}

export async function loadSnapshot(organizationId: string, id: number): Promise<{ ok: true; row: SnapshotRow; data: AppData } | { ok: false; error: string }> {
  const { data, error } = await adminClient()
    .from(TABLE)
    .select("id, version, kind, label, created_at, created_by, data")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle<{ id: number; version: number; kind: SnapshotKind; label: string | null; created_at: string; created_by: string | null; data: AppData }>();
  if (error) return { ok: false, error: isMissingTable(error) ? HISTORY_UNAVAILABLE : error.message };
  if (!data) return { ok: false, error: "Point de restauration introuvable." };
  return {
    ok: true,
    row: { id: Number(data.id), version: Number(data.version), kind: data.kind, label: data.label, createdAt: data.created_at, createdBy: data.created_by },
    data: data.data,
  };
}
