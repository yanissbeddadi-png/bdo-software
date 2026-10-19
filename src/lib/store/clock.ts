import type { AppData, ISODate, ISODateTime } from "@/lib/domain/types";
import { realTodayISO } from "@/lib/calculations/dates";

/**
 * Horloge de l'application : date du jour dans le fuseau de l'entreprise, ou date de
 * référence simulée (Paramètres › Préférences) avec l'heure réelle. Partagée par le
 * navigateur et le serveur.
 */
export function clock(data: AppData | null, real: Date = new Date()): { today: ISODate; now: ISODateTime } {
  const ref = data?.settings.preferences.referenceDate ?? null;
  const iso = real.toISOString();
  if (!ref) return { today: realTodayISO(data?.settings.company.timezone, real), now: iso };
  return { today: ref, now: `${ref}${iso.slice(10)}` };
}
