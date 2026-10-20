import type { Cents, Department, ModuleKey, OpportunityStage, Priority, RelationType } from "@/lib/domain/types";
import {
  ACCESS_ROLE_LABELS,
  DEPARTMENT_LABELS,
  MODULE_ROWS,
  PRIORITY_LABELS,
  RELATION_LABELS,
  SHEETS,
  WEEKDAY_LABELS,
  columnFor,
  lookup,
  normalizeLabel,
  sheetByName,
  stageFor,
  type AccessRole,
  type SheetDef,
  type SheetKey,
} from "./sheets";

/**
 * Lecture des fichiers de configuration complétés par le client (Excel ou CSV) : chaque
 * onglet reconnu devient une partie de `ImportInput`, appliquée ensuite par la commande
 * `importWorkspace`. Fonctions pures : aucun accès au navigateur ni au stockage.
 */

export type Cell = string | number | boolean | Date | null | undefined;

export interface RawSheet {
  file: string;
  sheet: string;
  rows: Cell[][];
}

export interface ImportIssue {
  level: "error" | "warning";
  file: string;
  sheet: string;
  /** Numéro de ligne dans le fichier (1 = première ligne). */
  line?: number;
  message: string;
}

type Line = { line: number };
export type TeamRow = Line & { firstName: string; lastName: string; email: string; jobTitle?: string; department?: Department; role?: AccessRole; hireDate?: string; monthlyCost?: Cents };
export type CompanyRow = Line & {
  name: string;
  relation?: RelationType;
  sector?: string;
  size?: string;
  city?: string;
  country?: string;
  website?: string;
  owner?: string;
  source?: string;
  notes?: string;
};
export type ContactRow = Line & {
  firstName: string;
  lastName: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  relation?: RelationType;
  priority?: Priority;
  owner?: string;
  source?: string;
  notes?: string;
};
export type OpportunityRow = Line & {
  name: string;
  company?: string;
  contact?: string;
  amount?: Cents;
  /** Libellé de l'étape (par défaut ou personnalisé), résolu à l'import selon le pipeline de l'espace. */
  stage?: string;
  probability?: number;
  closeDate?: string;
  owner?: string;
  source?: string;
  notes?: string;
};

/** Configuration et données à importer (entrée de la commande `importWorkspace`). */
export interface ImportInput {
  company?: { name?: string; legalName?: string; sector?: string; country?: string; address?: string; email?: string; phone?: string; timezone?: string };
  branding?: { color?: string; logo?: string };
  rules?: { inactivityDays?: number; proposalPendingDays?: number; newProspectDays?: number; workingDays?: number[] };
  stages?: Partial<Record<OpportunityStage, { label?: string; probability?: number }>>;
  sources?: string[];
  modules?: Partial<Record<ModuleKey | "gamification", boolean>>;
  team?: TeamRow[];
  companies?: CompanyRow[];
  contacts?: ContactRow[];
  opportunities?: OpportunityRow[];
}

export interface ParseResult {
  input: ImportInput;
  issues: ImportIssue[];
  /** Onglets lus et ce qu'ils contiennent (pour l'aperçu). */
  recognized: { file: string; sheet: string; key: SheetKey; label: string; rows: number }[];
}

