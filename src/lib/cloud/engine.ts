import type { AppData, CurrentUser, Role } from "@/lib/domain/types";
import { execute, finalize } from "@/lib/domain/runtime";
import { withIdSeed } from "@/lib/domain/ids";
import { COMMANDS, SHARED_MODE_FORBIDDEN, SHARED_MODE_SETTINGS_ONLY } from "@/lib/domain/commands/registry";
import { can } from "@/lib/permissions";
import { clock } from "@/lib/store/clock";
import { canMigrate, migrateData } from "@/lib/database/migrations";
import { SEED_VERSION } from "@/lib/database/seed";
import { isAppData } from "@/lib/database/repository";
import { projectForUser, scopeViolation } from "./scope";

/**
 * Cœur du mode multi-utilisateur, indépendant de Supabase (testé avec un stockage en
 * mémoire). Une commande lancée dans le navigateur est rejouée ici avec le rôle lu en
 * base, la même graine d'identifiants et une horloge contrôlée, puis enregistrée avec un
 * contrôle de concurrence optimiste.
 */

export interface Member {
  userId: string;
  organizationId: string;
  role: Role;
  name: string;
  email: string;
  employeeId: string | null;
  active: boolean;
}

export interface StoredState {
  data: AppData;
  version: number;
}

export interface StateStore {
  load(organizationId: string): Promise<StoredState | null>;
  /** Enregistre si la version stockée est toujours `expectedVersion` ; `false` en cas de conflit. */
  save(organizationId: string, data: AppData, expectedVersion: number, userId: string): Promise<boolean>;
}

export interface RunRequest {
  name: string;
  input: unknown;
  /** Horodatage utilisé par le navigateur (accepté s'il est proche de l'heure du serveur). */
  now: string;
  /** Graine des identifiants créés par la commande. */
  seed: string;
}

export type RunResponse = { ok: true; version: number; data: AppData; message: string } | { ok: false; error: string; fieldErrors: Record<string, string>; version?: number; data?: AppData };

/** Écart toléré entre l'horloge du navigateur et celle du serveur. */
const MAX_CLOCK_SKEW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 4;

export function sessionUser(m: Member): CurrentUser {
  return { id: m.userId, name: m.name || m.email, email: m.email, role: m.role, employeeId: m.employeeId };
}

/** L'utilisateur courant n'est jamais lu depuis le document partagé : il vient de la session. */
export function withUser(data: AppData, user: CurrentUser): AppData {
  return { ...data, settings: { ...data.settings, user } };
}

/** Met à niveau un document ancien (même migration que le mode démonstration). */
export function upgrade(data: AppData, today: string): AppData {
  return canMigrate(data) && (data.settings.demo.version ?? 1) < SEED_VERSION ? migrateData(data, today) : data;
}

export async function runSharedCommand(store: StateStore, member: Member, req: RunRequest, serverNow: Date = new Date()): Promise<RunResponse> {
  if (!member.active) return { ok: false, error: "Compte désactivé.", fieldErrors: {} };
  const command = Object.prototype.hasOwnProperty.call(COMMANDS, req.name) ? COMMANDS[req.name] : undefined;
  if (!command) return { ok: false, error: "Action inconnue.", fieldErrors: {} };
  if (SHARED_MODE_FORBIDDEN.has(req.name)) return { ok: false, error: "Le rôle est attribué par le directeur commercial et ne peut pas être changé ici.", fieldErrors: {} };
  if (SHARED_MODE_SETTINGS_ONLY.has(req.name) && !can(member.role, "settings.write"))
    return { ok: false, error: "Ce réglage s'applique à toute l'équipe : il est réservé aux rôles autorisés à modifier les paramètres.", fieldErrors: {} };
  const user = sessionUser(member);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const stored = await store.load(member.organizationId);
    if (!stored) return { ok: false, error: "Aucune donnée pour cette organisation.", fieldErrors: {} };
    const server = clock(stored.data, serverNow);
    const data = withUser(upgrade(stored.data, server.today), user);
    const clientTime = Date.parse(req.now);
    const now = Number.isFinite(clientTime) && Math.abs(clientTime - Date.parse(server.now)) <= MAX_CLOCK_SKEW_MS ? new Date(clientTime).toISOString() : server.now;
    let res: ReturnType<typeof execute>;
    try {
      res = withIdSeed(req.seed, () => execute(data, command, req.input, { today: server.today, now, user }));
    } catch {
      return { ok: false, error: "Requête invalide.", fieldErrors: {} };
    }
    if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors, version: stored.version, data: projectForUser(data, user) };
    // Cloisonnement : un collaborateur ne modifie que son propre portefeuille.
    const violation = scopeViolation(data, res.data, user);
    if (violation) return { ok: false, error: violation, fieldErrors: {}, version: stored.version, data: projectForUser(data, user) };
    if (await store.save(member.organizationId, res.data, stored.version, member.userId)) {
      return { ok: true, version: stored.version + 1, data: projectForUser(res.data, user), message: res.message };
    }
    // Conflit : un autre utilisateur a enregistré entre-temps, on rejoue sur la version à jour.
  }
  return { ok: false, error: "Trop de modifications simultanées : réessayez dans un instant.", fieldErrors: {} };
}

/** Remplacement complet (import ou réinitialisation), réservé à `data.admin`. */
export async function replaceSharedState(store: StateStore, member: Member, incoming: unknown, serverNow: Date = new Date()): Promise<RunResponse> {
  if (!member.active || !can(member.role, "data.admin")) return { ok: false, error: "Action réservée au directeur commercial.", fieldErrors: {} };
  if (!isAppData(incoming)) return { ok: false, error: "Fichier non reconnu : ce n'est pas un export BDO Software.", fieldErrors: {} };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const stored = await store.load(member.organizationId);
    if (!stored) return { ok: false, error: "Aucune donnée pour cette organisation.", fieldErrors: {} };
    const server = clock(incoming, serverNow);
    const data = finalize(upgrade(withUser(incoming, sessionUser(member)), server.today), server).data;
    if (await store.save(member.organizationId, data, stored.version, member.userId)) return { ok: true, version: stored.version + 1, data, message: "Données remplacées pour toute l'équipe." };
  }
  return { ok: false, error: "Trop de modifications simultanées : réessayez dans un instant.", fieldErrors: {} };
}

/** Mot de passe temporaire lisible (sans caractères ambigus), 14 caractères. */
export function temporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 9)}-${body.slice(9)}`;
}

/** Rôle proposé par défaut pour un compte de test, selon le service du collaborateur. */
export function defaultRoleFor(department: string): Role {
  // Comptes de test : chaque collaborateur gère son propre portefeuille commercial.
  void department;
  return "commercial";
}
