"use client";
import * as React from "react";
import { Database, Download, FileJson, Plus, RotateCcw, Save, ShieldAlert, Trash2, Upload } from "lucide-react";
import type { CompanySettings, Role, RuleSettings, XpRuleKey } from "@/lib/domain/types";
import { useCommand, useData } from "@/lib/store/hooks";
import { useAppStore, repositoryKind } from "@/lib/store/app-store";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { externalConnections, isAppData } from "@/lib/database/repository";
import { DEFAULT_XP_REWARDS } from "@/lib/database/seed";
import { PERMISSION_LABELS, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { MoneyInput } from "@/components/forms/money-input";
import { Field } from "@/components/forms/entity-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { ROLE } from "@/lib/formatters/labels";
import { formatDate, formatDateTime, formatInt } from "@/lib/formatters";
import { downloadCSV, downloadFile, csvMoney } from "@/lib/export/csv";
import { documentTotals } from "@/lib/calculations/money";
import { toast } from "sonner";

const XP_LABELS: Record<XpRuleKey, string> = {
  task_simple: "Tâche simple terminée",
  task_standard: "Tâche standard terminée",
  task_complex: "Tâche complexe terminée",
  mission_daily: "Mission quotidienne terminée",
  goal_intermediate: "Objectif à 50 %",
  goal_major: "Objectif atteint",
  project_done: "Projet terminé",
  client_validated: "Nouveau client validé (1re facture payée ou contrat actif)",
  opportunity_won: "Opportunité gagnée",
  invoice_paid: "Facture payée intégralement (hors abonnements)",
  achievement_common: "Succès commun",
  achievement_rare: "Succès rare",
  achievement_epic: "Succès épique",
  achievement_legendary: "Succès légendaire",
};

export function SettingsPage() {
  const tabParam = useParam("tab");
  const [tab, setTab] = useSyncedState(tabParam ?? "entreprise");
  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Configuration de l'entreprise, des préférences, de la gamification, des règles d'alerte, des données et des rôles." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="entreprise">Entreprise</TabsTrigger>
          <TabsTrigger value="preferences">Préférences</TabsTrigger>
          <TabsTrigger value="gamification">Gamification et règles</TabsTrigger>
          <TabsTrigger value="donnees">Données</TabsTrigger>
          <TabsTrigger value="roles">Utilisateurs et rôles</TabsTrigger>
          <TabsTrigger value="audit">Journal d&apos;audit</TabsTrigger>
        </TabsList>
        <TabsContent value="entreprise">
          <CompanyTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="gamification">
          <GamificationTab />
        </TabsContent>
        <TabsContent value="donnees">
          <DataTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyTab() {
  const data = useData();
  const run = useCommand();
  const [c, setC] = React.useState<CompanySettings>(data.settings.company);
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setC((s) => ({ ...s, [k]: v }));
  return (
    <form
      className="grid gap-6 xl:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(C.updateCompanySettings, c);
      }}
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Identité</CardTitle>
            <CardDescription>Coordonnées fictives de démonstration</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom commercial" htmlFor="c-name">
            <Input id="c-name" value={c.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Raison sociale" htmlFor="c-legal">
            <Input id="c-legal" value={c.legalName} onChange={(e) => set("legalName", e.target.value)} />
          </Field>
          <Field label="Secteur" htmlFor="c-sector" className="sm:col-span-2">
            <Input id="c-sector" value={c.sector} onChange={(e) => set("sector", e.target.value)} />
          </Field>
          <Field label="Pays" htmlFor="c-country">
            <Input id="c-country" value={c.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Devise" htmlFor="c-cur" help="La simulation gère uniquement l'euro.">
            <Input id="c-cur" value="EUR" disabled />
          </Field>
          <Field label="Fuseau horaire" htmlFor="c-tz">
            <NativeSelect id="c-tz" value={c.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "America/Montreal", "Indian/Reunion"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="E-mail" htmlFor="c-email">
            <Input id="c-email" value={c.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Adresse" htmlFor="c-addr" className="sm:col-span-2">
            <Input id="c-addr" value={c.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Logo" htmlFor="c-logo" help="Logo par défaut (icône hexagonale) ; le téléversement d'image n'est pas disponible en mode démo.">
            <Input id="c-logo" value="Hexagone BDO (par défaut)" disabled />
          </Field>
          <Field label="Téléphone" htmlFor="c-phone">
            <Input id="c-phone" value={c.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>TVA</CardTitle>
              <CardDescription>Paramètres de simulation — ils ne garantissent aucune conformité fiscale.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {c.vatRates.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
                <Input aria-label="Libellé du taux" value={r.label} onChange={(e) => set("vatRates", c.vatRates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input aria-label="Taux en %" inputMode="decimal" className="text-right tabular" value={String(r.rate / 100).replace(".", ",")} onChange={(e) => set("vatRates", c.vatRates.map((x, j) => (j === i ? { ...x, rate: Math.round(Number(e.target.value.replace(",", ".")) * 100) } : x)))} />
                <Button variant="ghost" size="icon-sm" aria-label="Supprimer le taux" disabled={c.vatRates.length <= 1} onClick={() => set("vatRates", c.vatRates.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => set("vatRates", [...c.vatRates, { id: `vat-${Date.now()}`, label: "Nouveau taux", rate: 0 }])}>
              <Plus /> Ajouter un taux
            </Button>
            <Field label="Taux par défaut" htmlFor="c-defvat">
              <NativeSelect id="c-defvat" value={c.defaultVatRate} onChange={(e) => set("defaultVatRate", Number(e.target.value))}>
                {c.vatRates.map((r) => (
                  <option key={r.id} value={r.rate}>
                    {r.label} ({r.rate / 100} %)
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trésorerie et simulation</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Solde d'ouverture (fictif)" htmlFor="c-open">
              <MoneyInput id="c-open" value={c.openingBalance} onChange={(v) => set("openingBalance", v)} />
            </Field>
            <Field label="Date du solde d'ouverture" htmlFor="c-opend">
              <Input id="c-opend" type="date" value={c.openingBalanceDate} onChange={(e) => set("openingBalanceDate", e.target.value)} />
            </Field>
            <Field label="Seuil d'alerte de trésorerie" htmlFor="c-thr">
              <MoneyInput id="c-thr" value={c.cashAlertThreshold} onChange={(v) => set("cashAlertThreshold", v)} />
            </Field>
            <Field label="Début de la simulation" htmlFor="c-sim">
              <Input id="c-sim" type="date" value={c.simulationStartDate} onChange={(e) => set("simulationStartDate", e.target.value)} />
            </Field>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            <Save /> Enregistrer
          </Button>
        </div>
      </div>
    </form>
  );
}

function PreferencesTab() {
  const data = useData();
  const run = useCommand();
  const p = data.settings.preferences;
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const [ref, setRef] = React.useState(p.referenceDate ?? "");
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Affichage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Langue" htmlFor="p-lang" help="L'interface est disponible en français.">
            <NativeSelect id="p-lang" value="fr" disabled>
              <option value="fr">Français</option>
            </NativeSelect>
          </Field>
          <Field label="Thème" htmlFor="p-theme" help="Thème sombre ; les accents se changent dans Progression › Récompenses.">
            <NativeSelect id="p-theme" value="dark" disabled>
              <option value="dark">Sombre</option>
            </NativeSelect>
          </Field>
          <Field label="Format de date" htmlFor="p-date">
            <NativeSelect id="p-date" value={p.dateFormat} onChange={(e) => run(C.updatePreferences, { dateFormat: e.target.value as typeof p.dateFormat })}>
              <option value="dd/MM/yyyy">15/10/2026</option>
              <option value="d MMM yyyy">15 oct. 2026</option>
            </NativeSelect>
          </Field>
          <Field label="Format monétaire" htmlFor="p-money">
            <NativeSelect id="p-money" value="fr" disabled>
              <option value="fr">12 450,00 €</option>
            </NativeSelect>
          </Field>
          <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
            Barre latérale compacte
            <Switch checked={collapsed} onCheckedChange={toggle} aria-label="Barre latérale compacte" />
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Date de référence de la simulation</CardTitle>
            <CardDescription>Permet de « voyager dans le temps » : échéances, retards, missions et prévisions sont recalculés par rapport à cette date. Laisser vide pour utiliser la date du jour.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Field label="Date simulée" htmlFor="p-ref">
            <Input id="p-ref" type="date" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={() => run(C.updatePreferences, { referenceDate: ref || null })}>
            Appliquer
          </Button>
          {p.referenceDate ? (
            <Button
              variant="ghost"
              onClick={() => {
                setRef("");
                run(C.updatePreferences, { referenceDate: null });
              }}
            >
              Revenir à aujourd&apos;hui
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function GamificationTab() {
  const data = useData();
  const run = useCommand();
  const g = data.settings.gamification;
  const { confirm, dialog } = useConfirm();
  const [xp, setXp] = React.useState<Record<XpRuleKey, number>>(g.xpRewards);
  const [vals, setVals] = React.useState({ dailyInvoiceXpCap: g.dailyInvoiceXpCap, dailyCustomMissionXpCap: g.dailyCustomMissionXpCap, staleOpportunityDays: g.staleOpportunityDays, weeklyProspectingTarget: g.weeklyProspectingTarget });
  const [threshold, setThreshold] = React.useState(g.pipelineAchievementThreshold);
  const [rules, setRules] = React.useState<RuleSettings>(data.settings.rules);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { k: "enabled" as const, l: "Activer la gamification (XP, missions automatiques, succès)" },
              { k: "animations" as const, l: "Animations de l'interface" },
              { k: "playfulNotifications" as const, l: "Notifications ludiques (succès, niveaux, missions)" },
            ].map((o) => (
              <label key={o.k} className="flex items-center justify-between gap-3">
                {o.l}
                <Switch checked={g[o.k]} onCheckedChange={(v) => run(C.updateGamificationSettings, { [o.k]: v })} aria-label={o.l} />
              </label>
            ))}
            <p className="text-[11px] text-subtle">La préférence système « réduire les animations » est toujours respectée.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Récompenses XP</CardTitle>
              <CardDescription>L&apos;XP est une unité ludique, jamais de l&apos;argent. Les changements s&apos;appliquent aux futures récompenses.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(XP_LABELS) as XpRuleKey[]).map((k) => (
              <div key={k} className="grid grid-cols-[1fr_90px] items-center gap-2 text-sm">
                <label htmlFor={`xp-${k}`} className="text-muted">
                  {XP_LABELS[k]}
                </label>
                <Input id={`xp-${k}`} type="number" min={0} max={5000} className="h-8 text-right tabular" value={xp[k]} onChange={(e) => setXp({ ...xp, [k]: Math.round(Number(e.target.value)) })} />
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setXp({ ...DEFAULT_XP_REWARDS })}>
                <RotateCcw /> Valeurs par défaut
              </Button>
              <Button variant="primary" size="sm" onClick={() => run(C.updateGamificationSettings, { xpRewards: xp })}>
                <Save /> Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Seuils de progression et anti-abus</CardTitle>
              <CardDescription>Objectifs des missions automatiques et plafonds quotidiens</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Factures payées récompensées / jour" htmlFor="g-cap">
              <Input id="g-cap" type="number" min={0} value={vals.dailyInvoiceXpCap} onChange={(e) => setVals({ ...vals, dailyInvoiceXpCap: Number(e.target.value) })} />
            </Field>
            <Field label="Missions perso récompensées / jour" htmlFor="g-cap2">
              <Input id="g-cap2" type="number" min={0} value={vals.dailyCustomMissionXpCap} onChange={(e) => setVals({ ...vals, dailyCustomMissionXpCap: Number(e.target.value) })} />
            </Field>
            <Field label="Opportunité inactive après (jours)" htmlFor="g-stale">
              <Input id="g-stale" type="number" min={1} value={vals.staleOpportunityDays} onChange={(e) => setVals({ ...vals, staleOpportunityDays: Number(e.target.value) })} />
            </Field>
            <Field label="Objectif prospection hebdo." htmlFor="g-prosp">
              <Input id="g-prosp" type="number" min={1} value={vals.weeklyProspectingTarget} onChange={(e) => setVals({ ...vals, weeklyProspectingTarget: Number(e.target.value) })} />
            </Field>
            <Field label="Seuil du succès « Pipeline ambitieux »" htmlFor="g-pipe" className="sm:col-span-2">
              <MoneyInput id="g-pipe" value={threshold} onChange={setThreshold} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button variant="primary" size="sm" onClick={() => run(C.updateGamificationSettings, { ...vals, pipelineAchievementThreshold: threshold })}>
                <Save /> Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Règles d&apos;alerte et de risque</CardTitle>
              <CardDescription>Heuristiques configurables utilisées par les alertes et la page Opérations.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Facture importante à partir de" htmlFor="r-big">
              <MoneyInput id="r-big" value={rules.bigInvoiceThreshold} onChange={(v) => setRules({ ...rules, bigInvoiceThreshold: v })} />
            </Field>
            <Field label="Charge excessive (h sur 14 j)" htmlFor="r-load">
              <Input id="r-load" type="number" min={1} value={rules.workloadHoursThreshold} onChange={(e) => setRules({ ...rules, workloadHoursThreshold: Number(e.target.value) })} />
            </Field>
            <Field label="Préavis de fin de contrat (jours)" htmlFor="r-notice">
              <Input id="r-notice" type="number" min={1} value={rules.contractNoticeDays} onChange={(e) => setRules({ ...rules, contractNoticeDays: Number(e.target.value) })} />
            </Field>
            <Field label="Fenêtre des tâches critiques (jours)" htmlFor="r-crit">
              <Input id="r-crit" type="number" min={0} value={rules.criticalTaskDays} onChange={(e) => setRules({ ...rules, criticalTaskDays: Number(e.target.value) })} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button variant="primary" size="sm" onClick={() => run(C.updateRules, rules)}>
                <Save /> Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-danger/30">
          <CardHeader>
            <div>
              <CardTitle>Réinitialiser la progression</CardTitle>
              <CardDescription>XP, niveau et journal repartent de zéro. Les actions déjà récompensées ne pourront pas l&apos;être une seconde fois ; les succès restent acquis.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="danger" onClick={() => confirm({ title: "Réinitialiser la progression ?", description: `${formatInt(data.xpTransactions.reduce((s, x) => s + x.amount, 0))} XP et le journal de progression seront effacés. Cette action est journalisée et irréversible.`, confirmLabel: "Réinitialiser", action: () => run(C.resetProgression, undefined) })}>
              <RotateCcw /> Réinitialiser la progression
            </Button>
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  );
}

function DataTab() {
  const data = useData();
  const resetDemo = useAppStore((s) => s.resetDemo);
  const replaceAll = useAppStore((s) => s.replaceAll);
  const { confirm, dialog } = useConfirm();
  const ext = externalConnections();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const exports: { label: string; run: () => void }[] = [
    { label: "Clients", run: () => downloadCSV("clients", ["Nom", "Secteur", "Statut", "Ville", "Créé le"], data.clients.map((c) => [c.name, c.sector, c.status, c.city, c.createdAt.slice(0, 10)])) },
    { label: "Factures", run: () => downloadCSV("factures", ["Numéro", "Client", "Émission", "Échéance", "Statut stocké", "HT", "TTC"], data.invoices.map((i) => { const t = documentTotals(i.items); return [i.number, clients.get(i.clientId) ?? "", i.issueDate, i.dueDate, i.baseStatus, csvMoney(t.totalHT), csvMoney(t.totalTTC)]; })) },
    { label: "Paiements", run: () => downloadCSV("paiements", ["Facture", "Date", "Montant", "Moyen", "Référence"], data.payments.map((p) => [data.invoices.find((i) => i.id === p.invoiceId)?.number ?? "", p.date, csvMoney(p.amount), p.method, p.reference])) },
    { label: "Dépenses", run: () => downloadCSV("depenses", ["Date", "Libellé", "Fournisseur", "Catégorie", "HT", "TVA %", "Payée"], data.expenses.map((e) => [e.date, e.label, e.supplier, e.category, csvMoney(e.amountHT), e.vatRate / 100, e.paid ? "oui" : "non"])) },
    { label: "Opportunités", run: () => downloadCSV("opportunites", ["Nom", "Étape", "Montant", "Probabilité", "Clôture estimée"], data.opportunities.map((o) => [o.name, o.stage, csvMoney(o.amount), o.probability, o.expectedCloseDate])) },
    { label: "Projets", run: () => downloadCSV("projets", ["Code", "Nom", "Client", "Statut", "Début", "Échéance", "Prix", "Budget"], data.projects.map((p) => [p.code, p.name, clients.get(p.clientId) ?? "", p.status, p.startDate, p.dueDate, csvMoney(p.salePrice), csvMoney(p.budget)])) },
    { label: "Tâches", run: () => downloadCSV("taches", ["Titre", "Statut", "Priorité", "Échéance", "Estimation h", "Réalisé h"], data.tasks.map((t) => [t.title, t.status, t.priority, t.dueDate ?? "", t.estimateHours, t.actualHours])) },
    { label: "Journal XP", run: () => downloadCSV("journal-xp", ["Date", "XP", "Motif", "Clé d'idempotence"], data.xpTransactions.map((x) => [x.at, x.amount, x.reason, x.idempotencyKey])) },
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>État du mode démonstration</CardTitle>
            <CardDescription>Ce mode n&apos;est pas une configuration de production.</CardDescription>
          </div>
          <Badge tone="gold">Données fictives</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted">Persistance : </span>
            {repositoryKind === "local-demo" ? "navigateur (localStorage), uniquement sur cet appareil" : "Supabase"}
          </p>
          <p>
            <span className="text-muted">Jeu de données : </span>version {data.settings.demo.version}, généré le {formatDateTime(data.settings.demo.seededAt)} (date d&apos;ancrage {formatDate(data.settings.demo.anchorDate)})
          </p>
          <p>
            <span className="text-muted">Volume : </span>
            {data.clients.length} clients, {data.invoices.length} factures, {data.payments.length} paiements, {data.expenses.length} dépenses, {data.tasks.length} tâches
          </p>
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <ShieldAlert className="size-4" /> Limites de sécurité
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Aucune authentification : toute personne utilisant ce navigateur accède aux données.</li>
              <li>Les données sont stockées en clair dans le stockage local et peuvent être effacées par le navigateur.</li>
              <li>Les permissions par rôle sont simulées dans la couche de commandes, pas imposées par un serveur.</li>
              <li>Aucun paiement réel, aucune connexion bancaire et aucun envoi d&apos;e-mail ne sont effectués.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connexions externes</CardTitle>
            <CardDescription>État détecté à partir des variables d&apos;environnement publiques</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Database className="size-4 text-subtle" /> Supabase (PostgreSQL, Auth, RLS)
            </span>
            {ext.supabaseConfigured ? <Badge tone="warning">Variables détectées — synchronisation non activée</Badge> : <Badge>Non configuré</Badge>}
          </div>
          <p className="text-xs text-muted">Le schéma, les politiques RLS et le seed SQL sont fournis dans le dossier « supabase/ ». L&apos;adaptateur applicatif de synchronisation n&apos;est pas encore branché : l&apos;application continue d&apos;utiliser le stockage local, même si les variables sont présentes.</p>
          <div className="flex items-center justify-between gap-3">
            <span>Banque / paiement en ligne</span>
            <Badge>Non disponible</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Envoi d&apos;e-mails (relances, devis)</span>
            <Badge>Non disponible</Badge>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Export</CardTitle>
            <CardDescription>CSV (séparateur « ; », UTF-8) ou sauvegarde JSON complète</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {exports.map((e) => (
              <Button key={e.label} size="sm" variant="secondary" onClick={e.run}>
                <Download /> {e.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => downloadFile(`bdo-software-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json")}>
            <FileJson /> Sauvegarde JSON complète
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Import et réinitialisation</CardTitle>
            <CardDescription>L&apos;import accepte une sauvegarde JSON produite par cette application (vérification de structure).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const parsed: unknown = JSON.parse(await file.text());
                if (!isAppData(parsed)) {
                  toast.error("Fichier incompatible : structure de sauvegarde BDO Software non reconnue.");
                  return;
                }
                confirm({ title: "Importer cette sauvegarde ?", description: "Les données actuelles de ce navigateur seront remplacées.", confirmLabel: "Importer", action: () => { replaceAll(parsed); toast.success("Sauvegarde importée."); } });
              } catch {
                toast.error("Fichier JSON illisible.");
              }
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> Importer une sauvegarde
          </Button>
          <Button variant="danger" onClick={() => confirm({ title: "Réinitialiser le jeu de données ?", description: "Toutes les données de ce navigateur seront remplacées par un nouveau jeu de démonstration (dates recalculées à partir d'aujourd'hui). Action irréversible.", confirmLabel: "Réinitialiser", action: () => { resetDemo(); toast.success("Jeu de démonstration régénéré."); } })}>
            <RotateCcw /> Réinitialiser les données de démo
          </Button>
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}

function RolesTab() {
  const data = useData();
  const run = useCommand();
  const perms = Object.keys(PERMISSION_LABELS) as Permission[];
  const roles = Object.keys(ROLE_PERMISSIONS) as Role[];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rôle de l&apos;utilisateur courant (démonstration)</CardTitle>
            <CardDescription>Changez de rôle pour vérifier les permissions : les commandes refusent les actions non autorisées. En production, le rôle proviendrait de l&apos;authentification Supabase et serait vérifié par les politiques RLS côté serveur.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <NativeSelect aria-label="Rôle simulé" value={data.settings.user.role} onChange={(e) => run(C.switchDemoRole, { role: e.target.value as Role })} className="w-60">
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE[r]}
              </option>
            ))}
          </NativeSelect>
          <span className="text-sm text-muted">Utilisateur : {data.settings.user.name} ({data.settings.user.email})</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Matrice des permissions d&apos;écriture</CardTitle>
            <CardDescription>La lecture est ouverte à tous les membres de l&apos;organisation.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                <th className="py-2 font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r} className="py-2 text-center font-medium">
                    {ROLE[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map((p) => (
                <tr key={p} className="border-b border-border/50">
                  <td className="py-2">{PERMISSION_LABELS[p]}</td>
                  {roles.map((r) => (
                    <td key={r} className="py-2 text-center">
                      {ROLE_PERMISSIONS[r].includes(p) ? <span className="text-success" aria-label="autorisé">●</span> : <span className="text-subtle" aria-label="refusé">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab() {
  const data = useData();
  const logs = [...data.auditLogs].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Journal d&apos;audit</CardTitle>
          <CardDescription>Opérations sensibles : émission/annulation de factures, paiements, suppressions, paramètres, réinitialisations.</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => downloadCSV("audit", ["Date", "Acteur", "Rôle", "Action", "Détails"], logs.map((l) => [l.at, l.actor, l.role, l.action, l.details]))}>
          <Download /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {logs.slice(0, 200).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="w-36 text-[11px] tabular text-subtle">{formatDateTime(l.at)}</span>
              <Badge>{l.action}</Badge>
              <span className="text-muted">
                {l.actor} ({ROLE[l.role]})
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-subtle">{l.details}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
