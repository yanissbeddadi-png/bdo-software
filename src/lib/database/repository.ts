import type { AppData } from "@/lib/domain/types";

/**
 * Abstraction de persistance. L'interface est volontairement minimale : l'état
 * applicatif est chargé puis sauvegardé après chaque commande métier.
 *
 * - `LocalDemoRepository` : mode démonstration (navigateur, localStorage).
 * - Mode Supabase : schéma relationnel et politiques RLS fournis dans
 *   `supabase/migrations`. L'adaptateur applicatif n'est pas encore branché
 *   (voir README § Supabase) ; l'application ne prétend pas synchroniser.
 */
export interface DataRepository {
  readonly kind: "local-demo" | "supabase";
  load(): AppData | null;
  save(data: AppData): void;
  clear(): void;
}

export const STORAGE_KEY = "bdo-software:demo-data:v1";

export class LocalDemoRepository implements DataRepository {
  readonly kind = "local-demo" as const;

  load(): AppData | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppData;
      return isAppData(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(data: AppData): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Sauvegarde locale impossible", error);
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* stockage indisponible */
    }
  }
}

const COLLECTIONS: (keyof AppData)[] = [
  "clients",
  "contacts",
  "leads",
  "opportunities",
  "salesActivities",
  "products",
  "quotes",
  "invoices",
  "payments",
  "expenses",
  "subscriptions",
  "projects",
  "tasks",
  "employees",
  "goals",
  "missions",
  "achievements",
  "xpTransactions",
  "retiredXpKeys",
  "progression",
  "notifications",
  "activity",
  "auditLogs",
  "notes",
];

/** Vérification structurelle minimale d'un jeu de données (stockage local ou import). */
export function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!v.settings || typeof v.settings !== "object" || !v.sequences) return false;
  const s = v.settings as Record<string, unknown>;
  if (!s.company || !s.gamification || !s.rules || !s.demo || !s.user) return false;
  return COLLECTIONS.every((k) => Array.isArray(v[k]));
}

export interface ExternalConnectionStatus {
  supabaseConfigured: boolean;
  supabaseUrl: string | null;
}

/** Les variables publiques Supabase sont inlinées au build par Next.js. */
export function externalConnections(): ExternalConnectionStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
  return { supabaseConfigured: Boolean(url && key), supabaseUrl: url };
}
