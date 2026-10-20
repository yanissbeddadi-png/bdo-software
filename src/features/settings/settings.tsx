"use client";
import * as React from "react";
import { Database, Download, Eraser, FileJson, ImageUp, Plus, RotateCcw, Save, ShieldAlert, Trash2, Upload } from "lucide-react";
import type { BrandingSettings, CompanySettings, CrmSettings, ModuleKey, Role, RuleSettings, XpRuleKey } from "@/lib/domain/types";
import Link from "next/link";
import { useAccess, useCommand, useData } from "@/lib/store/hooks";
import { useAppStore, repositoryKind } from "@/lib/store/app-store";
import { UsersAdmin } from "./users-admin";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { externalConnections, isAppData } from "@/lib/database/repository";
import { DEFAULT_XP_REWARDS, defaultCrmSettings } from "@/lib/database/seed";
import { MODULES } from "@/lib/domain/modules";
import { MAX_LOGO_LENGTH } from "@/lib/domain/commands/settings";
import { DEFAULT_STAGES } from "@/lib/calculations/pipeline";
import { BrandMark, BrandTagline, brandStyle } from "@/components/layout/brand";
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
  mission_daily: "Défi quotidien relevé",
  goal_intermediate: "Objectif à 50 %",
  goal_major: "Objectif atteint",
  project_done: "Projet terminé",
  client_validated: "Nouveau client validé (1re facture payée ou contrat actif)",
  opportunity_won: "Conversion : opportunité gagnée (une fois par opportunité)",
  crm_prospect_qualified: "Prospect qualifié",
  crm_contact_completed: "Fiche contact complète (entreprise, fonction, e-mail, téléphone)",
  crm_call_logged: "Appel consigné",
  crm_followup_done: "Relance planifiée réalisée",
  crm_mission_done: "Mission CRM terminée",
  crm_meeting_report: "Rendez-vous réalisé avec compte rendu",
  crm_opportunity_qualified: "Opportunité qualifiée (passage en discussion)",
  crm_week_on_track: "Semaine avec tous les suivis à jour",
  invoice_paid: "Facture payée intégralement (hors abonnements)",
  achievement_common: "Succès commun",
  achievement_rare: "Succès rare",
  achievement_epic: "Succès épique",
  achievement_legendary: "Succès légendaire",
};

