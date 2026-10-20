"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, ImageUp, Loader2, TriangleAlert, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { CurrentUser } from "@/lib/domain/types";
import { useCommand, useData } from "@/lib/store/hooks";
import { clock } from "@/lib/store/app-store";
import { execute } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import type { ImportCounts, ImportReport } from "@/lib/domain/commands/import";
import { MAX_LOGO_LENGTH } from "@/lib/domain/commands/settings";
import { parseCsv, parseWorkbooks, type Cell, type ImportIssue, type ParseResult, type RawSheet } from "@/lib/import/parse";
import { SHEETS } from "@/lib/import/sheets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Nom de fichier des modèles (voir scripts/generate-templates.ts). */
const templateFile = (name: string) =>
  `Modele-${name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.xlsx`;

const IMAGE = /^image\/(png|jpeg|webp|svg\+xml)$/;
const ACCEPT = ".xlsx,.csv,.png,.jpg,.jpeg,.webp,.svg";

interface Loaded {
  names: string[];
  sheets: RawSheet[];
  logo?: string;
  problems: ImportIssue[];
}

async function readFiles(files: File[]): Promise<Loaded> {
  const out: Loaded = { names: [], sheets: [], problems: [] };
  for (const file of files) {
    out.names.push(file.name);
    const where = { file: file.name, sheet: "—" };
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // Chargé à la demande : la lecture Excel n'alourdit pas le reste de l'application.
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        for (const s of await readXlsxFile(file)) out.sheets.push({ file: file.name, sheet: s.sheet, rows: s.data as unknown as Cell[][] });
      } else if (/\.csv$/i.test(file.name)) {
        out.sheets.push({ file: file.name, sheet: file.name.replace(/\.csv$/i, ""), rows: parseCsv(await file.text()) });
      } else if (IMAGE.test(file.type)) {
        const url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        if (url.length > MAX_LOGO_LENGTH) out.problems.push({ ...where, level: "error", message: "Logo trop lourd : 300 Ko maximum." });
        else out.logo = url;
      } else if (/\.xls$/i.test(file.name)) {
        out.problems.push({ ...where, level: "error", message: "Ancien format Excel (.xls) : enregistrez le fichier au format .xlsx." });
      } else {
        out.problems.push({ ...where, level: "error", message: "Format non pris en charge : .xlsx, .csv ou image (PNG, JPEG, WebP, SVG)." });
      }
    } catch {
      out.problems.push({ ...where, level: "error", message: "Fichier illisible ou endommagé." });
    }
  }
  return out;
}

const COUNT_LABELS: [keyof ImportCounts, string, string][] = [
  ["team", "collaborateur", "collaborateurs"],
  ["companies", "entreprise", "entreprises"],
  ["contacts", "contact", "contacts"],
  ["opportunities", "opportunité", "opportunités"],
];
const describeCounts = (c: ImportCounts) =>
  COUNT_LABELS.filter(([k]) => c[k] > 0)
    .map(([k, one, many]) => `${c[k]} ${c[k] > 1 ? many : one}`)
    .join(", ");

/**
 * Configuration de l'espace par fichiers : modèles Excel à faire remplir par le client,
 * dépôt des fichiers complétés (et du logo), aperçu de ce qui sera créé ou mis à jour,
 * puis import en une fois. Les lignes refusées sont listées avec leur numéro.
 */
