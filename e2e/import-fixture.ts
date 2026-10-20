import { join } from "node:path";
import ExcelJS from "exceljs";

/** Écrit des lignes à partir de la ligne 2, comme un client qui remplit le modèle. */
function fill(ws: ExcelJS.Worksheet, rows: unknown[][]) {
  rows.forEach((values, i) => {
    ws.getRow(2 + i).values = values as ExcelJS.CellValue[];
  });
}

/** Classeur de configuration rempli comme le ferait un client (à partir du modèle livré). */
export async function filledWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(process.cwd(), "public", "modeles", "Configuration-CRM.xlsx"));
  const company = wb.getWorksheet("Entreprise")!;
  company.getCell("B2").value = "Martin Conseil";
  company.getCell("B3").value = "Martin Conseil SARL";
  company.getCell("B10").value = "#0A7F5A";
  const team = wb.getWorksheet("Équipe")!;
  fill(team, [
    ["Paul", "Durand", "paul@martin-conseil.test", "Chargé d'affaires", "Commercial", "Commercial", new Date(Date.UTC(2025, 2, 1)), null],
    ["Inès", "Roy", "ines@martin-conseil.test", "Commerciale", "Commercial", "Commercial", null, null],
  ]);
  const pipeline = wb.getWorksheet("Pipeline")!;
  pipeline.getCell("B4").value = "Rendez-vous découverte";
  const companies = wb.getWorksheet("Entreprises clientes")!;
  fill(companies, [["Atelier Nova", "Client actif", "Industrie", "11-50", "Lyon", "France", null, "paul@martin-conseil.test"]]);
  const contacts = wb.getWorksheet("Contacts")!;
  fill(contacts, [
    ["Sophie", "Lambert", "Atelier Nova", "DRH", "sophie@nova.test", "06 00 00 00 00", "Client actif", "Haute", "paul@martin-conseil.test"],
    ["Marc", "Petit", "Garage Soleil", "Gérant", "marc@soleil.test", null, "Prospect", "Normale", "ines@martin-conseil.test"],
    ["Sans", "Email", null, null, "pas-un-email", null, null, null, null],
  ]);
  const opps = wb.getWorksheet("Opportunités")!;
  fill(opps, [["Audit RH 2027", "Atelier Nova", "sophie@nova.test", 12500, "Rendez-vous découverte", null, new Date(Date.UTC(2027, 0, 31)), "paul@martin-conseil.test"]]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