export function SettingsPage() {
  const tabParam = useParam("tab");
  const [tab, setTab] = useSyncedState(tabParam ?? "crm");
  const { restricted } = useAccess();
  if (restricted)
    return (
      <div className="space-y-6">
        <PageHeader title="Paramètres" description="Votre compte. Les règles et réglages de l'équipe sont gérés par le directeur commercial." />
        <UsersAdmin />
      </div>
    );
  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Configuration de l'espace : identité de l'entreprise, pipeline et règles CRM, modules, équipe et accès, données." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="entreprise">Entreprise</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="preferences">Préférences</TabsTrigger>
          <TabsTrigger value="gamification">Gamification et règles</TabsTrigger>
          <TabsTrigger value="donnees">Données</TabsTrigger>
          <TabsTrigger value="roles">Utilisateurs et rôles</TabsTrigger>
          <TabsTrigger value="audit">Journal d&apos;audit</TabsTrigger>
        </TabsList>
        <TabsContent value="crm">
          <CrmTab />
        </TabsContent>
        <TabsContent value="entreprise">
          <CompanyTab />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab />
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

const WEEKDAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

/** Modules conservés hors de la navigation principale (données intactes, toujours utilisables). */
const LEGACY_MODULES: { href: string; label: string; hint: string; module?: ModuleKey }[] = [
  { href: "/equipe", label: "Équipe", hint: "Fiches collaborateurs et charge" },
  { href: "/finances", label: "Finances", hint: "Factures, avoirs, dépenses, trésorerie, TVA, abonnements", module: "finance" },
  { href: "/crm/devis", label: "Propositions commerciales", hint: "Devis liés aux opportunités", module: "quotes" },
  { href: "/projets", label: "Projets", hint: "Projets clients et livrables", module: "projects" },
  { href: "/taches", label: "Tâches internes", hint: "Tâches hors CRM (projets, administratif)", module: "projects" },
  { href: "/catalogue", label: "Produits et services", hint: "Catalogue et tarifs", module: "catalog" },
  { href: "/objectifs", label: "Objectifs", hint: "Objectifs chiffrés suivis automatiquement", module: "goals" },
  { href: "/analyses", label: "Analyses financières", hint: "Indicateurs financiers historiques", module: "analytics" },
  { href: "/operations", label: "Opérations", hint: "Risques, notes et alertes", module: "operations" },
  { href: "/notifications", label: "Notifications", hint: "Centre de notifications" },
  { href: "/bureaux", label: "Bureaux 3D", hint: "Visualisation de l'entreprise", module: "offices" },
];

function CrmTab() {
  const data = useData();
  const run = useCommand();
  const [c, setC] = React.useState<CrmSettings>(data.settings.crm);
  const set = <K extends keyof CrmSettings>(k: K, v: CrmSettings[K]) => setC((s) => ({ ...s, [k]: v }));
  const supabase = externalConnections().supabaseConfigured;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          run(C.updateCrmSettings, c);
        }}
      >
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Règles de suivi et automatisations</CardTitle>
              <CardDescription>
                Seuils utilisés par le centre d&apos;action, les notifications et les statistiques. Les automatisations sont locales, déterministes et ne créent jamais deux fois la même alerte.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact inactif après (jours)" htmlFor="crm-inactive" help="Aucune interaction depuis ce délai : signalé dans le centre d'action.">
              <Input id="crm-inactive" type="number" min={1} max={365} value={c.inactivityDays} onChange={(e) => set("inactivityDays", Number(e.target.value))} />
            </Field>
            <Field label="Proposition sans réponse après (jours)" htmlFor="crm-proposal">
              <Input id="crm-proposal" type="number" min={1} max={120} value={c.proposalPendingDays} onChange={(e) => set("proposalPendingDays", Number(e.target.value))} />
            </Field>
            <Field label="Prospect « nouveau » pendant (jours)" htmlFor="crm-new" help="Sans interaction : il apparaît dans « Nouveaux prospects à traiter ».">
              <Input id="crm-new" type="number" min={1} max={60} value={c.newProspectDays} onChange={(e) => set("newProspectDays", Number(e.target.value))} />
            </Field>
            <Field label="Appels récompensés par jour (XP)" htmlFor="crm-calls" help="Au-delà, les appels sont consignés sans XP (anti-abus).">
              <Input id="crm-calls" type="number" min={0} max={100} value={c.dailyCallXpCap} onChange={(e) => set("dailyCallXpCap", Number(e.target.value))} />
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-xs font-medium text-muted">Jours ouvrés (séries et semaines rigoureuses)</legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => (
                  <label key={d.value} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={c.workingDays.includes(d.value)}
                      onChange={(e) => set("workingDays", e.target.checked ? [...c.workingDays, d.value] : c.workingDays.filter((x) => x !== d.value))}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-subtle">Un jour non ouvré n&apos;interrompt jamais une série ; une action ce jour-là compte en bonus.</p>
            </fieldset>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Étapes du pipeline</CardTitle>
              <CardDescription>Renommez les étapes selon le cycle de vente du client et fixez la probabilité proposée à chaque étape. Gagné et perdu restent à 100 % et 0 %.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {DEFAULT_STAGES.map((st) => {
              const v = c.stages[st.id];
              const fixed = st.id === "won" || st.id === "lost";
              return (
                <div key={st.id} className="grid grid-cols-[12px_1fr_96px] items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: st.color }} aria-hidden />
                  <Input aria-label={`Libellé de l'étape ${st.label}`} value={v.label} maxLength={40} onChange={(e) => set("stages", { ...c.stages, [st.id]: { ...v, label: e.target.value } })} />
                  <div className="relative">
                    <Input
                      aria-label={`Probabilité de l'étape ${st.label} (%)`}
                      type="number"
                      min={0}
                      max={100}
                      disabled={fixed}
                      className="pr-7 text-right tabular"
                      value={v.probability}
                      onChange={(e) => set("stages", { ...c.stages, [st.id]: { ...v, probability: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } })}
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                  </div>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => set("stages", defaultCrmSettings().stages)}>
              <RotateCcw /> Libellés par défaut
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sources de contacts</CardTitle>
              <CardDescription>Proposées à la création d&apos;un contact et dans les filtres. Les contacts existants gardent leur source.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {c.sources.map((src, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <Input
                  aria-label={`Source ${i + 1}`}
                  value={src}
                  maxLength={60}
                  onChange={(e) =>
                    set(
                      "sources",
                      c.sources.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer la source ${src}`}
                  disabled={c.sources.length <= 1}
                  onClick={() =>
                    set(
                      "sources",
                      c.sources.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={c.sources.length >= 30} onClick={() => set("sources", [...c.sources, "Nouvelle source"])}>
              <Plus /> Ajouter une source
            </Button>
          </CardContent>
        </Card>
        <Button type="submit" variant="primary">
          <Save /> Enregistrer les réglages CRM
        </Button>
      </form>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Intégrations</CardTitle>
              <CardDescription>État réel des connexions externes.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: "Messagerie (envoi / réception d'e-mails)", ok: false },
              { label: "Agenda externe (Google, Outlook…)", ok: false },
              { label: "Téléphonie", ok: false },
              { label: "Base de données Supabase", ok: supabase },
            ].map((i) => (
              <div key={i.label} className="flex items-center justify-between gap-2">
                <span>{i.label}</span>
                <Badge tone={i.ok ? "success" : "neutral"}>{i.ok ? "Configurée" : "Non configurée"}</Badge>
              </div>
            ))}
            <p className="pt-2 text-[11px] text-subtle">
              Sans intégration, l&apos;application n&apos;envoie aucun e-mail et ne crée aucun rendez-vous externe : les interactions sont consignées manuellement et les rappels restent internes.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Autres modules</CardTitle>
              <CardDescription>Hors de la navigation principale. Activez ou masquez-les dans l&apos;onglet Modules.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 sm:grid-cols-2">
              {LEGACY_MODULES.filter((m) => !m.module || data.settings.modules[m.module]).map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className="block rounded-lg px-2 py-1.5 hover:bg-interactive">
                    <span className="text-sm text-fg">{m.label}</span>
                    <span className="block text-[11px] text-muted">{m.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompanyTab() {
  const data = useData();
  const run = useCommand();
  const [c, setC] = React.useState<CompanySettings>(data.settings.company);
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setC((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-6">
      <BrandingCard />
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
              <CardTitle>Coordonnées</CardTitle>
              <CardDescription>Nom affiché dans l&apos;espace, raison sociale et coordonnées de l&apos;entreprise.</CardDescription>
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
                  <Input
                    aria-label="Libellé du taux"
                    value={r.label}
                    onChange={(e) =>
                      set(
                        "vatRates",
                        c.vatRates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    aria-label="Taux en %"
                    inputMode="decimal"
                    className="text-right tabular"
                    value={String(r.rate / 100).replace(".", ",")}
                    onChange={(e) =>
                      set(
                        "vatRates",
                        c.vatRates.map((x, j) => (j === i ? { ...x, rate: Math.round(Number(e.target.value.replace(",", ".")) * 100) } : x)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Supprimer le taux"
                    disabled={c.vatRates.length <= 1}
                    onClick={() =>
                      set(
                        "vatRates",
                        c.vatRates.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set("vatRates", [...c.vatRates, { id: `vat-${Date.now()}`, label: "Nouveau taux", rate: 0 }])}>
                <Plus /> Ajouter un taux
              </Button>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Début du suivi des déclarations"
                  htmlFor="c-vatstart"
                  help={data.vatReturns.length ? "Verrouillé : des déclarations existent." : "Premier mois déclaré (régime des encaissements, mensuel)."}
                >
                  <Input id="c-vatstart" type="date" value={c.vatTrackingStart} disabled={data.vatReturns.length > 0} onChange={(e) => set("vatTrackingStart", e.target.value)} />
                </Field>
                <Field label="Jour d'échéance (mois suivant)" htmlFor="c-vatday" help="Entre 1 et 28.">
                  <Input id="c-vatday" type="number" min={1} max={28} value={c.vatDueDay} onChange={(e) => set("vatDueDay", Number(e.target.value))} />
                </Field>
              </div>
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
    </div>
  );
}

/** Identité visuelle de l'espace : logo téléversé (stocké avec les données), couleur, marque BDO. */
function BrandingCard() {
  const data = useData();
  const run = useCommand();
  const [b, setB] = React.useState<BrandingSettings>(data.settings.branding);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const brand = { ...b, name: data.settings.company.name };
  const validColor = /^#[0-9a-fA-F]{6}$/.test(b.color);
  const pickLogo = async (file: File) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast.error("Format non pris en charge : PNG, JPEG, WebP ou SVG.");
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    if (url.length > MAX_LOGO_LENGTH) {
      toast.error("Logo trop lourd : 300 Ko maximum.");
      return;
    }
    setB((x) => ({ ...x, logo: url }));
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Identité visuelle</CardTitle>
          <CardDescription>Logo et couleur de l&apos;espace : barre latérale, page de connexion, boutons et accents.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Field label="Logo" htmlFor="b-logo" help="PNG, JPEG, WebP ou SVG, 300 Ko maximum. Un format horizontal sur fond transparent rend le mieux.">
            <div className="flex flex-wrap gap-2">
              <input
                id="b-logo"
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickLogo(file).catch(() => toast.error("Image illisible."));
                }}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <ImageUp /> {b.logo ? "Changer le logo" : "Choisir une image"}
              </Button>
              {b.logo ? (
                <Button variant="ghost" onClick={() => setB((x) => ({ ...x, logo: null }))}>
                  <Trash2 /> Retirer le logo
                </Button>
              ) : null}
            </div>
          </Field>
          <Field label="Couleur principale" htmlFor="b-color" help="Format #RRGGBB. Le texte des boutons passe automatiquement en noir sur une couleur claire.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Sélecteur de couleur"
                value={validColor ? b.color : "#000000"}
                onChange={(e) => setB((x) => ({ ...x, color: e.target.value.toUpperCase() }))}
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-card p-0.5"
              />
              <Input id="b-color" value={b.color} maxLength={7} className="w-32 font-mono uppercase" onChange={(e) => setB((x) => ({ ...x, color: e.target.value.trim() }))} />
            </div>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={b.bdoMark} onCheckedChange={(v) => setB((x) => ({ ...x, bdoMark: v }))} aria-label="Marque BDO par défaut" />
            Sans logo, afficher la marque BDO (sinon les initiales de l&apos;entreprise)
          </label>
          <Button variant="primary" disabled={!validColor} onClick={() => run(C.updateBranding, b)}>
            <Save /> Enregistrer l&apos;identité visuelle
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-bg p-4" style={validColor ? brandStyle(b.color) : undefined}>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-subtle">Aperçu</p>
          <div className="flex items-center gap-3">
            <BrandMark brand={brand} />
            <BrandTagline brand={brand} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="inline-flex rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent">Bouton principal</span>
            <span className="text-xs font-medium text-accent">Lien</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Modules affichés pour ce client ; les données des modules masqués sont conservées. */
function ModulesTab() {
  const data = useData();
  const run = useCommand();
  const g = data.settings.gamification;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Modules de l&apos;espace</CardTitle>
            <CardDescription>
              Le CRM (pipeline, contacts, entreprises, missions, calendrier, activités, statistiques), l&apos;équipe et les paramètres sont toujours disponibles. Un module désactivé disparaît des
              menus ; ses données éventuelles sont conservées.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {MODULES.map((m) => (
            <label key={m.key} className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
              <span>
                <span className="block text-sm text-fg">{m.label}</span>
                <span className="block text-[11px] text-muted">{m.hint}</span>
              </span>
              <Switch checked={data.settings.modules[m.key]} onCheckedChange={(v) => run(C.updateModules, { [m.key]: v })} aria-label={`Module ${m.label}`} />
            </label>
          ))}
          <label className="flex items-center justify-between gap-4 py-2.5">
            <span>
              <span className="block text-sm text-fg">Gamification</span>
              <span className="block text-[11px] text-muted">Niveaux, XP, succès, défis et page Progression</span>
            </span>
            <Switch checked={g.enabled} onCheckedChange={(v) => run(C.updateGamificationSettings, { enabled: v })} aria-label="Module Gamification" />
          </label>
        </CardContent>
      </Card>
    </div>
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
            <CardDescription>
              Permet de « voyager dans le temps » : échéances, retards, missions et prévisions sont recalculés par rapport à cette date. Laisser vide pour utiliser la date du jour.
            </CardDescription>
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
  const [vals, setVals] = React.useState({
    dailyInvoiceXpCap: g.dailyInvoiceXpCap,
    dailyCustomMissionXpCap: g.dailyCustomMissionXpCap,
    staleOpportunityDays: g.staleOpportunityDays,
    weeklyProspectingTarget: g.weeklyProspectingTarget,
  });
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
            <Button
              variant="danger"
              onClick={() =>
                confirm({
                  title: "Réinitialiser la progression ?",
                  description: `${formatInt(data.xpTransactions.reduce((s, x) => s + x.amount, 0))} XP et le journal de progression seront effacés. Cette action est journalisée et irréversible.`,
                  confirmLabel: "Réinitialiser",
                  action: () => run(C.resetProgression, undefined),
                })
              }
            >
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
  const resetWorkspace = useAppStore((s) => s.resetWorkspace);
  const replaceAll = useAppStore((s) => s.replaceAll);
  const { confirm, dialog } = useConfirm();
  const ext = externalConnections();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const exports: { label: string; run: () => void }[] = [
    {
      label: "Clients",
      run: () =>
        downloadCSV(
          "clients",
          ["Nom", "Secteur", "Statut", "Ville", "Créé le"],
          data.clients.map((c) => [c.name, c.sector, c.status, c.city, c.createdAt.slice(0, 10)]),
        ),
    },
    {
      label: "Factures",
      run: () =>
        downloadCSV(
          "factures",
          ["Numéro", "Client", "Émission", "Échéance", "Statut stocké", "HT", "TTC"],
          data.invoices.map((i) => {
            const t = documentTotals(i.items);
            return [i.number, clients.get(i.clientId) ?? "", i.issueDate, i.dueDate, i.baseStatus, csvMoney(t.totalHT), csvMoney(t.totalTTC)];
          }),
        ),
    },
    {
      label: "Paiements",
      run: () =>
        downloadCSV(
          "paiements",
          ["Facture", "Date", "Montant", "Moyen", "Référence"],
          data.payments.map((p) => [data.invoices.find((i) => i.id === p.invoiceId)?.number ?? "", p.date, csvMoney(p.amount), p.method, p.reference]),
        ),
    },
    {
      label: "Dépenses",
      run: () =>
        downloadCSV(
          "depenses",
          ["Date", "Libellé", "Fournisseur", "Catégorie", "HT", "TVA %", "Payée"],
          data.expenses.map((e) => [e.date, e.label, e.supplier, e.category, csvMoney(e.amountHT), e.vatRate / 100, e.paid ? "oui" : "non"]),
        ),
    },
    {
      label: "Avoirs",
      run: () =>
        downloadCSV(
          "avoirs",
          ["Numéro", "Facture", "Client", "Date", "Motif", "HT", "TTC"],
          data.creditNotes.map((c) => {
            const t = documentTotals(c.items);
            return [c.number, data.invoices.find((i) => i.id === c.invoiceId)?.number ?? "", clients.get(c.clientId) ?? "", c.issueDate, c.reason, csvMoney(t.totalHT), csvMoney(t.totalTTC)];
          }),
        ),
    },
    {
      label: "Remboursements",
      run: () =>
        downloadCSV(
          "remboursements",
          ["Facture", "Date", "Montant", "Moyen", "Référence"],
          data.refunds.map((r) => [data.invoices.find((i) => i.id === r.invoiceId)?.number ?? "", r.date, csvMoney(r.amount), r.method, r.reference]),
        ),
    },
    {
      label: "Déclarations de TVA",
      run: () =>
        downloadCSV(
          "declarations-tva",
          ["Période", "Collectée", "Déductible", "Crédit reporté", "Net", "Statut", "Échéance", "Payée le", "Référence"],
          data.vatReturns.map((v) => [v.period, csvMoney(v.collected), csvMoney(v.deductible), csvMoney(v.creditCarriedIn), csvMoney(v.net), v.status, v.dueDate, v.paidDate ?? "", v.reference]),
        ),
    },
    {
      label: "Opportunités",
      run: () =>
        downloadCSV(
          "opportunites",
          ["Nom", "Étape", "Montant", "Probabilité", "Clôture estimée"],
          data.opportunities.map((o) => [o.name, o.stage, csvMoney(o.amount), o.probability, o.expectedCloseDate]),
        ),
    },
    {
      label: "Projets",
      run: () =>
        downloadCSV(
          "projets",
          ["Code", "Nom", "Client", "Statut", "Début", "Échéance", "Prix", "Budget"],
          data.projects.map((p) => [p.code, p.name, clients.get(p.clientId) ?? "", p.status, p.startDate, p.dueDate, csvMoney(p.salePrice), csvMoney(p.budget)]),
        ),
    },
    {
      label: "Tâches",
      run: () =>
        downloadCSV(
          "taches",
          ["Titre", "Statut", "Priorité", "Échéance", "Estimation h", "Réalisé h"],
          data.tasks.map((t) => [t.title, t.status, t.priority, t.dueDate ?? "", t.estimateHours, t.actualHours]),
        ),
    },
    {
      label: "Journal XP",
      run: () =>
        downloadCSV(
          "journal-xp",
          ["Date", "XP", "Motif", "Clé d'idempotence"],
          data.xpTransactions.map((x) => [x.at, x.amount, x.reason, x.idempotencyKey]),
        ),
    },
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
            {repositoryKind === "local-demo" ? "navigateur (localStorage), uniquement sur cet appareil" : "Supabase — données partagées par toute l'équipe, accès par compte"}
          </p>
          <p>
            <span className="text-muted">Jeu de données : </span>version {data.settings.demo.version}, généré le {formatDateTime(data.settings.demo.seededAt)} (date d&apos;ancrage{" "}
            {formatDate(data.settings.demo.anchorDate)})
          </p>
          <p>
            <span className="text-muted">Volume : </span>
            {data.clients.length} clients, {data.invoices.length} factures, {data.payments.length} paiements, {data.creditNotes.length} avoirs, {data.vatReturns.length} déclarations de TVA,{" "}
            {data.expenses.length} dépenses, {data.tasks.length} tâches
          </p>
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <ShieldAlert className="size-4" /> Limites de sécurité
            </p>
            {repositoryKind === "local-demo" ? (
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Aucune authentification : toute personne utilisant ce navigateur accède aux données.</li>
                <li>Les données sont stockées en clair dans le stockage local et peuvent être effacées par le navigateur.</li>
                <li>Les permissions par rôle sont simulées dans la couche de commandes, pas imposées par un serveur.</li>
                <li>Aucun paiement réel, aucune connexion bancaire et aucun envoi d&apos;e-mail ne sont effectués.</li>
              </ul>
            ) : (
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Version de test : utilisez des données fictives, pas de vraies données clients.</li>
                <li>Chaque action est authentifiée et son rôle vérifié par le serveur ; les navigateurs n&apos;ont qu&apos;un accès en lecture à la base.</li>
                <li>Aucun paiement réel, aucune connexion bancaire et aucun envoi d&apos;e-mail ne sont effectués.</li>
              </ul>
            )}
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
          <p className="text-xs text-muted">
            Le schéma, les politiques RLS et le seed SQL sont fournis dans le dossier « supabase/ ». L&apos;adaptateur applicatif de synchronisation n&apos;est pas encore branché : l&apos;application
            continue d&apos;utiliser le stockage local, même si les variables sont présentes.
          </p>
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
                confirm({
                  title: "Importer cette sauvegarde ?",
                  description: repositoryKind === "local-demo" ? "Les données actuelles de ce navigateur seront remplacées." : "Les données de toute l'équipe seront remplacées.",
                  confirmLabel: "Importer",
                  action: () => {
                    replaceAll(parsed);
                    if (repositoryKind === "local-demo") toast.success("Sauvegarde importée.");
                  },
                });
              } catch {
                toast.error("Fichier JSON illisible.");
              }
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> Importer une sauvegarde
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              confirm({
                title: "Charger les données de démonstration ?",
                description:
                  repositoryKind === "local-demo"
                    ? "Les données de ce navigateur seront remplacées par un jeu de démonstration (dates recalculées à partir d'aujourd'hui). Le nom, l'identité visuelle et les modules sont conservés. Action irréversible."
                    : "Les données de TOUTE L'ÉQUIPE seront remplacées par un jeu de démonstration réparti entre les collaborateurs. Le nom, l'identité visuelle, les modules et les comptes sont conservés. Action irréversible.",
                confirmLabel: "Charger la démonstration",
                action: () => {
                  resetWorkspace("demo");
                  if (repositoryKind === "local-demo") toast.success("Jeu de démonstration chargé.");
                },
              })
            }
          >
            <RotateCcw /> Charger les données de démo
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              confirm({
                title: "Vider l'espace ?",
                description:
                  "Toutes les données commerciales et financières (entreprises, contacts, opportunités, missions, factures…) seront supprimées. Les réglages, l'identité visuelle, l'équipe et les comptes sont conservés. Exportez une sauvegarde avant. Action irréversible.",
                confirmLabel: "Vider l'espace",
                action: () => {
                  resetWorkspace("empty");
                  if (repositoryKind === "local-demo") toast.success("Espace vidé : réglages et équipe conservés.");
                },
              })
            }
          >
            <Eraser /> Vider l&apos;espace
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
  const mode = useAppStore((s) => s.mode);
  return (
    <div className="space-y-6">
      {mode === "cloud" ? (
        <UsersAdmin />
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Rôle de l&apos;utilisateur courant (démonstration)</CardTitle>
              <CardDescription>
                Changez de rôle pour vérifier les permissions : les commandes refusent les actions non autorisées. En production, le rôle proviendrait de l&apos;authentification Supabase et serait
                vérifié par les politiques RLS côté serveur.
              </CardDescription>
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
            <span className="text-sm text-muted">
              Utilisateur : {data.settings.user.name} ({data.settings.user.email})
            </span>
          </CardContent>
        </Card>
      )}
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
                      {ROLE_PERMISSIONS[r].includes(p) ? (
                        <span className="text-success" aria-label="autorisé">
                          ●
                        </span>
                      ) : (
                        <span className="text-subtle" aria-label="refusé">
                          —
                        </span>
                      )}
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
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            downloadCSV(
              "audit",
              ["Date", "Acteur", "Rôle", "Action", "Détails"],
              logs.map((l) => [l.at, l.actor, l.role, l.action, l.details]),
            )
          }
        >
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
