import type { Department, ModuleKey, OpportunityStage, Priority, RelationType, Role } from "@/lib/domain/types";
import { DEFAULT_STAGES } from "@/lib/calculations/pipeline";
import { MODULES } from "@/lib/domain/modules";

/**
 * Onglets des modèles Excel de configuration (« Configuration-CRM.xlsx ») : une seule
 * définition sert à générer les modèles vides (scripts/generate-templates.ts) et à lire
 * les fichiers complétés (parse.ts). Les en-têtes sont reconnus sans tenir compte des
 * majuscules, des accents, de l'astérisque « obligatoire » ni des précisions entre parenthèses.
 */

export type SheetKey = "company" | "team" | "pipeline" | "sources" | "rules" | "modules" | "companies" | "contacts" | "opportunities";

export interface ColumnDef {
  key: string;
  header: string;
  required?: boolean;
  /** Autres intitulés acceptés. */
  aliases?: string[];
  /** Valeurs proposées (liste déroulante du modèle). */
  choices?: string[];
  /** Largeur indicative de la colonne dans le modèle. */
  width?: number;
  help?: string;
}

export interface SheetDef {
  key: SheetKey;
  name: string;
  aliases?: string[];
  /** `table` : une ligne par élément ; `fields` : une ligne par réglage (Champ / Valeur). */
  layout: "table" | "fields";
  description: string;
  columns: ColumnDef[];
  /** Lignes préremplies dans le modèle vide. */
  prefill?: string[][];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[*«»"'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Forme normalisée d'un intitulé (en-tête, nom d'onglet, valeur de liste). */
export const normalizeLabel = norm;

/* ----------------------------- Vocabulaire ----------------------------- */

export const RELATION_LABELS: [RelationType, string, ...string[]][] = [
  ["prospect", "Prospect"],
  ["customer", "Client actif", "Client", "Customer"],
  ["former", "Ancien client"],
  ["partner", "Partenaire"],
  ["archived", "Archivé"],
];

export const PRIORITY_LABELS: [Priority, string, ...string[]][] = [
  ["low", "Basse", "Faible"],
  ["normal", "Normale", "Moyenne"],
  ["high", "Haute", "Élevée"],
  ["critical", "Critique", "Urgente"],
];

export const DEPARTMENT_LABELS: [Department, string, ...string[]][] = [
  ["direction", "Direction"],
  ["sales", "Commercial", "Ventes", "Vente"],
  ["marketing", "Marketing"],
  ["finance", "Finance", "Comptabilité"],
  ["support", "Support", "Service client"],
  ["operations", "Opérations", "Production"],
  ["development", "Développement", "Technique", "Informatique"],
];

export type AccessRole = Extract<Role, "dirigeant" | "commercial" | "collaborateur">;
export const ACCESS_ROLE_LABELS: [AccessRole, string, ...string[]][] = [
  ["dirigeant", "Directeur commercial", "Directrice commerciale", "Dirigeant", "Administrateur"],
  ["commercial", "Commercial", "Commerciale"],
  ["collaborateur", "Collaborateur", "Collaboratrice"],
];

export const WEEKDAY_LABELS: [number, string, ...string[]][] = [
  [1, "Lundi", "Lun"],
  [2, "Mardi", "Mar"],
  [3, "Mercredi", "Mer"],
  [4, "Jeudi", "Jeu"],
  [5, "Vendredi", "Ven"],
  [6, "Samedi", "Sam"],
  [0, "Dimanche", "Dim"],
];

export const YES_NO = ["Oui", "Non"];

/** Modules activables par fichier (la gamification a son propre réglage). */
export const MODULE_ROWS: { key: ModuleKey | "gamification"; label: string }[] = [...MODULES.map((m) => ({ key: m.key, label: m.label })), { key: "gamification", label: "Gamification" }];

/** Libellé → valeur, insensible aux accents et à la casse. */
export function lookup<T>(table: [T, string, ...string[]][], value: string): T | undefined {
  const n = norm(value);
  return table.find(([, ...labels]) => labels.some((l) => norm(l) === n))?.[0];
}

const labels = <T>(table: [T, string, ...string[]][]) => table.map(([, l]) => l);

/* ----------------------------- Onglets ----------------------------- */

export const COMPANY_FIELDS: ColumnDef[] = [
  { key: "name", header: "Nom commercial", required: true, help: "Nom affiché dans l'application" },
  { key: "legalName", header: "Raison sociale" },
  { key: "sector", header: "Secteur d'activité", aliases: ["Secteur"] },
  { key: "country", header: "Pays" },
  { key: "address", header: "Adresse" },
  { key: "email", header: "E-mail de contact", aliases: ["E-mail", "Email"] },
  { key: "phone", header: "Téléphone" },
  { key: "timezone", header: "Fuseau horaire", help: "Europe/Paris par défaut" },
  { key: "color", header: "Couleur principale", aliases: ["Couleur"], help: "Code #RRGGBB, ex. #0A7F5A" },
];

export const RULE_FIELDS: ColumnDef[] = [
  { key: "inactivityDays", header: "Contact inactif après (jours)", help: "45 par défaut" },
  { key: "proposalPendingDays", header: "Relance d'une proposition après (jours)", aliases: ["Proposition sans réponse après"], help: "10 par défaut" },
  { key: "newProspectDays", header: "Prospect nouveau pendant (jours)", help: "7 par défaut" },
  { key: "workingDays", header: "Jours travaillés", help: "Ex. : lundi, mardi, mercredi, jeudi, vendredi" },
];

const OWNER: ColumnDef = { key: "owner", header: "Responsable (e-mail)", aliases: ["Responsable", "Commercial"], width: 28, help: "E-mail d'un membre de l'équipe" };

export const SHEETS: SheetDef[] = [
  {
    key: "company",
    name: "Entreprise",
    aliases: ["Société", "Identité"],
    layout: "fields",
    description: "Une ligne par information. Joignez le logo à part (image PNG, SVG, JPEG ou WebP, 300 Ko maximum) : il suffit de le déposer avec ce fichier.",
    columns: COMPANY_FIELDS,
  },
  {
    key: "team",
    name: "Équipe",
    aliases: ["Collaborateurs", "Utilisateurs"],
    layout: "table",
    description: "Une ligne par personne qui utilisera le CRM. L'e-mail sert d'identifiant de connexion. Rôle : Directeur commercial (voit tout), Commercial (son portefeuille), Collaborateur.",
    columns: [
      { key: "firstName", header: "Prénom", required: true, width: 16 },
      { key: "lastName", header: "Nom", required: true, width: 18 },
      { key: "email", header: "E-mail", required: true, aliases: ["Email", "Courriel", "E-mail professionnel"], width: 30 },
      { key: "jobTitle", header: "Fonction", aliases: ["Poste"], width: 24 },
      { key: "department", header: "Service", choices: labels(DEPARTMENT_LABELS), width: 16 },
      { key: "role", header: "Rôle", choices: labels(ACCESS_ROLE_LABELS), width: 20 },
      { key: "hireDate", header: "Date d'arrivée", aliases: ["Date d'entrée"], width: 14 },
      { key: "monthlyCost", header: "Coût mensuel (€)", aliases: ["Coût mensuel"], width: 14, help: "Facultatif, visible du seul directeur commercial" },
    ],
  },
  {
    key: "pipeline",
    name: "Pipeline",
    aliases: ["Étapes", "Cycle de vente"],
    layout: "table",
    description: "Renommez les étapes et fixez la probabilité de signature proposée par défaut. Laissez une case vide pour garder la valeur par défaut. Gagné et Perdu restent à 100 % et 0 %.",
    columns: [
      { key: "stage", header: "Étape", required: true, width: 26, help: "Ne pas modifier cette colonne" },
      { key: "label", header: "Votre libellé", aliases: ["Libellé"], width: 30 },
      { key: "probability", header: "Probabilité (%)", aliases: ["Probabilité"], width: 16 },
    ],
    prefill: DEFAULT_STAGES.map((s) => [s.label, "", String(s.defaultProbability)]),
  },
  {
    key: "sources",
    name: "Sources",
    aliases: ["Sources de contacts", "Origine des contacts"],
    layout: "table",
    description: "Une source par ligne. Cette liste remplace celle proposée par défaut.",
    columns: [{ key: "source", header: "Source", required: true, width: 32 }],
    prefill: [["Site web"], ["Recommandation"], ["LinkedIn"], ["Salon"], ["Appel entrant"], ["Partenaire"], ["Client existant"], ["Campagne e-mail"], ["Autre"]],
  },
  {
    key: "rules",
    name: "Règles de suivi",
    aliases: ["Règles", "Relances"],
    layout: "fields",
    description: "Délais utilisés pour signaler les contacts à relancer. Laissez vide pour garder la valeur par défaut.",
    columns: RULE_FIELDS,
  },
  {
    key: "modules",
    name: "Modules",
    layout: "table",
    description: "Oui pour afficher le module, Non pour le masquer. Le CRM (pipeline, contacts, entreprises, missions, calendrier, activités, statistiques) est toujours inclus.",
    columns: [
      { key: "module", header: "Module", required: true, width: 32 },
      { key: "enabled", header: "Activé", aliases: ["Actif"], choices: YES_NO, width: 12 },
    ],
    prefill: MODULE_ROWS.map((m) => [m.label, "Oui"]),
  },
  {
    key: "companies",
    name: "Entreprises clientes",
    aliases: ["Entreprises", "Clients", "Comptes"],
    layout: "table",
    description: "Vos entreprises clientes et prospects. Une entreprise existante (même nom) est mise à jour ; les cases vides ne modifient rien.",
    columns: [
      { key: "name", header: "Nom", required: true, aliases: ["Entreprise", "Raison sociale"], width: 28 },
      { key: "relation", header: "Relation", aliases: ["Statut"], choices: labels(RELATION_LABELS), width: 16 },
      { key: "sector", header: "Secteur", width: 20 },
      { key: "size", header: "Taille", aliases: ["Effectif"], width: 12 },
      { key: "city", header: "Ville", width: 16 },
      { key: "country", header: "Pays", width: 12 },
      { key: "website", header: "Site web", aliases: ["Site"], width: 26 },
      OWNER,
      { key: "source", header: "Source", width: 18 },
      { key: "notes", header: "Notes", aliases: ["Commentaires"], width: 30 },
    ],
  },
  {
    key: "contacts",
    name: "Contacts",
    layout: "table",
    description: "Vos interlocuteurs. L'entreprise est créée si elle n'existe pas. Un contact existant (même e-mail) est mis à jour.",
    columns: [
      { key: "firstName", header: "Prénom", required: true, width: 16 },
      { key: "lastName", header: "Nom", required: true, width: 18 },
      { key: "company", header: "Entreprise", aliases: ["Société"], width: 26 },
      { key: "jobTitle", header: "Fonction", aliases: ["Poste"], width: 22 },
      { key: "email", header: "E-mail", aliases: ["Email", "Courriel"], width: 28 },
      { key: "phone", header: "Téléphone", aliases: ["Tél", "Mobile"], width: 16 },
      { key: "relation", header: "Relation", aliases: ["Statut"], choices: labels(RELATION_LABELS), width: 16 },
      { key: "priority", header: "Priorité", choices: labels(PRIORITY_LABELS), width: 12 },
      OWNER,
      { key: "source", header: "Source", width: 18 },
      { key: "notes", header: "Notes", aliases: ["Commentaires"], width: 30 },
    ],
  },
  {
    key: "opportunities",
    name: "Opportunités",
    aliases: ["Affaires", "Pipeline en cours", "Deals"],
    layout: "table",
    description: "Vos affaires en cours. L'entreprise est créée si elle n'existe pas. Étape : libellé par défaut ou votre libellé (onglet Pipeline).",
    columns: [
      { key: "name", header: "Nom", required: true, aliases: ["Opportunité", "Affaire"], width: 28 },
      { key: "company", header: "Entreprise", aliases: ["Société"], width: 24 },
      { key: "contact", header: "Contact (e-mail)", aliases: ["Contact"], width: 26 },
      { key: "amount", header: "Montant HT (€)", aliases: ["Montant"], width: 14 },
      { key: "stage", header: "Étape", choices: DEFAULT_STAGES.map((s) => s.label), width: 22 },
      { key: "probability", header: "Probabilité (%)", aliases: ["Probabilité"], width: 14 },
      { key: "closeDate", header: "Clôture prévue", aliases: ["Date de clôture", "Date de signature prévue"], width: 14 },
      OWNER,
      { key: "source", header: "Source", width: 18 },
      { key: "notes", header: "Notes", aliases: ["Commentaires"], width: 30 },
    ],
  },
];

export function sheetDef(key: SheetKey): SheetDef {
  return SHEETS.find((s) => s.key === key)!;
}

/** Onglet correspondant à un nom (« Équipe », « equipe », « Collaborateurs »…). */
export function sheetByName(name: string): SheetDef | undefined {
  const n = norm(name);
  return SHEETS.find((s) => [s.name, ...(s.aliases ?? [])].some((a) => norm(a) === n));
}

/** Colonne correspondant à un en-tête. */
export function columnFor(def: SheetDef, header: string): ColumnDef | undefined {
  const n = norm(header);
  if (!n) return undefined;
  return def.columns.find((c) => [c.header, ...(c.aliases ?? [])].some((a) => norm(a) === n));
}

/** Étape du pipeline correspondant à un libellé (par défaut, personnalisé ou identifiant). */
export function stageFor(value: string, custom?: Partial<Record<OpportunityStage, { label: string }>>): OpportunityStage | undefined {
  const n = norm(value);
  return (
    DEFAULT_STAGES.find((s) => norm(s.label) === n || norm(s.short) === n || s.id === n)?.id ??
    (custom ? (Object.entries(custom).find(([, v]) => v && norm(v.label) === n)?.[0] as OpportunityStage | undefined) : undefined)
  );
}
