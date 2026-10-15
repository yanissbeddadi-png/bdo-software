/**
 * Export CSV compatible avec les tableurs français : séparateur « ; », encodage
 * UTF-8 avec BOM, montants au format décimal français.
 */
export type CsvCell = string | number | null | undefined;

function escape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
}

/** Montant en centimes → nombre décimal (euros) pour l'export. */
export function csvMoney(cents: number | null | undefined): number | null {
  return cents === null || cents === undefined ? null : cents / 100;
}

export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([mime.startsWith("text/csv") ? "﻿" + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(filename: string, headers: string[], rows: CsvCell[][]) {
  downloadFile(filename.endsWith(".csv") ? filename : `${filename}.csv`, toCSV(headers, rows));
}
