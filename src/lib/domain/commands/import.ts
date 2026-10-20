import { z } from "zod";
import type { AppData, Client, Contact, CrmSettings, Department, Employee, ID, ModuleKey, OpportunityStage, Priority, RelationType } from "@/lib/domain/types";
import type { ImportInput } from "@/lib/import/parse";
import { stageFor } from "@/lib/import/sheets";
import { addDays } from "@/lib/calculations/dates";
import { newId } from "@/lib/domain/ids";
import { DomainError, assertCan, normalize, parse, type Command } from "./core";
import { createClient, createContact, createOpportunity, updateClient, updateContact } from "./crm";
import { createEmployee, updateEmployee } from "./operations";
import { updateBranding, updateCompanySettings, updateCrmSettings, updateGamificationSettings, updateModules } from "./settings";

/**
 * Import d'un espace à partir des fichiers de configuration complétés par le client
 * (voir `lib/import`). Chaque ligne passe par les commandes habituelles (mêmes contrôles
 * qu'une saisie à la main) ; une ligne refusée est signalée sans bloquer les autres.
 * Les entités existantes sont mises à jour (équipe : même e-mail ; entreprises : même nom ;
 * contacts : même e-mail, sinon même nom dans la même entreprise) et une case vide ne
 * modifie rien. Un import n'est pas une action commerciale : il ne rapporte pas d'XP.
 */

export interface ImportCounts {
  team: number;
  companies: number;
  contacts: number;
  opportunities: number;
}

export interface ImportReport {
  created: ImportCounts;
  updated: ImportCounts;
  /** Réglages appliqués (entreprise, identité visuelle, pipeline…). */
  settings: string[];
  errors: { sheet: string; line?: number; message: string }[];
  warnings: { sheet: string; line?: number; message: string }[];
}

const MAX_ROWS = 5000;
const str = (max: number) => z.string().max(max).optional();
const line = z.number().int().min(1);
const relation = z.enum(["prospect", "customer", "former", "partner", "archived"]).optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const cents = z.number().int().min(0).max(1e13).optional();