export function ImportTab() {
  const data = useData();
  const run = useCommand();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [done, setDone] = React.useState<ImportReport | null>(null);

  const parsed: ParseResult | null = React.useMemo(() => (loaded ? parseWorkbooks(loaded.sheets, { logo: loaded.logo }) : null), [loaded]);
  // Aperçu : la commande est exécutée sur une copie, sans rien enregistrer.
  const preview = React.useMemo(() => {
    if (!parsed) return null;
    const { today, now } = clock(data);
    const res = execute(data, C.importWorkspace, parsed.input, { today, now, user: data.settings.user as CurrentUser });
    return res.ok ? { report: res.result } : { error: res.error };
  }, [parsed, data]);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setDone(null);
    const next = await readFiles(files);
    setLoaded((prev) =>
      prev ? { names: [...prev.names, ...next.names], sheets: [...prev.sheets, ...next.sheets], logo: next.logo ?? prev.logo, problems: [...prev.problems, ...next.problems] } : next,
    );
    setBusy(false);
  };

  const issues = [...(loaded?.problems ?? []), ...(parsed?.issues ?? [])];
  const report = preview && "report" in preview ? preview.report : null;
  const errors = [...issues.filter((i) => i.level === "error"), ...(report?.errors ?? []).map((e) => ({ ...e, file: "", level: "error" as const }))];
  const warnings = [...issues.filter((i) => i.level === "warning"), ...(report?.warnings ?? []).map((w) => ({ ...w, file: "", level: "warning" as const }))];
  const nothing = report && !describeCounts(report.created) && !describeCounts(report.updated) && !report.settings.length;

  const apply = () => {
    if (!parsed) return;
    const res = run(C.importWorkspace, parsed.input, { silent: true });
    if (!res.ok) return;
    toast.success("Import terminé.");
    setDone(res.result);
    setLoaded(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>1. Modèles à faire remplir</CardTitle>
            <CardDescription>
              Envoyez le classeur au client : un onglet par sujet (entreprise, équipe, pipeline, sources, règles, modules, entreprises clientes, contacts, opportunités). Il vous le renvoie complété,
              avec son logo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild variant="primary">
            <a href="/modeles/Configuration-CRM.xlsx" download>
              <Download /> Classeur complet (.xlsx)
            </a>
          </Button>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Ou un fichier par sujet :</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {SHEETS.map((s) => (
                <li key={s.key}>
                  <a href={`/modeles/${templateFile(s.name)}`} download className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-fg hover:bg-interactive">
                    <FileSpreadsheet className="size-4 text-accent" /> {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-subtle">
            Colonnes marquées d&apos;une * : obligatoires. Une case vide garde la valeur actuelle. Les e-mails de l&apos;équipe servent d&apos;identifiants ; aucun mot de passe ne doit figurer dans
            les fichiers. Un fichier CSV exporté d&apos;un autre logiciel est aussi accepté s&apos;il reprend les mêmes titres de colonnes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>2. Déposer les fichiers complétés</CardTitle>
            <CardDescription>Classeur Excel (.xlsx), fichiers CSV et logo (PNG, JPEG, WebP ou SVG, 300 Ko max). Rien n&apos;est enregistré avant de cliquer sur « Importer ».</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Déposer des fichiers ou cliquer pour les choisir"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void add([...e.dataTransfer.files]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging ? "border-accent bg-accent/5" : "border-border hover:border-border-strong",
            )}
          >
            {busy ? <Loader2 className="size-6 animate-spin text-muted" /> : <Upload className="size-6 text-accent" />}
            <p className="text-sm font-medium text-fg">Glissez les fichiers ici ou cliquez pour les choisir</p>
            <p className="text-xs text-muted">Plusieurs fichiers à la fois : classeur, CSV et logo.</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              data-testid="import-files"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void add(files);
              }}
            />
          </div>

          {done ? (
            <div role="status" className="space-y-2 rounded-lg border border-success/40 bg-success/5 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-fg">
                <CheckCircle2 className="size-4 text-success" /> Import terminé
              </p>
              {describeCounts(done.created) ? <p>Créés : {describeCounts(done.created)}.</p> : null}
              {describeCounts(done.updated) ? <p>Mis à jour : {describeCounts(done.updated)}.</p> : null}
              {done.settings.length ? <p>Réglages : {done.settings.join(", ")}.</p> : null}
              {done.errors.length ? <p className="text-danger">{done.errors.length} ligne(s) refusée(s) : corrigez-les dans le fichier puis déposez-le à nouveau.</p> : null}
              {done.created.team > 0 ? (
                <p>
                  Prochaine étape :{" "}
                  <Link href="/parametres?tab=roles" className="font-medium text-accent underline-offset-2 hover:underline">
                    créer les comptes de connexion de l&apos;équipe
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {loaded ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {loaded.names.map((n, i) => (
                  <Badge key={`${n}-${i}`} tone="neutral">
                    {n}
                  </Badge>
                ))}
                {loaded.logo ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <ImageUp className="size-3.5" /> logo reconnu
                  </span>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setLoaded(null)}>
                  <X /> Tout retirer
                </Button>
              </div>

              {parsed?.recognized.length ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">Onglets reconnus</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {parsed.recognized.map((r, i) => (
                      <li key={i}>
                        <Badge tone="info">
                          {r.label} · {r.rows} ligne{r.rows > 1 ? "s" : ""}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview && "error" in preview ? (
                <p role="alert" className="text-sm text-danger">
                  {preview.error}
                </p>
              ) : report ? (
                <div className="rounded-lg border border-border bg-bg p-4 text-sm" data-testid="import-preview">
                  <p className="mb-1 font-medium text-fg">Aperçu de l&apos;import</p>
                  {describeCounts(report.created) ? <p>À créer : {describeCounts(report.created)}.</p> : null}
                  {describeCounts(report.updated) ? <p>À mettre à jour : {describeCounts(report.updated)}.</p> : null}
                  {report.settings.length ? <p>Réglages : {report.settings.join(", ")}.</p> : null}
                  {nothing ? <p className="text-muted">Aucune donnée à importer dans ces fichiers.</p> : null}
                </div>
              ) : null}

              <IssueList title={`${errors.length} ligne(s) refusée(s)`} items={errors} tone="danger" />
              <IssueList title={`${warnings.length} remarque(s)`} items={warnings} tone="warning" collapsed />

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" disabled={!report || !!nothing || busy} onClick={apply}>
                  <Upload /> Importer
                </Button>
                {errors.length && report && !nothing ? <span className="text-xs text-muted">Les lignes refusées seront ignorées ; tout le reste sera importé.</span> : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function IssueList({ title, items, tone, collapsed }: { title: string; items: { file?: string; sheet: string; line?: number; message: string }[]; tone: "danger" | "warning"; collapsed?: boolean }) {
  if (!items.length) return null;
  const list = (
    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
      {items.map((i, n) => (
        <li key={n} className="flex gap-2">
          <span className="shrink-0 font-medium text-fg">
            {i.sheet}
            {i.line ? ` · ligne ${i.line}` : ""}
          </span>
          <span className="text-muted">{i.message}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("rounded-lg border p-3", tone === "danger" ? "border-danger/40 bg-danger/5" : "border-warning/40 bg-warning/5")}>
      {collapsed ? (
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fg">
            <TriangleAlert className="size-4 text-warning" /> {title}
          </summary>
          {list}
        </details>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <TriangleAlert className="size-4 text-danger" /> {title}
          </p>
          {list}
        </>
      )}
    </div>
  );
}
