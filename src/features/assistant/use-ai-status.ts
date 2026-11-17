"use client";
import * as React from "react";
import { isCloudMode } from "@/lib/cloud/config";
import { aiStatus, type AiStatus } from "@/lib/ai/actions";
import { useAppStore } from "@/lib/store/app-store";
import { useData } from "@/lib/store/hooks";

/** Raison affichée en mode démonstration : aucune donnée n'est envoyée à un fournisseur d'IA. */
export const DEMO_AI_REASON = "IA générative indisponible en mode démonstration : elle nécessite le mode multi-utilisateur (Supabase) et une clé ANTHROPIC_API_KEY sur le serveur.";

/**
 * État de l'IA générative, vérifié par le serveur (clé présente, activation par le directeur
 * commercial, session). Revérifié lorsque le réglage change, une fois l'enregistrement
 * terminé. `null` pendant la vérification.
 */
export function useAiStatus(): AiStatus | null {
  const enabled = !!useData().settings.ai?.enabled;
  const settled = useAppStore((s) => s.pending === 0);
  const [status, setStatus] = React.useState<AiStatus | null>(null);
  React.useEffect(() => {
    if (!isCloudMode || !settled) return;
    let alive = true;
    aiStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ available: false, reason: "Impossible de vérifier l'état de l'IA générative : réessayez plus tard.", keyConfigured: false, enabled, canConfigure: false, model: null }));
    return () => {
      alive = false;
    };
  }, [enabled, settled]);
  if (!isCloudMode) return { available: false, reason: DEMO_AI_REASON, keyConfigured: false, enabled, canConfigure: false, model: null };
  return status;
}
