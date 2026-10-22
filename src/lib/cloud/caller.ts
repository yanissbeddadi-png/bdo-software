import "server-only";
import { can } from "@/lib/permissions";
import { authUser, cloudReady, memberFor } from "./server";
import type { Member } from "./engine";

/**
 * Identité de l'appelant d'une Server Action : session Supabase (cookies), puis rôle lu
 * dans `organization_members`. Rien de ce que le navigateur affirme n'est pris en compte.
 */

export type Fail = { ok: false; error: string };

export async function caller(): Promise<{ ok: true; member: Member } | Fail> {
  const ready = cloudReady();
  if (!ready.ok) return { ok: false, error: ready.reason };
  const user = await authUser();
  if (!user) return { ok: false, error: "Session expirée : reconnectez-vous." };
  const member = await memberFor(user.id);
  if (!member) return { ok: false, error: "Ce compte n'a pas accès à l'organisation." };
  if (!member.active) return { ok: false, error: "Ce compte est désactivé. Contactez le directeur commercial." };
  return { ok: true, member };
}

export async function admin(): Promise<{ ok: true; member: Member } | Fail> {
  const c = await caller();
  if (!c.ok) return c;
  if (!can(c.member.role, "settings.write")) return { ok: false, error: "Action réservée au directeur commercial." };
  return c;
}

