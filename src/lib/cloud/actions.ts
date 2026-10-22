"use server";
import type { AppData, CurrentUser, Role } from "@/lib/domain/types";
import { can } from "@/lib/permissions";
import { createSeedData } from "@/lib/database/seed";
import { realTodayISO } from "@/lib/calculations/dates";
import { ORGANIZATION_ID } from "./config";
import { adminClient, authUser, cloudReady, listMemberRows, supabaseStore } from "./server";
import { defaultRoleFor, replaceSharedState, runSharedCommand, sessionUser, temporaryPassword, upgrade, withUser, type RunRequest, type RunResponse } from "./engine";
import { clock } from "@/lib/store/clock";
import { distributePortfolio, projectForUser } from "./scope";
import { clearWorkspace, createEmptyData, demoInWorkspace } from "@/lib/database/empty";
import { newId } from "@/lib/domain/ids";
import { admin, caller, type Fail } from "./caller";

/**
 * Server Actions du mode multi-utilisateur. Chaque action authentifie l'appelant à partir
 * de sa session (cookies Supabase), lit son rôle dans `organization_members` et vérifie
 * les permissions côté serveur ; rien de ce que le navigateur affirme sur l'identité ou
 * le rôle n'est pris en compte.
 */

/** Rôles attribuables : le directeur commercial administre l'espace et voit tout. */
const ROLES: Role[] = ["dirigeant", "commercial", "collaborateur"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ----------------------------- Données partagées ----------------------------- */

export type SessionState = { status: "ok"; data: AppData; version: number; user: CurrentUser } | { status: "signed-out" } | { status: "error"; error: string };

export async function loadSession(): Promise<SessionState> {
  const ready = cloudReady();
  if (!ready.ok) return { status: "error", error: ready.reason };
  const user = await authUser();
  if (!user) return { status: "signed-out" };
  const c = await caller();
  if (!c.ok) return { status: "error", error: c.error };
  const stored = await supabaseStore.load(ORGANIZATION_ID);
  if (!stored) return { status: "error", error: "Les données de l'organisation sont introuvables. Terminez l'installation." };
  const u = sessionUser(c.member);
  return { status: "ok", data: projectForUser(withUser(upgrade(stored.data, clock(stored.data).today), u), u), version: stored.version, user: u };
}

export async function runRemote(req: RunRequest): Promise<RunResponse> {
  if (!req || typeof req.name !== "string" || typeof req.seed !== "string" || typeof req.now !== "string") return { ok: false, error: "Requête invalide.", fieldErrors: {} };
  const c = await caller();
  if (!c.ok) return { ok: false, error: c.error, fieldErrors: {} };
  return runSharedCommand(supabaseStore, c.member, req);
}

export async function pullRemote(knownVersion: number): Promise<{ changed: false } | { changed: true; data: AppData; version: number } | Fail> {
  const c = await caller();
  if (!c.ok) return c;
  const stored = await supabaseStore.load(ORGANIZATION_ID);
  if (!stored || stored.version === knownVersion) return { changed: false };
  const u = sessionUser(c.member);
  return { changed: true, data: projectForUser(withUser(upgrade(stored.data, clock(stored.data).today), u), u), version: stored.version };
}

export async function replaceRemote(incoming: unknown): Promise<RunResponse> {
  const c = await caller();
  if (!c.ok) return { ok: false, error: c.error, fieldErrors: {} };
  return replaceSharedState(supabaseStore, c.member, incoming);
}

/** Recharge le jeu de démonstration (réparti entre les collaborateurs) ou vide l'espace. */
export async function resetRemote(kind: "demo" | "empty" = "demo"): Promise<RunResponse> {
  const c = await caller();
  if (!c.ok) return { ok: false, error: c.error, fieldErrors: {} };
  const stored = await supabaseStore.load(c.member.organizationId);
  if (!stored) return { ok: false, error: "Aucune donnée pour cette organisation.", fieldErrors: {} };
  const { today, now } = clock(null);
  const next = kind === "empty" ? clearWorkspace(stored.data, today) : distributePortfolio(demoInWorkspace(createSeedData(today, now), stored.data), c.member.employeeId);
  return replaceSharedState(supabaseStore, c.member, next);
}

/* ----------------------------- Comptes ----------------------------- */

export interface MemberView {
  userId: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  active: boolean;
  lastSignInAt: string | null;
  isSelf: boolean;
}

export async function listMembers(): Promise<{ ok: true; members: MemberView[] } | Fail> {
  const a = await admin();
  if (!a.ok) return a;
  const rows = await listMemberRows();
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  const lastSignIn = new Map((data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  return {
    ok: true,
    members: rows.map((m) => ({
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
      employeeId: m.employeeId,
      active: m.active,
      lastSignInAt: lastSignIn.get(m.userId) ?? null,
      isSelf: m.userId === a.member.userId,
    })),
  };
}

async function createAccount(input: { email: string; name: string; role: Role; employeeId: string | null; password: string }): Promise<{ ok: true; userId: string } | Fail> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (error || !data.user)
    return {
      ok: false,
      error: /already|registered|exists/i.test(error?.message ?? "") ? "Un compte existe déjà avec cet e-mail." : `Création du compte impossible : ${error?.message ?? "erreur inconnue"}`,
    };
  const { error: e2 } = await adminClient()
    .from("organization_members")
    .insert({ organization_id: ORGANIZATION_ID, user_id: data.user.id, role: input.role, display_name: input.name, email: input.email, employee_id: input.employeeId, active: true });
  if (e2) {
    await adminClient().auth.admin.deleteUser(data.user.id);
    return { ok: false, error: `Rattachement à l'organisation impossible : ${e2.message}` };
  }
  return { ok: true, userId: data.user.id };
}

function validAccount(input: { email: string; name: string; role: string }): string | null {
  if (!EMAIL.test(input.email.trim())) return "Adresse e-mail invalide.";
  if (!input.name.trim()) return "Le nom est obligatoire.";
  if (!ROLES.includes(input.role as Role)) return "Rôle inconnu.";
  return null;
}

/** Crée un compte avec un mot de passe temporaire, affiché une seule fois au directeur commercial. */
export async function createMember(input: { email: string; name: string; role: Role; employeeId: string | null }): Promise<{ ok: true; email: string; password: string } | Fail> {
  const a = await admin();
  if (!a.ok) return a;
  const invalid = validAccount(input);
  if (invalid) return { ok: false, error: invalid };
  const password = temporaryPassword();
  const res = await createAccount({ email: input.email.trim().toLowerCase(), name: input.name.trim(), role: input.role, employeeId: input.employeeId, password });
  return res.ok ? { ok: true, email: input.email.trim().toLowerCase(), password } : res;
}

export async function updateMember(input: { userId: string; role: Role; employeeId: string | null; active: boolean }): Promise<{ ok: true } | Fail> {
  const a = await admin();
  if (!a.ok) return a;
  if (!ROLES.includes(input.role) && input.role !== "admin") return { ok: false, error: "Rôle inconnu." };
  if (input.userId === a.member.userId && (!input.active || !can(input.role, "settings.write"))) return { ok: false, error: "Vous ne pouvez pas retirer vos propres droits d'administration." };
  const { error } = await adminClient()
    .from("organization_members")
    .update({ role: input.role, employee_id: input.employeeId, active: input.active, updated_at: new Date().toISOString() })
    .eq("organization_id", ORGANIZATION_ID)
    .eq("user_id", input.userId);
  if (error) return { ok: false, error: error.message };
  // Un compte désactivé ne peut plus se connecter (bannissement Supabase Auth).
  await adminClient().auth.admin.updateUserById(input.userId, { ban_duration: input.active ? "none" : "876000h" });
  return { ok: true };
}

export async function resetMemberPassword(userId: string): Promise<{ ok: true; password: string } | Fail> {
  const a = await admin();
  if (!a.ok) return a;
  const members = await listMemberRows();
  if (!members.some((m) => m.userId === userId)) return { ok: false, error: "Compte introuvable." };
  const password = temporaryPassword();
  const { error } = await adminClient().auth.admin.updateUserById(userId, { password });
  return error ? { ok: false, error: error.message } : { ok: true, password };
}

/** Crée un compte de test pour chaque collaborateur de la fiche Équipe qui n'en a pas encore. */
export async function createTestAccounts(): Promise<{ ok: true; accounts: { name: string; email: string; role: Role; password: string }[]; skipped: number } | Fail> {
  const a = await admin();
  if (!a.ok) return a;
  const stored = await supabaseStore.load(ORGANIZATION_ID);
  if (!stored) return { ok: false, error: "Données introuvables." };
  const members = await listMemberRows();
  const linked = new Set(members.map((m) => m.employeeId).filter(Boolean));
  const emails = new Set(members.map((m) => m.email.toLowerCase()));
  const accounts: { name: string; email: string; role: Role; password: string }[] = [];
  let skipped = 0;
  for (const e of stored.data.employees) {
    const email = e.email.toLowerCase();
    // Fiche sans e-mail valide : pas de compte possible (l'e-mail est l'identifiant).
    if (e.status === "left" || linked.has(e.id) || emails.has(email) || !EMAIL.test(email)) {
      skipped++;
      continue;
    }
    const name = `${e.firstName} ${e.lastName}`;
    // Rôle indiqué dans le fichier d'équipe importé, sinon rôle par défaut.
    const role = e.accessRole ?? defaultRoleFor(e.department);
    const password = temporaryPassword();
    const res = await createAccount({ email, name, role, employeeId: e.id, password });
    if (res.ok) accounts.push({ name, email, role, password });
    else skipped++;
  }
  return { ok: true, accounts, skipped };
}

/* ----------------------------- Installation ----------------------------- */

export async function setupStatus(): Promise<{ cloud: boolean; ready: boolean; reason?: string; needsSetup: boolean; codeRequired: boolean }> {
  const ready = cloudReady();
  if (!ready.ok) return { cloud: false, ready: false, reason: ready.reason, needsSetup: false, codeRequired: false };
  const { count, error } = await adminClient().from("organization_members").select("user_id", { count: "exact", head: true });
  if (error) return { cloud: true, ready: false, reason: `Base Supabase non initialisée (${error.message}). Exécutez supabase/install.sql.`, needsSetup: false, codeRequired: false };
  return { cloud: true, ready: true, needsSetup: (count ?? 0) === 0, codeRequired: Boolean(process.env.BDO_SETUP_CODE) };
}

/** Identité visuelle affichée sur la page de connexion (nom, logo, couleur : rien de sensible). */
export async function publicBranding(): Promise<{ name: string; logo: string | null; color: string; bdoMark: boolean } | null> {
  if (!cloudReady().ok) return null;
  const stored = await supabaseStore.load(ORGANIZATION_ID).catch(() => null);
  if (!stored) return null;
  const s = upgrade(stored.data, realTodayISO()).settings;
  return { name: s.company.name, logo: s.branding.logo, color: s.branding.color, bdoMark: s.branding.bdoMark };
}

/**
 * Première installation : crée l'organisation, un espace vide (nouveau client) ou le jeu de
 * démonstration, et le compte du directeur commercial (administrateur de l'espace). Possible uniquement tant
 * qu'aucun compte n'existe, et protégée par le code BDO_SETUP_CODE (variable serveur obligatoire).
 */
export interface InstallInput {
  code: string;
  companyName: string;
  name: string;
  email: string;
  password: string;
  /** `empty` : espace vierge pour un nouveau client ; `demo` : données de démonstration. */
  start: "empty" | "demo";
  /** Mode `demo` : fiche de démonstration choisie. */
  employeeId: string | null;
  /** Mode `empty` : fonction de la personne qui installe (sa fiche est créée). */
  jobTitle: string;
}

export async function installOrganization(input: InstallInput): Promise<{ ok: true } | Fail> {
  const status = await setupStatus();
  if (!status.ready) return { ok: false, error: status.reason ?? "Supabase n'est pas prêt." };
  if (!status.needsSetup) return { ok: false, error: "L'installation est déjà faite : connectez-vous." };
  if (!status.codeRequired) return { ok: false, error: "Définissez d'abord la variable BDO_SETUP_CODE dans la configuration du déploiement, puis redéployez." };
  if (input.code !== process.env.BDO_SETUP_CODE) return { ok: false, error: "Code d'installation incorrect." };
  const invalid = validAccount({ email: input.email, name: input.name, role: "dirigeant" });
  if (invalid) return { ok: false, error: invalid };
  if (input.password.length < 10) return { ok: false, error: "Mot de passe : 10 caractères minimum." };
  const company = input.companyName.trim();
  if (input.start === "empty" && !company) return { ok: false, error: "Indiquez le nom de l'entreprise." };

  const today = realTodayISO();
  const now = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  let data: AppData;
  let employeeId: string | null;
  if (input.start === "empty") {
    // Espace vierge : la fiche de la personne qui installe est créée à partir de son nom.
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    employeeId = newId("emp");
    data = createEmptyData(today, now, company, { firstName: firstName ?? "", lastName: rest.join(" "), jobTitle: input.jobTitle, email }, employeeId);
  } else {
    const seed = createSeedData(today, `${today}T08:00:00.000Z`);
    employeeId = input.employeeId;
    const named = { ...seed, settings: { ...seed.settings, company: { ...seed.settings.company, name: company || seed.settings.company.name } } };
    // Portefeuille de démonstration réparti entre les collaborateurs : chacun a ses propres données à tester.
    data = distributePortfolio(named, employeeId);
  }
  const db = adminClient();
  const { error: e1 } = await db.from("organizations").upsert({ id: ORGANIZATION_ID, name: data.settings.company.name, is_demo: input.start === "demo" });
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await db.from("app_state").upsert({ organization_id: ORGANIZATION_ID, data, version: 1 });
  if (e2) return { ok: false, error: e2.message };
  // Le directeur commercial est l'administrateur de l'espace.
  const res = await createAccount({ email, name: input.name.trim(), role: "dirigeant", employeeId, password: input.password });
  return res.ok ? { ok: true } : res;
}