/* ----------------------------- Valeurs ----------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** Texte d'une cellule (vide → `undefined`). */
export function text(cell: Cell): string | undefined {
  if (cell === null || cell === undefined) return undefined;
  if (cell instanceof Date) return isNaN(cell.getTime()) ? undefined : `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
  if (typeof cell === "boolean") return cell ? "Oui" : "Non";
  const s = String(cell).replace(/ /g, " ").trim();
  return s ? s : undefined;
}

/** Nombre : « 12 000,50 € », « 35 % », 12000.5. */
export function number(cell: Cell): number | undefined {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : undefined;
  const s = text(cell);
  if (!s) return undefined;
  const cleaned = s
    .replace(/[\s€%]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/** Date (cellule date, numéro de série Excel, « 31/12/2026 », « 2026-12-31 ») au format ISO. */
export function date(cell: Cell): string | undefined {
  if (cell instanceof Date) return text(cell);
  if (typeof cell === "number" && cell > 20000 && cell < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000);
    return text(d);
  }
  const s = text(cell);
  if (!s) return undefined;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) return valid(+m[3]! < 100 ? 2000 + +m[3]! : +m[3]!, +m[2]!, +m[1]!);
  return "invalid";
}

function valid(y: number, mo: number, d: number): string {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : "invalid";
}

/** Oui / Non (x, vrai, 1…). */
export function yesNo(cell: Cell): boolean | undefined {
  if (typeof cell === "boolean") return cell;
  const s = text(cell);
  if (!s) return undefined;
  const n = normalizeLabel(s);
  if (["oui", "o", "yes", "y", "x", "vrai", "true", "1", "actif", "active"].includes(n)) return true;
  if (["non", "n", "no", "faux", "false", "0", "inactif"].includes(n)) return false;
  return undefined;
}

/** Jours travaillés : « lundi, mardi… », « lun-ven », « lundi au vendredi ». */
export function weekdays(cell: Cell): number[] | undefined {
  const s = text(cell);
  if (!s) return undefined;
  const range = /^([a-zé]+)\s*(?:-|à|au|a)\s*([a-zé]+)$/i.exec(s.trim());
  if (range) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const a = lookup(WEEKDAY_LABELS, range[1]!);
    const b = lookup(WEEKDAY_LABELS, range[2]!);
    if (a !== undefined && b !== undefined) {
      const i = order.indexOf(a);
      const j = order.indexOf(b);
      if (i <= j) return order.slice(i, j + 1);
    }
  }
  const days = s
    .split(/[,;/\s]+/)
    .filter(Boolean)
    .map((d) => lookup(WEEKDAY_LABELS, d));
  if (!days.length || days.some((d) => d === undefined)) return [];
  return [...new Set(days as number[])];
}

/* ----------------------------- CSV ----------------------------- */

/** CSV (séparateur « ; », « , » ou tabulation détecté sur la première ligne ; guillemets gérés). */
export function parseCsv(content: string): string[][] {
  const src = content.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ----------------------------- Onglets ----------------------------- */

const IGNORED = ["lisez moi", "lisezmoi", "mode d emploi", "instructions", "aide", "notice"];

/** Onglet reconnu par son nom, sinon par ses en-têtes (CSV, onglet renommé). */
function identify(sheet: RawSheet): { def: SheetDef; headerRow: number } | null {
  const byName = sheetByName(sheet.sheet) ?? sheetByName(sheet.file.replace(/\.[a-z]+$/i, ""));
  if (byName) {
    if (byName.layout === "fields") return { def: byName, headerRow: -1 };
    const headerRow = findHeader(byName, sheet.rows);
    return headerRow >= 0 ? { def: byName, headerRow } : { def: byName, headerRow: -2 };
  }
  let best: { def: SheetDef; headerRow: number; score: number } | null = null;
  for (const def of SHEETS.filter((s) => s.layout === "table")) {
    const headerRow = findHeader(def, sheet.rows);
    if (headerRow < 0) continue;
    const score = (sheet.rows[headerRow] ?? []).filter((h) => columnFor(def, text(h) ?? "")).length;
    if (!best || score > best.score) best = { def, headerRow, score };
  }
  return best;
}

/** Ligne d'en-têtes (parmi les 5 premières) contenant toutes les colonnes obligatoires. */
function findHeader(def: SheetDef, rows: Cell[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const found = new Set((rows[i] ?? []).map((h) => columnFor(def, text(h) ?? "")?.key).filter(Boolean));
    if (def.columns.filter((c) => c.required).every((c) => found.has(c.key))) return i;
  }
  return -1;
}

const isEmpty = (row: Cell[]) => row.every((c) => text(c) === undefined);

export function parseWorkbooks(sheets: RawSheet[], opts: { logo?: string } = {}): ParseResult {
  const input: ImportInput = {};
  const issues: ImportIssue[] = [];
  const recognized: ParseResult["recognized"] = [];
  if (opts.logo) input.branding = { ...input.branding, logo: opts.logo };

  for (const sheet of sheets) {
    const where = { file: sheet.file, sheet: sheet.sheet };
    if (IGNORED.includes(normalizeLabel(sheet.sheet)) || sheet.rows.every(isEmpty)) continue;
    const found = identify(sheet);
    if (!found) {
      issues.push({ ...where, level: "warning", message: "Onglet non reconnu : ignoré (vérifiez son nom ou ses en-têtes de colonnes)." });
      continue;
    }
    const { def, headerRow } = found;
    if (headerRow === -2) {
      const required = def.columns.filter((c) => c.required).map((c) => `« ${c.header} »`);
      issues.push({ ...where, level: "error", message: `En-têtes introuvables : la première ligne doit contenir ${required.join(", ")}.` });
      continue;
    }
    const err = (line: number, message: string) => issues.push({ ...where, line, level: "error", message });
    const warn = (line: number, message: string) => issues.push({ ...where, line, level: "warning", message });

    if (def.layout === "fields") {
      const values: Record<string, { cell: Cell; line: number }> = {};
      sheet.rows.forEach((row, i) => {
        const label = text(row[0]);
        if (!label) return;
        const col = columnFor(def, label);
        if (!col) {
          if (!["champ", "information", "reglage", "parametre"].includes(normalizeLabel(label))) warn(i + 1, `Ligne « ${label} » non reconnue : ignorée.`);
          return;
        }
        values[col.key] = { cell: row[1] ?? null, line: i + 1 };
      });
      if (def.key === "company") readCompany(values, input, err);
      else readRules(values, input, err);
      recognized.push({ ...where, key: def.key, label: def.name, rows: Object.values(values).filter((v) => text(v.cell) !== undefined).length });
      continue;
    }

    const header = sheet.rows[headerRow] ?? [];
    const index = new Map<string, number>();
    header.forEach((h, i) => {
      const col = columnFor(def, text(h) ?? "");
      if (col && !index.has(col.key)) index.set(col.key, i);
    });
    const unknown = header.map((h) => text(h)).filter((h): h is string => !!h && !columnFor(def, h));
    if (unknown.length) issues.push({ ...where, line: headerRow + 1, level: "warning", message: `Colonnes ignorées : ${unknown.map((h) => `« ${h} »`).join(", ")}.` });

    let count = 0;
    for (let i = headerRow + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i] ?? [];
      if (isEmpty(row)) continue;
      const cell = (key: string) => (index.has(key) ? row[index.get(key)!] : undefined);
      const line = i + 1;
      const before = issues.length;
      readRow(def.key, cell, line, input, err, warn);
      if (issues.slice(before).every((x) => x.level !== "error")) count++;
    }
    recognized.push({ ...where, key: def.key, label: def.name, rows: count });
  }
  return { input, issues, recognized };
}

type Report = (line: number, message: string) => void;

function readCompany(values: Record<string, { cell: Cell; line: number }>, input: ImportInput, err: Report) {
  const company: NonNullable<ImportInput["company"]> = {};
  for (const key of ["name", "legalName", "sector", "country", "address", "email", "phone", "timezone"] as const) {
    const v = values[key] ? text(values[key].cell) : undefined;
    if (v !== undefined) company[key] = v;
  }
  if (company.email && !EMAIL.test(company.email)) {
    err(values.email!.line, `E-mail invalide : « ${company.email} ».`);
    delete company.email;
  }
  if (Object.keys(company).length) input.company = { ...input.company, ...company };
  const color = values.color ? text(values.color.cell) : undefined;
  if (color) {
    const hex = color.startsWith("#") ? color : `#${color}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) input.branding = { ...input.branding, color: hex.toUpperCase() };
    else err(values.color!.line, `Couleur invalide : « ${color} » (format attendu #RRGGBB, ex. #0A7F5A).`);
  }
}

