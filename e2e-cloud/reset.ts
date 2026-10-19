import { createClient } from "@supabase/supabase-js";

/** Vide le Supabase LOCAL (comptes, membres, document partagé) avant les parcours. */
export default async function reset() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error("Tests du mode partagé : uniquement contre un Supabase local.");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  await admin.from("organization_members").delete().neq("role", "__none__");
  await admin.from("app_state").delete().neq("organization_id", "__none__");
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}
