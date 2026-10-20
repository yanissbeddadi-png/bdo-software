import { afterEach, describe, expect, it } from "vitest";
import { execute } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import { NOW, TODAY, ctx } from "@/test/fixtures";
import { createEmptyData } from "@/lib/database/empty";
import { defaultCrmSettings } from "@/lib/database/seed";
import { applyCrmVocabulary } from "@/lib/crm/vocabulary";
import { date, number, parseCsv, parseWorkbooks, weekdays, type RawSheet } from "./parse";

const empty = () => createEmptyData(TODAY, NOW, "Martin Conseil", { firstName: "Claire", lastName: "Martin", jobTitle: "Directrice commerciale", email: "claire@martin.test" }, "emp_owner");
const director = () => ({ ...ctx("dirigeant"), user: { ...ctx("dirigeant").user, employeeId: "emp_owner" } });

/** Classeur complété par le client, tel que lu dans le fichier Excel. */
const workbook = (): RawSheet[] => [
  { file: "Configuration.xlsx", sheet: "Lisez-moi", rows: [["Mode d'emploi"], ["Remplissez chaque onglet."]] },
  {
    file: "Configuration.xlsx",
    sheet: "Entreprise",
    rows: [
      ["Champ", "Valeur"],
      ["Nom commercial *", "Martin Conseil"],
      ["Raison sociale", "Martin Conseil SARL"],
      ["Secteur d'activité", "Conseil RH"],
      ["E-mail de contact", "contact@martin.test"],
      ["Couleur principale", "0a7f5a"],
    ],
  },
  {
    file: "Configuration.xlsx",
    sheet: "Équipe",
    rows: [
      ["Prénom *", "Nom *", "E-mail *", "Fonction", "Service", "Rôle", "Date d'arrivée", "Coût mensuel (€)"],
      ["Claire", "Martin", "claire@martin.test", "Directrice commerciale", "Direction", "Directeur commercial", new Date(Date.UTC(2024, 0, 15)), null],
      ["Paul", "Durand", "paul@martin.test", "Chargé d'affaires", "Commercial", "Commercial", "01/03/2025", "4 200,50"],
      ["Inès", "Roy", "ines@martin.test", null, "Ventes", "Commerciale", null, null],
      ["Sans", "Mail", null, null, null, null, null, null],
    ],
  },
  {
    file: "Configuration.xlsx",
    sheet: "Pipeline",
    rows: [
      ["Étape", "Votre libellé", "Probabilité (%)"],
      ["Nouveaux prospects", "Premier contact", 10],
      ["En discussion", "Rendez-vous découverte", "30 %"],
      ["Gagné", "Signé", 50],
    ],
  },
  { file: "Configuration.xlsx", sheet: "Sources", rows: [["Source"], ["Bouche-à-oreille"], ["Salon RH"]] },
  {
    file: "Configuration.xlsx",
    sheet: "Règles de suivi",
    rows: [
      ["Contact inactif après (jours)", 30],
      ["Jours travaillés", "lundi au jeudi"],
    ],
  },
  {
    file: "Configuration.xlsx",
    sheet: "Modules",
    rows: [
      ["Module", "Activé"],
      ["Finances", "Non"],
      ["Bureaux 3D", "non"],
      ["Gamification", "Oui"],
    ],
  },
  {
    file: "Configuration.xlsx",
    sheet: "Entreprises clientes",
    rows: [
      ["Nom *", "Relation", "Secteur", "Ville", "Responsable (e-mail)"],
      ["Atelier Nova", "Client actif", "Industrie", "Lyon", "paul@martin.test"],
      ["Boulangerie Lune", "Prospect", "Commerce", "Annecy", "inconnu@martin.test"],
    ],
  },
  {
    file: "Configuration.xlsx",
    sheet: "Contacts",
    rows: [
      ["Prénom *", "Nom *", "Entreprise", "Fonction", "E-mail", "Téléphone", "Relation", "Priorité", "Responsable (e-mail)"],
      ["Sophie", "Lambert", "Atelier Nova", "DRH", "sophie@nova.test", "06 00 00 00 00", "Client actif", "Haute", "paul@martin.test"],
      ["Marc", "Petit", "Garage Soleil", "Gérant", "marc@soleil.test", null, "Prospect", "Urgente", "ines@martin.test"],
      ["Mauvais", "Mail", null, null, "pas-un-mail", null, null, null, null],
    ],
  },
  {
    file: "Configuration.xlsx",
    sheet: "Opportunités",
    rows: [
      ["Nom *", "Entreprise", "Contact (e-mail)", "Montant HT (€)", "Étape", "Probabilité (%)", "Clôture prévue", "Responsable (e-mail)"],
      ["Audit RH 2027", "Atelier Nova", "sophie@nova.test", "12 500", "Rendez-vous découverte", null, "31/01/2027", "paul@martin.test"],
      ["Formation managers", null, "marc@soleil.test", 4800, "Proposition envoyée", 60, null, "ines@martin.test"],
      ["Orpheline", null, null, 1000, null, null, null, null],
    ],
  },
];