function readRules(values: Record<string, { cell: Cell; line: number }>, input: ImportInput, err: Report) {
  const rules: NonNullable<ImportInput["rules"]> = {};
  const limits = { inactivityDays: [1, 365], proposalPendingDays: [1, 120], newProspectDays: [1, 60] } as const;
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (!values[key]) continue;
    const n = number(values[key].cell);
    if (n === undefined) continue;
    const [min, max] = limits[key];
    if (!Number.isInteger(n) || n < min || n > max) err(values[key].line, `Nombre de jours invalide (entier entre ${min} et ${max} attendu).`);
    else rules[key] = n;
  }
  if (values.workingDays) {
    const days = weekdays(values.workingDays.cell);
    if (days && !days.length) err(values.workingDays.line, "Jours travaillés non reconnus (ex. : lundi, mardi, mercredi, jeudi, vendredi).");
    else if (days) rules.workingDays = days;
  }
  if (Object.keys(rules).length) input.rules = { ...input.rules, ...rules };
}

function readRow(key: SheetKey, cell: (k: string) => Cell, line: number, input: ImportInput, err: Report, warn: Report) {
  const t = (k: string) => text(cell(k));
  const pick = <T>(k: string, table: [T, string, ...string[]][], what: string): T | undefined => {
    const v = t(k);
    if (!v) return undefined;
    const found = lookup(table, v);
    if (found === undefined) warn(line, `${what} « ${v} » inconnu(e) : valeur par défaut utilisée (${table.map(([, l]) => l).join(", ")}).`);
    return found;
  };
  const email = (k: string, required: boolean): string | undefined | null => {
    const v = t(k)?.toLowerCase();
    if (!v) {
      if (required) err(line, "E-mail obligatoire.");
      return required ? null : undefined;
    }
    if (!EMAIL.test(v)) {
      err(line, `E-mail invalide : « ${v} ».`);
      return null;
    }
    return v;
  };
  const owner = () => {
    const v = t("owner")?.toLowerCase();
    if (v && !EMAIL.test(v)) {
      warn(line, `Responsable « ${v} » : indiquez son e-mail ; laissé vide.`);
      return undefined;
    }
    return v;
  };
  const requireAll = (...keys: [string, string][]) => {
    const missing = keys.filter(([k]) => !t(k)).map(([, l]) => l);
    if (missing.length) err(line, `Obligatoire : ${missing.join(", ")}.`);
    return !missing.length;
  };
  const euros = (k: string): Cents | undefined => {
    const n = number(cell(k));
    if (n === undefined) return undefined;
    if (Number.isNaN(n) || n < 0) {
      warn(line, `Montant « ${t(k)} » invalide : ignoré.`);
      return undefined;
    }
    return Math.round(n * 100);
  };
  const percent = (k: string): number | undefined => {
    const n = number(cell(k));
    if (n === undefined) return undefined;
    if (Number.isNaN(n) || n < 0 || n > 100) {
      warn(line, `Probabilité « ${t(k)} » invalide (0 à 100) : ignorée.`);
      return undefined;
    }
    return Math.round(n);
  };
  const day = (k: string, what: string): string | undefined => {
    const d = date(cell(k));
    if (d === "invalid") {
      warn(line, `${what} « ${t(k)} » invalide (format JJ/MM/AAAA) : ignorée.`);
      return undefined;
    }
    return d;
  };
  const common = () => ({ source: t("source"), notes: t("notes") });

  switch (key) {
    case "team": {
      if (!requireAll(["firstName", "Prénom"], ["lastName", "Nom"])) return;
      const mail = email("email", true);
      if (!mail) return;
      (input.team ??= []).push({
        line,
        firstName: t("firstName")!,
        lastName: t("lastName")!,
        email: mail,
        jobTitle: t("jobTitle"),
        department: pick("department", DEPARTMENT_LABELS, "Service"),
        role: pick("role", ACCESS_ROLE_LABELS, "Rôle"),
        hireDate: day("hireDate", "Date d'arrivée"),
        monthlyCost: euros("monthlyCost"),
      });
      return;
    }
    case "pipeline": {
      const label = t("stage");
      if (!label) return;
      const stage = stageFor(label);
      if (!stage) {
        err(line, `Étape « ${label} » inconnue : gardez les libellés de la colonne Étape du modèle.`);
        return;
      }
      const custom = t("label");
      const probability = percent("probability");
      if (custom === undefined && probability === undefined) return;
      input.stages = { ...input.stages, [stage]: { label: custom, probability } };
      return;
    }
    case "sources": {
      const s = t("source");
      if (s) (input.sources ??= []).push(s.slice(0, 60));
      return;
    }
    case "modules": {
      const label = t("module");
      if (!label) return;
      const mod = MODULE_ROWS.find((m) => normalizeLabel(m.label) === normalizeLabel(label));
      if (!mod) {
        warn(line, `Module « ${label} » inconnu : ignoré.`);
        return;
      }
      const on = yesNo(cell("enabled"));
      if (on === undefined) {
        if (t("enabled")) warn(line, `Valeur « ${t("enabled")} » : indiquez Oui ou Non.`);
        return;
      }
      input.modules = { ...input.modules, [mod.key]: on };
      return;
    }
    case "companies": {
      if (!requireAll(["name", "Nom"])) return;
      (input.companies ??= []).push({
        line,
        name: t("name")!,
        relation: pick("relation", RELATION_LABELS, "Relation"),
        sector: t("sector"),
        size: t("size")?.slice(0, 20),
        city: t("city"),
        country: t("country"),
        website: t("website"),
        owner: owner(),
        ...common(),
      });
      return;
    }
    case "contacts": {
      if (!requireAll(["firstName", "Prénom"], ["lastName", "Nom"])) return;
      const mail = email("email", false);
      if (mail === null) return;
      (input.contacts ??= []).push({
        line,
        firstName: t("firstName")!,
        lastName: t("lastName")!,
        company: t("company"),
        jobTitle: t("jobTitle"),
        email: mail,
        phone: t("phone"),
        relation: pick("relation", RELATION_LABELS, "Relation"),
        priority: pick("priority", PRIORITY_LABELS, "Priorité"),
        owner: owner(),
        ...common(),
      });
      return;
    }
    case "opportunities": {
      if (!requireAll(["name", "Nom"])) return;
      const contact = email("contact", false);
      if (contact === null) return;
      (input.opportunities ??= []).push({
        line,
        name: t("name")!,
        company: t("company"),
        contact,
        amount: euros("amount"),
        stage: t("stage"),
        probability: percent("probability"),
        closeDate: day("closeDate", "Date de clôture"),
        owner: owner(),
        ...common(),
      });
      return;
    }
    default:
      return;
  }
}
