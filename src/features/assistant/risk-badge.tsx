"use client";
import * as React from "react";
import { ShieldAlert } from "lucide-react";
import type { AppData, ISODate } from "@/lib/domain/types";
import { useData, useToday } from "@/lib/store/hooks";
import { isOpen } from "@/lib/calculations/pipeline";
import { buildCrmIndex } from "@/lib/crm/views";
import { RISK_LEVEL, dealRisk, stageChangeIndex, type DealRisk } from "@/lib/assistant/risk";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Indicateur de risque des opportunités (pipeline, fiches). Le score est calculé une seule
 * fois par état des données et par jour, puis partagé entre les composants qui l'affichent.
 */

const cache = new WeakMap<AppData, { today: ISODate; risks: Map<string, DealRisk> }>();

export function computeDealRisks(data: AppData, today: ISODate): Map<string, DealRisk> {
  const hit = cache.get(data);
  if (hit && hit.today === today) return hit.risks;
  const index = stageChangeIndex(data);
  const risks = new Map<string, DealRisk>();
  for (const d of buildCrmIndex(data, today).deals) if (isOpen(d.opportunity)) risks.set(d.opportunity.id, dealRisk(d, data, today, index));
  cache.set(data, { today, risks });
  return risks;
}

/** Risque des opportunités ouvertes, ou `null` si le module Assistant est désactivé. */
export function useDealRisks(): Map<string, DealRisk> | null {
  const data = useData();
  const today = useToday();
  const enabled = data.settings.modules.assistant !== false;
  return React.useMemo(() => (enabled ? computeDealRisks(data, today) : null), [data, today, enabled]);
}

/** Pastille « À risque · 65 » ; les facteurs du score s'affichent en infobulle (survol ou focus). */
export function RiskBadge({ risk, compact, className }: { risk: DealRisk | null | undefined; compact?: boolean; className?: string }) {
  if (!risk) return null;
  const meta = RISK_LEVEL[risk.level];
  const summary = risk.factors.length ? risk.factors.map((f) => f.label).join(" ; ") : "Aucun signal de risque détecté.";
  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <p className="font-medium">
            {meta.label} · score {risk.score}/100
          </p>
          {risk.factors.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-muted">
              {risk.factors.map((f) => (
                <li key={f.key}>
                  {f.label} <span className="tabular text-subtle">(+{f.points})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Aucun signal de risque détecté.</p>
          )}
        </div>
      }
    >
      <Badge tone={meta.tone} tabIndex={0} className={cn("cursor-help", className)} aria-label={`${meta.label}, score ${risk.score} sur 100 : ${summary}`} data-risk-level={risk.level}>
        <ShieldAlert aria-hidden />
        {compact ? <span className="tabular">{risk.score}</span> : <span>{meta.label} · <span className="tabular">{risk.score}</span></span>}
      </Badge>
    </Tooltip>
  );
}