describe("lecture des fichiers de configuration", () => {
  it("valeurs françaises : montants, dates, jours, CSV", () => {
    expect(number("12 500,50 €")).toBe(12500.5);
    expect(number("35 %")).toBe(35);
    expect(date("31/01/2027")).toBe("2027-01-31");
    expect(date("31/02/2027")).toBe("invalid");
    expect(date(46000)).toBe("2025-12-09");
    expect(weekdays("lundi au jeudi")).toEqual([1, 2, 3, 4]);
    expect(weekdays("lun, mer, ven")).toEqual([1, 3, 5]);
    expect(parseCsv('Prénom;Nom;Notes\r\nAnne;"Dupont";"Dit ""bonjour""; merci"\n')).toEqual([
      ["Prénom", "Nom", "Notes"],
      ["Anne", "Dupont", 'Dit "bonjour"; merci'],
    ]);
  });

  it("reconnaît les onglets, signale les lignes invalides sans bloquer les autres", () => {
    const { input, issues, recognized } = parseWorkbooks(workbook(), { logo: "data:image/png;base64,iVBORw0KGgo=" });
    expect(recognized.map((r) => r.key)).toEqual(["company", "team", "pipeline", "sources", "rules", "modules", "companies", "contacts", "opportunities"]);
    expect(input.company).toMatchObject({ name: "Martin Conseil", legalName: "Martin Conseil SARL", email: "contact@martin.test" });
    expect(input.branding).toEqual({ logo: "data:image/png;base64,iVBORw0KGgo=", color: "#0A7F5A" });
    expect(input.team).toHaveLength(3);
    expect(input.team![1]).toMatchObject({ department: "sales", role: "commercial", hireDate: "2025-03-01", monthlyCost: 420050 });
    expect(input.stages).toEqual({ new: { label: "Premier contact", probability: 10 }, discussion: { label: "Rendez-vous découverte", probability: 30 }, won: { label: "Signé", probability: 50 } });
    expect(input.rules).toEqual({ inactivityDays: 30, workingDays: [1, 2, 3, 4] });
    expect(input.modules).toEqual({ finance: false, offices: false, gamification: true });
    expect(input.contacts).toHaveLength(2);
    expect(input.contacts![1]!.priority).toBe("critical");
    expect(issues.filter((i) => i.level === "error").map((i) => `${i.sheet}:${i.line}`)).toEqual(["Équipe:5", "Contacts:4"]);
  });

  it("CSV sans nom d'onglet : reconnu par ses en-têtes", () => {
    const rows = parseCsv("Prénom;Nom;E-mail;Rôle\nLéa;Moreau;lea@x.test;Collaboratrice\n");
    const { input, recognized } = parseWorkbooks([{ file: "equipe-client.csv", sheet: "equipe-client", rows }]);
    expect(recognized[0]?.key).toBe("team");
    expect(input.team?.[0]).toMatchObject({ email: "lea@x.test", role: "collaborateur" });
  });
});

