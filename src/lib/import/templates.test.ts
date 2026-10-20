import { describe, expect, it } from "vitest";
import { join } from "node:path";
import ExcelJS from "exceljs";
import readXlsxFile from "read-excel-file/node";
import { parseWorkbooks, type Cell, type RawSheet } from "./parse";
import { SHEETS } from "./sheets";

const TEMPLATE = join(process.cwd(), "public", "modeles", "Configuration-CRM.xlsx");

async function read(input: string | Buffer, file = "Configuration-CRM.xlsx"): Promise<RawSheet[]> {
  const sheets = await readXlsxFile(input);
  // Les types de read-excel-file déclarent `typeof Date` pour les dates : ce sont des instances de Date.
  return sheets.map((s) => ({ file, sheet: s.sheet, rows: s.data as unknown as Cell[][] }));
}

describe("modèles Excel (public/modeles, générés par npm run modeles)", () => {
  it("le modèle vide contient tous les onglets et se relit sans erreur", async () => {
    const { recognized, issues, input } = parseWorkbooks(await read(TEMPLATE));
    expect(recognized.map((r) => r.key).sort()).toEqual(SHEETS.map((s) => s.key).sort());
    expect(issues).toEqual([]);
    // Valeurs préremplies : sources et modules par défaut, aucune donnée client.
    expect(input.sources?.length).toBeGreaterThan(3);
    expect(Object.values(input.modules ?? {}).every(Boolean)).toBe(true);
    expect(input.team ?? []).toHaveLength(0);
    expect(input.contacts ?? []).toHaveLength(0);
  });

  it("un modèle rempli par le client (dates et montants Excel) est lu correctement", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE);
    const fields = wb.getWorksheet("Entreprise")!;
    fields.getCell("B2").value = "Martin Conseil";
    fields.getCell("B10").value = "#0A7F5A";
    const team = wb.getWorksheet("Équipe")!;
    team.getRow(2).values = ["Paul", "Durand", "paul@martin.test", "Chargé d'affaires", "Commercial", "Commercial", new Date(Date.UTC(2025, 2, 1)), 4200.5];
    const opps = wb.getWorksheet("Opportunités")!;
    opps.getRow(2).values = ["Audit RH", "Atelier Nova", null, 12500, "En discussion", null, new Date(Date.UTC(2027, 0, 31)), "paul@martin.test"];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { input, issues } = parseWorkbooks(await read(buffer));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(input.company?.name).toBe("Martin Conseil");
    expect(input.branding?.color).toBe("#0A7F5A");
    expect(input.team).toEqual([expect.objectContaining({ line: 2, email: "paul@martin.test", role: "commercial", hireDate: "2025-03-01", monthlyCost: 420050 })]);
    expect(input.opportunities).toEqual([expect.objectContaining({ name: "Audit RH", amount: 1_250_000, closeDate: "2027-01-31", stage: "En discussion" })]);
  });
});
