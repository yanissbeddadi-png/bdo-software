import type { AppData } from "@/lib/domain/types";
import { addMonths, startOfMonthISO } from "@/lib/calculations/dates";
import { SEED_VERSION } from "./seed";

/**
 * Migrations du jeu de données local. Les données de l'utilisateur sont conservées :
 * on ajoute uniquement les structures introduites par les versions suivantes.
 *
 * v1 → v2 : avoirs, remboursements, déclarations de TVA. Le suivi de TVA démarre au
 * mois précédent la migration (seule la dernière période complète est à déclarer :
 * l'historique antérieur n'est pas reconstitué artificiellement).
 */
export function migrateData(input: AppData, today: string): AppData {
  let data = input;
  const version = data.settings.demo.version ?? 1;
  if (version < 2) {
    const legacy = data as Partial<AppData> & AppData;
    data = {
      ...data,
      creditNotes: legacy.creditNotes ?? [],
      refunds: legacy.refunds ?? [],
      vatReturns: legacy.vatReturns ?? [],
      sequences: { ...data.sequences, creditNote: data.sequences.creditNote ?? 0 },
      settings: {
        ...data.settings,
        company: {
          ...data.settings.company,
          vatTrackingStart: data.settings.company.vatTrackingStart ?? addMonths(startOfMonthISO(today), -1),
          vatDueDay: data.settings.company.vatDueDay ?? 24,
        },
        demo: { ...data.settings.demo, version: 2 },
      },
    };
  }
  return data;
}

export function canMigrate(data: AppData): boolean {
  return (data.settings.demo.version ?? 1) <= SEED_VERSION;
}