describe("import dans un espace vide", () => {
  afterEach(() => applyCrmVocabulary(defaultCrmSettings()));

  it("remplit réglages, équipe, entreprises, contacts et opportunités", () => {
    const { input } = parseWorkbooks(workbook(), { logo: "data:image/png;base64,iVBORw0KGgo=" });
    const r = execute(empty(), C.importWorkspace, input, director());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.data;
    const report = r.result;
    expect(report.created).toEqual({ team: 2, companies: 3, contacts: 2, opportunities: 2 });
    expect(report.updated.team).toBe(1);
    expect(report.errors.map((e) => `${e.sheet}:${e.line}`)).toEqual(["Opportunités:4"]);
    expect(report.warnings.some((w) => /inconnu@martin.test/.test(w.message))).toBe(true);

    expect(d.settings.company.legalName).toBe("Martin Conseil SARL");
    expect(d.settings.branding).toMatchObject({ color: "#0A7F5A", logo: "data:image/png;base64,iVBORw0KGgo=" });
    expect(d.settings.crm.stages.discussion).toEqual({ label: "Rendez-vous découverte", probability: 30 });
    expect(d.settings.crm.stages.won.probability).toBe(100);
    expect(d.settings.crm.sources).toEqual(["Bouche-à-oreille", "Salon RH"]);
    expect(d.settings.crm.inactivityDays).toBe(30);
    expect(d.settings.modules.finance).toBe(false);

    const paul = d.employees.find((e) => e.email === "paul@martin.test")!;
    expect(paul).toMatchObject({ firstName: "Paul", jobTitle: "Chargé d'affaires", department: "sales", accessRole: "commercial", monthlyCost: 420050 });
    expect(d.employees.find((e) => e.id === "emp_owner")).toMatchObject({ accessRole: "dirigeant", hireDate: "2024-01-15" });

    const nova = d.clients.find((c) => c.name === "Atelier Nova")!;
    expect(nova).toMatchObject({ relation: "customer", city: "Lyon", ownerId: paul.id });
    expect(d.clients.find((c) => c.name === "Boulangerie Lune")?.ownerId).toBeNull();
    expect(d.clients.find((c) => c.name === "Garage Soleil")).toBeDefined();
    const sophie = d.contacts.find((c) => c.email === "sophie@nova.test")!;
    expect(sophie).toMatchObject({ clientId: nova.id, priority: "high", ownerId: paul.id, relation: "customer" });

    const audit = d.opportunities.find((o) => o.name === "Audit RH 2027")!;
    expect(audit).toMatchObject({ stage: "discussion", probability: 30, amount: 1_250_000, expectedCloseDate: "2027-01-31", contactId: sophie.id, clientId: nova.id });
    expect(d.opportunities.find((o) => o.name === "Formation managers")).toMatchObject({ stage: "proposal", probability: 60 });

    // Une ligne d'activité et une entrée d'audit pour tout l'import ; aucune XP gagnée.
    expect(d.activity.filter((a) => /Import de fichiers/.test(a.description))).toHaveLength(1);
    expect(d.xpTransactions.filter((x) => x.source === "contact" || x.source === "opportunity")).toHaveLength(0);
  });

  it("réimporter le même fichier met à jour sans créer de doublons", () => {
    const { input } = parseWorkbooks(workbook());
    const first = execute(empty(), C.importWorkspace, input, director());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = execute(first.data, C.importWorkspace, input, director());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.created).toEqual({ team: 0, companies: 0, contacts: 0, opportunities: 0 });
    expect(second.data.contacts).toHaveLength(first.data.contacts.length);
    expect(second.data.clients).toHaveLength(first.data.clients.length);
    expect(second.data.opportunities).toHaveLength(first.data.opportunities.length);
  });

  it("réservé au directeur commercial", () => {
    const { input } = parseWorkbooks(workbook());
    expect(execute(empty(), C.importWorkspace, input, ctx("commercial")).ok).toBe(false);
  });
});
