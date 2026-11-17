import type { AppData, CustomFieldDef, CustomFieldEntity, CustomFieldType, CustomValues } from "@/lib/domain/types";

/**
 * Champs personnalisés des fiches (contacts, entreprises, opportunités) : libellés,
 * nettoyage des valeurs saisies selon les définitions de l'espace, lecture et affichage.
 * Fonctions pures, partagées par les commandes (navigateur et serveur), les formulaires,
 * les listes, la recherche et l'import.
 */

export const CUSTOM_ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  contact: "Contacts",
  company: "Entreprises",
  opportunity: "Opportunités",
};

export const CUSTOM_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texte",
  number: "Nombre",
  date: "Date",
  select: "Liste de valeurs",
  yesno: "Oui / non",
};

/** Longueur maximale d'une valeur texte. */
export const MAX_CUSTOM_TEXT = 500;

/** Champs définis pour un type de fiche, dans l'ordre configuré. */
export function customFieldsFor(data: Pick<AppData, "settings">, entity: CustomFieldEntity): CustomFieldDef[] {
  return (data.settings.customFields ?? []).filter((f) => f.entity === entity);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export type CleanResult = { ok: true; value: string | number | boolean | undefined } | { ok: false; error: string };

/**
 * Nettoie une valeur selon la définition du champ : `undefined` signifie « pas de valeur »
 * (vide ou `null`). Une valeur de liste qui n'est plus proposée reste acceptée si elle est
 * déjà enregistrée sur la fiche (`previous`), pour ne pas bloquer la modification.
 */
export function cleanCustomValue(def: CustomFieldDef, raw: unknown, previous?: unknown): CleanResult {
  if (raw === null || raw === undefined) return { ok: true, value: undefined };
  switch (def.type) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, error: `« ${def.label} » : texte attendu.` };
      const v = raw.trim();
      if (v.length > MAX_CUSTOM_TEXT) return { ok: false, error: `« ${def.label} » : ${MAX_CUSTOM_TEXT} caractères maximum.` };
      return { ok: true, value: v || undefined };
    }
    case "number": {
      if (typeof raw === "string" && !raw.trim()) return { ok: true, value: undefined };
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(/\s/g, "").replace(",", ".")) : Number.NaN;
      if (!Number.isFinite(n)) return { ok: false, error: `« ${def.label} » : nombre invalide.` };
      return { ok: true, value: n };
    }
    case "date": {
      if (typeof raw !== "string") return { ok: false, error: `« ${def.label} » : date invalide (AAAA-MM-JJ).` };
      const v = raw.trim();
      if (!v) return { ok: true, value: undefined };
      if (!isIsoDate(v)) return { ok: false, error: `« ${def.label} » : date invalide (AAAA-MM-JJ).` };
      return { ok: true, value: v };
    }
    case "select": {
      if (typeof raw !== "string") return { ok: false, error: `« ${def.label} » : valeur de liste attendue.` };
      const v = raw.trim();
      if (!v) return { ok: true, value: undefined };
      if (def.options.includes(v) || v === previous) return { ok: true, value: v };
      return { ok: false, error: `« ${def.label} » : « ${v.slice(0, 60)} » ne fait pas partie des valeurs proposées.` };
    }
    case "yesno":
      if (typeof raw !== "boolean") return { ok: false, error: `« ${def.label} » : oui ou non attendu.` };
      return { ok: true, value: raw };
  }
}

/**
 * Applique une saisie aux valeurs existantes d'une fiche. Seuls les champs présents dans la
 * saisie sont modifiés : les champs absents, comme les valeurs des champs supprimés
 * (masquées), sont conservés ; les identifiants inconnus de la saisie sont ignorés ; une
 * valeur vide retire le champ. Renvoie `undefined` quand la fiche n'a plus aucune valeur.
 */
export function applyCustomInput(
  defs: CustomFieldDef[],
  current: CustomValues | undefined,
  input: Record<string, unknown> | undefined,
): { values: CustomValues | undefined; errors: { fieldId: string; message: string }[] } {
  const values: CustomValues = { ...(current ?? {}) };
  const errors: { fieldId: string; message: string }[] = [];
  if (input) {
    for (const def of defs) {
      if (!Object.prototype.hasOwnProperty.call(input, def.id)) continue;
      const res = cleanCustomValue(def, input[def.id], current?.[def.id]);
      if (!res.ok) errors.push({ fieldId: def.id, message: res.error });
      else if (res.value === undefined) delete values[def.id];
      else values[def.id] = res.value;
    }
  }
  return { values: Object.keys(values).length ? values : undefined, errors };
}

/** Valeur affichable d'un champ (chaîne vide si absente). */
export function formatCustomValue(def: CustomFieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (def.type) {
    case "yesno":
      return value === true ? "Oui" : value === false ? "Non" : String(value);
    case "number":
      return typeof value === "number" ? value.toLocaleString("fr-FR", { maximumFractionDigits: 6 }) : String(value);
    case "date":
      if (typeof value === "string" && isIsoDate(value)) {
        const [y, m, d] = value.split("-");
        return `${d}/${m}/${y}`;
      }
      return String(value);
    default:
      return String(value);
  }
}

/** Texte recherchable d'une fiche : valeurs des champs texte et liste définis. */
export function customSearchText(defs: CustomFieldDef[], values: CustomValues | undefined): string {
  if (!values) return "";
  return defs
    .filter((d) => d.type === "text" || d.type === "select")
    .map((d) => values[d.id])
    .filter((v): v is string => typeof v === "string" && !!v)
    .join(" ");
}

/** Retire la clé `custom` quand la fiche n'a aucune valeur (document stable). */
export function withCustom<T extends { custom?: CustomValues }>(record: T, custom: CustomValues | undefined): T {
  const next = { ...record };
  if (custom) next.custom = custom;
  else delete next.custom;
  return next;
}

/**
 * Convertit une cellule d'import (texte, nombre, booléen ou date) en valeur du champ.
 * Accepte « Oui / Non / Vrai / Faux / 1 / 0 » et les dates JJ/MM/AAAA.
 */
export function importCustomValue(def: CustomFieldDef, cell: unknown): CleanResult {
  if (cell === null || cell === undefined) return { ok: true, value: undefined };
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return { ok: false, error: `« ${def.label} » : date invalide.` };
    return importCustomValue(def, cell.toISOString().slice(0, 10));
  }
  if (def.type === "yesno") {
    if (typeof cell === "boolean") return { ok: true, value: cell };
    const s = String(cell).trim().toLowerCase();
    if (!s) return { ok: true, value: undefined };
    if (["oui", "o", "vrai", "true", "1", "yes", "x"].includes(s)) return { ok: true, value: true };
    if (["non", "n", "faux", "false", "0", "no"].includes(s)) return { ok: true, value: false };
    return { ok: false, error: `« ${def.label} » : « ${String(cell).slice(0, 40)} » n'est ni oui ni non.` };
  }
  if (def.type === "number") return cleanCustomValue(def, typeof cell === "number" ? cell : String(cell));
  if (def.type === "date") {
    const s = String(cell).trim();
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return cleanCustomValue(def, fr ? `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}` : s);
  }
  if (def.type === "select") {
    const s = String(cell).trim();
    // Tolère la casse et les accents de la saisie dans un tableur.
    const match = def.options.find((o) => o.localeCompare(s, "fr", { sensitivity: "base" }) === 0);
    return cleanCustomValue(def, match ?? s);
  }
  return cleanCustomValue(def, typeof cell === "string" ? cell : String(cell));
}
