// Assemble les migrations Supabase en un seul fichier à coller dans l'éditeur SQL de
// Supabase (Dashboard › SQL Editor) : `npm run supabase:install-sql`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const header = [
  "-- BDO Software CRM — installation complète de la base Supabase (fichier généré).",
  "-- À exécuter UNE fois dans un projet Supabase neuf : Dashboard › SQL Editor › New query,",
  "-- coller tout le contenu puis « Run ». Source : supabase/migrations/*.sql.",
  "",
];
const body = files.map((f) => `-- ===== ${f} =====\n${readFileSync(join(dir, f), "utf8").trim()}\n`);
writeFileSync("supabase/install.sql", header.join("\n") + body.join("\n"));
console.log(`supabase/install.sql : ${files.length} migrations`);
