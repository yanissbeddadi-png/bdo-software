"use server";
import { isCloudMode, ORGANIZATION_ID } from "@/lib/cloud/config";
import { caller } from "@/lib/cloud/caller";
import { supabaseStore } from "@/lib/cloud/server";
import { sessionUser, upgrade, withUser } from "@/lib/cloud/engine";
import { projectForUser } from "@/lib/cloud/scope";
import { clock } from "@/lib/store/clock";
import { can } from "@/lib/permissions";
import type { AppData } from "@/lib/domain/types";
import { accountContext } from "./context";
import { AiError, REWRITE_STYLES, aiKeyConfigured, aiModel, rewriteDraft, summarizeAccount, type AccountSummary, type RewriteStyle } from "./claude";

/**
 * Server Actions de l'IA générative. Conditions cumulatives, vérifiées côté serveur à
 * chaque appel : mode multi-utilisateur, session valide, autorisation donnée par le
 * directeur commercial (réglage lu dans le document partagé, pas dans la requête) et
 * clé `ANTHROPIC_API_KEY` présente sur le serveur. Sinon, l'interface l'indique.
 */

export interface AiStatus {
  available: boolean;
  /** Explication affichée lorsque l'IA n'est pas disponible. */
  reason: string;
  keyConfigured: boolean;
  /** Réglage de l'espace (activé par le directeur commercial). */
  enabled: boolean;
  /** L'utilisateur peut modifier le réglage (directeur commercial). */
  canConfigure: boolean;
  model: string | null;
}

type Fail = { ok: false; error: string };

/** Limite simple par utilisateur et par instance de serveur : 20 demandes par tranche de 10 minutes. */
const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 20;
const usage = new Map<string, number[]>();
function allow(userId: string): boolean {
  const now = Date.now();
  const recent = (usage.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    usage.set(userId, recent);
    return false;
  }
  recent.push(now);
  usage.set(userId, recent);
  return true;
}

async function context(): Promise<{ ok: true; data: AppData; userId: string; status: AiStatus } | Fail> {
  if (!isCloudMode) return { ok: false, error: "L'IA générative n'est disponible qu'en mode multi-utilisateur (Supabase configuré)." };
  const c = await caller();
  if (!c.ok) return c;
  const stored = await supabaseStore.load(ORGANIZATION_ID);
  if (!stored) return { ok: false, error: "Les données de l'organisation sont introuvables." };
  const user = sessionUser(c.member);
  const data = projectForUser(withUser(upgrade(stored.data, clock(stored.data).today), user), user);
  const enabled = !!data.settings.ai?.enabled;
  const keyConfigured = aiKeyConfigured();
  const canConfigure = can(c.member.role, "settings.write");
  const reason = !keyConfigured
    ? "IA générative non configurée : la variable serveur ANTHROPIC_API_KEY est absente du déploiement."
    : !enabled
      ? canConfigure
        ? "IA générative désactivée : vous pouvez l'activer dans Paramètres › Assistant."
        : "IA générative désactivée par le directeur commercial."
      : "";
  return { ok: true, data, userId: c.member.userId, status: { available: keyConfigured && enabled, reason, keyConfigured, enabled, canConfigure, model: keyConfigured ? aiModel() : null } };
}

export async function aiStatus(): Promise<AiStatus> {
  const ctx = await context();
  if (!ctx.ok) return { available: false, reason: ctx.error, keyConfigured: aiKeyConfigured(), enabled: false, canConfigure: false, model: null };
  return ctx.status;
}

const MAX_TEXT = 6000;

export async function aiImproveDraft(input: { subject: string; body: string; style: string; instruction?: string }): Promise<{ ok: true; subject: string; body: string } | Fail> {
  if (!input || typeof input.subject !== "string" || typeof input.body !== "string" || typeof input.style !== "string") return { ok: false, error: "Requête invalide." };
  if (!(input.style in REWRITE_STYLES)) return { ok: false, error: "Style inconnu." };
  const subject = input.subject.trim().slice(0, 300);
  const body = input.body.trim();
  const instruction = (input.instruction ?? "").trim().slice(0, 300);
  if (!body) return { ok: false, error: "Le brouillon est vide." };
  if (body.length > MAX_TEXT) return { ok: false, error: `Brouillon trop long (${MAX_TEXT} caractères maximum).` };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  if (!ctx.status.available) return { ok: false, error: ctx.status.reason };
  if (!allow(ctx.userId)) return { ok: false, error: "Trop de demandes à l'IA en peu de temps : réessayez dans quelques minutes." };
  try {
    const out = await rewriteDraft({ subject, body, style: input.style as RewriteStyle, instruction });
    return { ok: true, subject: out.subject.trim().slice(0, 300), body: out.body.trim() };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, error: error.message };
    console.error("aiImproveDraft", error);
    return { ok: false, error: "L'IA n'a pas pu traiter la demande." };
  }
}

export async function aiAccountSummary(input: { contactId: string }): Promise<({ ok: true } & AccountSummary) | Fail> {
  if (!input || typeof input.contactId !== "string" || input.contactId.length > 80) return { ok: false, error: "Requête invalide." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  if (!ctx.status.available) return { ok: false, error: ctx.status.reason };
  // Contexte construit côté serveur, à partir des seules données visibles par l'utilisateur.
  const text = accountContext(ctx.data, input.contactId, clock(ctx.data).today);
  if (!text) return { ok: false, error: "Contact introuvable." };
  if (!allow(ctx.userId)) return { ok: false, error: "Trop de demandes à l'IA en peu de temps : réessayez dans quelques minutes." };
  try {
    return { ok: true, ...(await summarizeAccount(text)) };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, error: error.message };
    console.error("aiAccountSummary", error);
    return { ok: false, error: "L'IA n'a pas pu traiter la demande." };
  }
}
