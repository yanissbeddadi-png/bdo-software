"use client";
import * as React from "react";
import type { CurrentUser, ID } from "@/lib/domain/types";
import { useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { hasFullAccess } from "@/lib/cloud/scope";
import { buildBriefing, type Briefing } from "@/lib/assistant/briefing";

export type BriefingScope = "mine" | "team";

/**
 * Périmètre du rapport : « Toute l'équipe » est réservé aux accès complets (directeur
 * commercial) ; par défaut, le portefeuille de l'utilisateur s'il a une fiche collaborateur.
 */
export function briefingScopeOf(user: Pick<CurrentUser, "role" | "employeeId">, requested: BriefingScope | null): { scope: BriefingScope; canTeam: boolean; employeeId: ID | null } {
  const me = user.employeeId ?? null;
  const canTeam = hasFullAccess(user.role);
  const scope: BriefingScope = !me ? "team" : !canTeam ? "mine" : (requested ?? "mine");
  return { scope, canTeam: canTeam && !!me, employeeId: scope === "mine" ? me : null };
}

export function useBriefing(requested: BriefingScope | null = null): { briefing: Briefing; scope: BriefingScope; canTeam: boolean } {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const { scope, canTeam, employeeId } = briefingScopeOf(data.settings.user, requested);
  const briefing = React.useMemo(() => buildBriefing(data, today, employeeId, crm), [data, today, employeeId, crm]);
  return { briefing, scope, canTeam };
}
