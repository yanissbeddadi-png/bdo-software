/**
 * Génère les modèles Excel vides à remplir par le client (public/modeles/) à partir de la
 * définition des onglets (src/lib/import/sheets.ts) : le classeur complet et un fichier
 * par onglet. Usage : npm run modeles
 */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SHEETS, type SheetDef } from "../src/lib/import/sheets";

const OUT = join(process.cwd(), "public", "modeles");
const BLUE = "FF224395";
const RED = "FFE81A3B";
const GREY = "FFF2F2F2";
const DATE_COLUMNS = new Set(["hireDate", "closeDate"]);
const MONEY_COLUMNS = new Set(["monthlyCost", "amount"]);
const ROWS = 500;

/** Nom de fichier sans accents ni espaces. */
const fileName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function readme(wb: ExcelJS.Workbook, sheets: SheetDef[]) {
  const ws = wb.addWorksheet("Lisez-moi", { properties: { tabColor: { argb: RED } } });
  ws.columns = [{ width: 26 }, { width: 100 }];
  const title = ws.addRow(["Configuration de votre CRM"]);
  title.font = { bold: true, size: 16, color: { argb: BLUE } };
  ws.addRow([]);
  for (const t of [
    "1. Complétez les onglets de ce fichier. Les colonnes marquées d'une * sont obligatoires ; une case vide garde la valeur par défaut.",
    "2. Ne renommez pas les onglets ni les titres de colonnes (vous pouvez supprimer les onglets inutiles).",
    "3. Renvoyez ce fichier avec votre logo (PNG, SVG, JPEG ou WebP, 300 Ko maximum) : ils seront déposés tels quels dans l'application.",
    "Les e-mails de l'onglet Équipe servent d'identifiants de connexion. Aucun mot de passe ne doit figurer dans ce fichier.",
  ])
    ws.addRow(["", t]).getCell(2).alignment = { wrapText: true, vertical: "top" };
  ws.addRow([]);
  const head = ws.addRow(["Onglet", "Contenu"]);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  });
  for (const s of sheets) {
    const r = ws.addRow([s.name, s.description]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}

function addSheet(wb: ExcelJS.Workbook, def: SheetDef) {
  const ws = wb.addWorksheet(def.name, { views: [{ state: "frozen", ySplit: 1 }] });
  const headerStyle = (row: ExcelJS.Row) =>
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
      c.alignment = { vertical: "middle" };
    });

  if (def.layout === "fields") {
    ws.columns = [{ width: 42 }, { width: 40 }, { width: 60 }];
    headerStyle(ws.addRow(["Champ", "Valeur", "Aide"]));
    for (const col of def.columns) {
      const r = ws.addRow([col.required ? `${col.header} *` : col.header, "", col.help ?? ""]);
      r.getCell(1).font = { bold: true };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
      r.getCell(3).font = { italic: true, color: { argb: "FF666666" } };
    }
    return;
  }

  ws.columns = def.columns.map((c) => ({ width: c.width ?? 18 }));
  const header = ws.addRow(def.columns.map((c) => (c.required ? `${c.header} *` : c.header)));
  headerStyle(header);
  def.columns.forEach((c, i) => {
    if (c.help) header.getCell(i + 1).note = c.help;
  });
  for (const row of def.prefill ?? []) ws.addRow(row);
  def.columns.forEach((c, i) => {
    const letter = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= ROWS; r++) {
      const cell = ws.getCell(`${letter}${r}`);
      if (c.choices) cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${c.choices.join(",")}"`], showErrorMessage: false };
      if (DATE_COLUMNS.has(c.key)) cell.numFmt = "dd/mm/yyyy";
      if (MONEY_COLUMNS.has(c.key)) cell.numFmt = "# ##0.00";
    }
  });
  // Pipeline : la colonne « Étape » sert de repère, grisée.
  if (def.key === "pipeline") ws.getColumn(1).eachCell((c, n) => n > 1 && (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } }));
}

async function write(name: string, sheets: SheetDef[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BDO Software & Services";
  readme(wb, sheets);
  for (const def of sheets) addSheet(wb, def);
  const path = join(OUT, `${name}.xlsx`);
  await wb.xlsx.writeFile(path);
  console.log(path);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await write("Configuration-CRM", SHEETS);
  for (const def of SHEETS) await write(`Modele-${fileName(def.name)}`, [def]);
}

void main();