const inputSchema = z.object({
  company: z.object({ name: str(200), legalName: str(200), sector: str(200), country: str(100), address: str(300), email: str(200), phone: str(60), timezone: str(60) }).optional(),
  branding: z.object({ color: str(7), logo: z.string().max(500_000).optional() }).optional(),
  rules: z
    .object({
      inactivityDays: z.number().optional(),
      proposalPendingDays: z.number().optional(),
      newProspectDays: z.number().optional(),
      workingDays: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
  stages: z.record(z.object({ label: str(40), probability: z.number().int().min(0).max(100).optional() })).optional(),
  sources: z.array(z.string().max(60)).max(30).optional(),
  modules: z.record(z.boolean()).optional(),
  team: z
    .array(
      z.object({
        line,
        firstName: z.string().max(100),
        lastName: z.string().max(100),
        email: z.string().max(200),
        jobTitle: str(100),
        department: z.enum(["direction", "development", "sales", "marketing", "finance", "support", "operations"]).optional(),
        role: z.enum(["dirigeant", "commercial", "collaborateur"]).optional(),
        hireDate: isoDate,
        monthlyCost: cents,
      }),
    )
    .max(MAX_ROWS)
    .optional(),
  companies: z
    .array(
      z.object({
        line,
        name: z.string().max(200),
        relation,
        sector: str(100),
        size: str(20),
        city: str(100),
        country: str(80),
        website: str(200),
        owner: str(200),
        source: str(100),
        notes: str(5000),
      }),
    )
    .max(MAX_ROWS)
    .optional(),
  contacts: z
    .array(
      z.object({
        line,
        firstName: z.string().max(100),
        lastName: z.string().max(100),
        company: str(200),
        jobTitle: str(100),
        email: str(200),
        phone: str(40),
        relation,
        priority: z.enum(["low", "normal", "high", "critical"]).optional(),
        owner: str(200),
        source: str(100),
        notes: str(5000),
      }),
    )
    .max(MAX_ROWS)
    .optional(),
  opportunities: z
    .array(
      z.object({
        line,
        name: z.string().max(200),
        company: str(200),
        contact: str(200),
        amount: cents,
        stage: str(60),
        probability: z.number().int().min(0).max(100).optional(),
        closeDate: isoDate,
        owner: str(200),
        source: str(100),
        notes: str(5000),
      }),
    )
    .max(MAX_ROWS)
    .optional(),
});

const SHEET = {
  company: "Entreprise",
  rules: "Règles de suivi",
  pipeline: "Pipeline",
  sources: "Sources",
  modules: "Modules",
  team: "Équipe",
  companies: "Entreprises clientes",
  contacts: "Contacts",
  opportunities: "Opportunités",
};

/** Valeurs importées par-dessus les valeurs existantes : une case vide ne modifie rien. */
function merge<T extends object>(current: T, imported: Partial<T>): T {
  const out = { ...current };
  for (const [k, v] of Object.entries(imported)) if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  return out;
}

const zero = (): ImportCounts => ({ team: 0, companies: 0, contacts: 0, opportunities: 0 });

export const importWorkspace: Command<ImportInput, ImportReport> = (data, rawInput, ctx) => {
  assertCan(ctx, "settings.write");
  const input = parse(inputSchema, rawInput) as ImportInput;
  const report: ImportReport = { created: zero(), updated: zero(), settings: [], errors: [], warnings: [] };
  let next: AppData = data;
  /** Exécute une commande ; une erreur métier est rapportée sans interrompre l'import. */
  const attempt = <R>(sheet: string, lineNo: number | undefined, fn: (d: AppData) => { data: AppData; result: R }): R | undefined => {
    try {
      const out = fn(next);
      next = out.data;
      return out.result;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const detail = Object.values(error.fieldErrors).filter((m) => m && m !== "Doublon" && m !== "confirm");
      report.errors.push({ sheet, line: lineNo, message: detail.length ? `${error.message} (${detail.join(" ; ")})` : error.message });
      return undefined;
    }
  };
  const warn = (sheet: string, lineNo: number | undefined, message: string) => report.warnings.push({ sheet, line: lineNo, message });

  /* ---------- Réglages ---------- */
  if (input.company && Object.keys(input.company).length) {
    const company = input.company;
    if (attempt(SHEET.company, undefined, (d) => ({ data: updateCompanySettings(d, company, ctx).data, result: true }))) report.settings.push("Coordonnées de l'entreprise");
  }
  if (input.branding && (input.branding.color || input.branding.logo)) {
    const branding = input.branding;
    const done = attempt(SHEET.company, undefined, (d) => {
      const out = updateBranding(d, { ...(branding.color ? { color: branding.color } : {}), ...(branding.logo ? { logo: branding.logo } : {}) }, ctx);
      return { data: out.data, result: true };
    });
    if (done) report.settings.push(branding.logo ? "Identité visuelle (logo et couleur)" : "Couleur principale");
  }
  if (input.rules || input.stages || input.sources) {
    const crm: CrmSettings = { ...next.settings.crm, ...input.rules, stages: { ...next.settings.crm.stages } };
    for (const [stage, v] of Object.entries(input.stages ?? {}) as [OpportunityStage, { label?: string; probability?: number }][]) {
      if (!(stage in crm.stages)) continue;
      crm.stages[stage] = { label: v.label?.trim() || crm.stages[stage].label, probability: v.probability ?? crm.stages[stage].probability };
    }
    if (input.sources?.length) crm.sources = input.sources;
    const done = attempt(SHEET.pipeline, undefined, (d) => ({ data: updateCrmSettings(d, crm, ctx).data, result: true }));
    if (done) {
      if (input.stages) report.settings.push("Étapes du pipeline");
      if (input.sources?.length) report.settings.push("Sources de contacts");
      if (input.rules) report.settings.push("Règles de suivi");
    }
  }
  if (input.modules && Object.keys(input.modules).length) {
    const { gamification, ...modules } = input.modules;
    if (Object.keys(modules).length) attempt(SHEET.modules, undefined, (d) => ({ data: updateModules(d, modules as Partial<Record<ModuleKey, boolean>>, ctx).data, result: true }));
    if (gamification !== undefined) attempt(SHEET.modules, undefined, (d) => ({ data: updateGamificationSettings(d, { enabled: gamification }, ctx).data, result: true }));
    report.settings.push("Modules");
  }

  /* ---------- Équipe ---------- */
  for (const row of input.team ?? []) {
    const existing = next.employees.find((e) => e.email.toLowerCase() === row.email.toLowerCase());
    const values = {
      firstName: row.firstName,
      lastName: row.lastName,
      jobTitle: row.jobTitle,
      department: row.department,
      email: row.email,
      hireDate: row.hireDate,
      monthlyCost: row.monthlyCost,
    };
    let employee: Employee | undefined;
    if (existing) {
      const { id: _id, createdAt: _c, updatedAt: _u, accessRole: _r, ...current } = existing;
      void _id;
      void _c;
      void _u;
      void _r;
      employee = attempt(SHEET.team, row.line, (d) => updateEmployee(d, { id: existing.id, values: merge(current, values) }, ctx));
      if (employee) report.updated.team++;
    } else {
      const defaults = {
        jobTitle: row.role === "dirigeant" ? "Directeur commercial" : "Commercial",
        department: "sales" as Department,
        hireDate: ctx.today,
        status: "active" as const,
        monthlyCost: 0,
        skills: {},
      };
      employee = attempt(SHEET.team, row.line, (d) => createEmployee(d, merge(defaults, values) as Parameters<typeof createEmployee>[1], ctx));
      if (employee) report.created.team++;
    }
    if (employee && row.role) {
      const id = employee.id;
      next = { ...next, employees: next.employees.map((e) => (e.id === id ? { ...e, accessRole: row.role } : e)) };
    }
  }
  const ownerId = (sheet: string, lineNo: number, email?: string): ID | null | undefined => {
    if (!email) return undefined;
    const e = next.employees.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!e) warn(sheet, lineNo, `Responsable « ${email} » absent de l'équipe : laissé vide (ajoutez-le dans l'onglet Équipe).`);
    return e ? e.id : null;
  };

  /* ---------- Entreprises ---------- */
  const importedIds: string[] = [];
  const findCompany = (name: string) => next.clients.find((c) => normalize(c.name) === normalize(name));
  const clientValues = (c: Client) => ({
    name: c.name,
    sector: c.sector,
    status: c.status,
    relation: c.relation,
    size: c.size,
    city: c.city,
    country: c.country,
    website: c.website,
    ownerId: c.ownerId,
    source: c.source,
    satisfaction: c.satisfaction,
    notes: c.notes,
  });
  const newClient = (values: Partial<ReturnType<typeof clientValues>>) =>
    merge(
      {
        name: "",
        sector: "",
        status: "active" as const,
        relation: "prospect" as const,
        size: "",
        city: "",
        country: next.settings.company.country || "France",
        website: "",
        ownerId: null as ID | null,
        source: "",
        satisfaction: null as number | null,
        notes: "",
      },
      values,
    );

  for (const row of input.companies ?? []) {
    const owner = ownerId(SHEET.companies, row.line, row.owner);
    const values = {
      name: row.name,
      relation: row.relation,
      sector: row.sector,
      size: row.size,
      city: row.city,
      country: row.country,
      website: row.website,
      source: row.source,
      notes: row.notes,
      ...(owner !== undefined ? { ownerId: owner } : {}),
    };
    const existing = findCompany(row.name);
    if (existing) {
      if (attempt(SHEET.companies, row.line, (d) => updateClient(d, { id: existing.id, values: merge(clientValues(existing), values) }, ctx))) report.updated.companies++;
    } else {
      const c = attempt(SHEET.companies, row.line, (d) => createClient(d, newClient(values), ctx));
      if (c) {
        report.created.companies++;
        importedIds.push(c.id);
      }
    }
  }
  /** Entreprise citée dans un contact ou une opportunité : créée si elle n'existe pas. */
  const companyFor = (sheet: string, lineNo: number, name: string | undefined, relationHint?: Client["relation"], owner?: ID | null): ID | null => {
    if (!name) return null;
    const existing = findCompany(name);
    if (existing) return existing.id;
    const c = attempt(sheet, lineNo, (d) => createClient(d, newClient({ name, relation: relationHint, ...(owner ? { ownerId: owner } : {}) }), ctx));
    if (!c) return null;
    report.created.companies++;
    return c.id;
  };

  /* ---------- Contacts ---------- */
  const contactValues = (c: Contact) => ({
    clientId: c.clientId,
    firstName: c.firstName,
    lastName: c.lastName,
    jobTitle: c.jobTitle,
    email: c.email,
    phone: c.phone,
    relation: c.relation,
    ownerId: c.ownerId,
    source: c.source,
    priority: c.priority,
    isPrimary: c.isPrimary,
    notes: c.notes,
  });
  for (const row of input.contacts ?? []) {
    const owner = ownerId(SHEET.contacts, row.line, row.owner);
    const clientId = companyFor(SHEET.contacts, row.line, row.company, row.relation, owner ?? null);
    if (row.company && !clientId) continue;
    const values = {
      firstName: row.firstName,
      lastName: row.lastName,
      jobTitle: row.jobTitle,
      email: row.email,
      phone: row.phone,
      relation: row.relation,
      priority: row.priority,
      source: row.source,
      notes: row.notes,
      ...(clientId ? { clientId } : {}),
      ...(owner !== undefined ? { ownerId: owner } : {}),
    };
    const existing =
      (row.email && next.contacts.find((c) => c.email.toLowerCase() === row.email!.toLowerCase())) ||
      next.contacts.find((c) => normalize(c.firstName) === normalize(row.firstName) && normalize(c.lastName) === normalize(row.lastName) && c.clientId === (clientId ?? c.clientId));
    if (existing) {
      if (attempt(SHEET.contacts, row.line, (d) => updateContact(d, { id: existing.id, values: merge(contactValues(existing), values), confirmDuplicate: true }, ctx))) report.updated.contacts++;
    } else {
      const base = {
        clientId: null as ID | null,
        firstName: "",
        lastName: "",
        jobTitle: "",
        email: "",
        phone: "",
        relation: "prospect" as RelationType,
        ownerId: null as ID | null,
        source: "",
        priority: "normal" as Priority,
        isPrimary: false,
        notes: "",
      };
      const c = attempt(SHEET.contacts, row.line, (d) => createContact(d, { ...merge(base, values), confirmDuplicate: true }, ctx));
      if (c) {
        report.created.contacts++;
        importedIds.push(c.id);
      }
    }
  }

  /* ---------- Opportunités ---------- */
  for (const row of input.opportunities ?? []) {
    const owner = ownerId(SHEET.opportunities, row.line, row.owner);
    const contact = row.contact ? next.contacts.find((c) => c.email.toLowerCase() === row.contact!.toLowerCase()) : undefined;
    if (row.contact && !contact) warn(SHEET.opportunities, row.line, `Contact « ${row.contact} » introuvable : opportunité rattachée à l'entreprise seulement.`);
    const clientId = companyFor(SHEET.opportunities, row.line, row.company, "prospect", owner ?? null) ?? contact?.clientId ?? null;
    if (!clientId && !contact) {
      report.errors.push({ sheet: SHEET.opportunities, line: row.line, message: "Indiquez une entreprise ou l'e-mail d'un contact existant." });
      continue;
    }
    if (next.opportunities.some((o) => normalize(o.name) === normalize(row.name) && o.clientId === clientId)) {
      warn(SHEET.opportunities, row.line, `« ${row.name} » existe déjà pour cette entreprise : ignorée.`);
      continue;
    }
    let stage: OpportunityStage = "new";
    if (row.stage) {
      const found = stageFor(row.stage, next.settings.crm.stages);
      if (found) stage = found;
      else warn(SHEET.opportunities, row.line, `Étape « ${row.stage} » inconnue : « ${next.settings.crm.stages.new.label} » utilisée.`);
    }
    const o = attempt(SHEET.opportunities, row.line, (d) =>
      createOpportunity(
        d,
        {
          name: row.name,
          clientId,
          leadId: null,
          contactId: contact?.id ?? null,
          amount: row.amount ?? 0,
          probability: row.probability ?? next.settings.crm.stages[stage].probability,
          stage,
          expectedCloseDate: row.closeDate ?? addDays(ctx.today, 30),
          source: row.source ?? "",
          ownerId: owner ?? (ctx.user.employeeId || null),
          priority: "normal",
          nextAction: "",
          notes: row.notes ?? "",
        },
        ctx,
      ),
    );
    if (o) {
      report.created.opportunities++;
      importedIds.push(o.id);
    }
  }

  /* ---------- Journal et gamification ---------- */
  const total = (c: ImportCounts) => c.team + c.companies + c.contacts + c.opportunities;
  const summary = `Import de fichiers : ${total(report.created)} création(s), ${total(report.updated)} mise(s) à jour${report.settings.length ? `, réglages (${report.settings.join(", ")})` : ""}.`;
  // Les éléments importés ne rapportent pas d'XP (fiche complète, prospect qualifié, affaire gagnée).
  const retired = importedIds.flatMap((id) => [`contact-complete:${id}`, `prospect-qualified:${id}`, `opportunity-qualified:${id}`, `opportunity:${id}`]);
  next = {
    ...next,
    retiredXpKeys: [...new Set([...next.retiredXpKeys, ...retired])],
    activity: [...data.activity, { id: newId("act"), at: ctx.now, type: "client_updated", description: summary, ref: null }],
    auditLogs: [...data.auditLogs, { id: newId("aud"), at: ctx.now, actor: ctx.user.name, role: ctx.user.role, action: "workspace.import", ref: null, details: summary }],
  };
  const message = report.errors.length ? `${summary} ${report.errors.length} ligne(s) refusée(s).` : summary;
  return { data: next, result: report, message };
};
