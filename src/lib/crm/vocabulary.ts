import type { CrmSettings } from "@/lib/domain/types";
import { DEFAULT_STAGES, STAGES, STAGE_LABELS } from "@/lib/calculations/pipeline";
import { SOURCES } from "./model";

/**
 * Applique le vocabulaire de l'espace (libellés et probabilités des étapes, sources de
 * contacts) aux registres partagés `STAGES`, `STAGE_LABELS` et `SOURCES`. Appelé à chaque
 * changement de données dans le navigateur et avant chaque commande côté serveur. Idempotent.
 */
export function applyCrmVocabulary(crm: Pick<CrmSettings, "stages" | "sources"> | undefined): void {
  for (const stage of STAGES) {
    const base = DEFAULT_STAGES.find((s) => s.id === stage.id)!;
    const custom = crm?.stages?.[stage.id];
    const label = custom?.label.trim() || base.label;
    stage.label = label;
    stage.short = label === base.label ? base.short : label;
    stage.defaultProbability = custom ? custom.probability : base.defaultProbability;
    STAGE_LABELS[stage.id] = label;
  }
  const sources = crm?.sources?.length ? crm.sources : null;
  if (sources && (sources.length !== SOURCES.length || sources.some((s, i) => s !== SOURCES[i]))) SOURCES.splice(0, SOURCES.length, ...sources);
}
