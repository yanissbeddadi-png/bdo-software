import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppData, Role } from "@/lib/domain/types";
import { CLOUD_PUBLIC_KEY, CLOUD_URL, isCloudMode, ORGANIZATION_ID } from "./config";
import type { Member, StateStore } from "./engine";

/** Clé de service : variable serveur uniquement (jamais préfixée NEXT_PUBLIC_). */
function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

export function cloudReady(): { ok: true } | { ok: false; reason: string } {
  if (!isCloudMode) return { ok: false, reason: "Mode démonstration : Supabase n'est pas configuré." };
  if (!serviceKey()) return { ok: false, reason: "La variable serveur SUPABASE_SERVICE_ROLE_KEY est manquante dans la configuration du déploiement." };
  return { ok: true };
}

/** Client lié à la session de l'utilisateur (cookies). */
export async function sessionClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(CLOUD_URL, CLOUD_PUBLIC_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* Appel depuis un composant serveur : le proxy rafraîchit la session. */
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
/** Client « service » : contourne la RLS. Utilisé exclusivement dans les Server Actions, après authentification. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(CLOUD_URL, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export interface AuthUser {
  id: string;
  email: string;
}

export async function authUser(): Promise<AuthUser | null> {
  const { data, error } = await (await sessionClient()).auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

interface MemberRow {
  organization_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  email: string;
  employee_id: string | null;
  active: boolean;
}

export function toMember(r: MemberRow): Member {
  return { userId: r.user_id, organizationId: r.organization_id, role: r.role, name: r.display_name, email: r.email, employeeId: r.employee_id, active: r.active };
}

export async function memberFor(userId: string): Promise<Member | null> {
  const { data } = await adminClient().from("organization_members").select("*").eq("organization_id", ORGANIZATION_ID).eq("user_id", userId).maybeSingle<MemberRow>();
  return data ? toMember(data) : null;
}

export async function listMemberRows(): Promise<Member[]> {
  const { data, error } = await adminClient().from("organization_members").select("*").eq("organization_id", ORGANIZATION_ID).order("created_at");
  if (error) throw new Error(error.message);
  return (data as MemberRow[]).map(toMember);
}

/** Stockage du document partagé (`app_state`), écriture conditionnée par la version. */
export const supabaseStore: StateStore = {
  async load(organizationId) {
    const { data, error } = await adminClient().from("app_state").select("data, version").eq("organization_id", organizationId).maybeSingle<{ data: AppData; version: number }>();
    if (error) throw new Error(error.message);
    return data ? { data: data.data, version: Number(data.version) } : null;
  },
  async save(organizationId, data, expectedVersion, userId) {
    const { data: rows, error } = await adminClient()
      .from("app_state")
      .update({ data, version: expectedVersion + 1, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("organization_id", organizationId)
      .eq("version", expectedVersion)
      .select("version");
    if (error) throw new Error(error.message);
    return (rows?.length ?? 0) === 1;
  },
};
