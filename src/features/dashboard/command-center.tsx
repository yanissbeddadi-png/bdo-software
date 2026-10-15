"use client";
import * as React from "react";
import Link from "next/link";
import { Activity, ArrowRight, Banknote, Building2, Gauge, HandCoins, Landmark, LineChart, PiggyBank, Receipt, Repeat, ShieldCheck, Sparkles, Target, TrendingUp, Trophy, Wallet } from "lucide-react";
import { useData, usePeriod, useSummaries, useToday } from "@/lib/store/hooks";
import { useAppStore } from "@/lib/store/app-store";
import { useProgression } from "@/lib/store/progression";
import { financialSnapshot, monthlySeries, revenueByProductType, expensesByCategory } from "@/lib/calculations/finance";
import { pipelineValue, weightedPipeline } from "@/lib/calculations/pipeline";
import { computeAlerts } from "@/lib/calculations/alerts";
import { evaluateGoal } from "@/lib/calculations/goals";
import { recommendedMissions } from "@/lib/gamification/missions";
import { formatDateLong, formatDateTime, formatEUR, formatInt, formatPercent } from "@/lib/formatters";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { FinancialMetricCard } from "@/components/shared/metric-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/ui/misc";
import { ActivityFeed, AlertCard, QuickActions } from "@/components/dashboard/widgets";
import { BreakdownDonut, CashFlowChart, ChartCard, HorizontalBars, MonthlyLineChart, RevenueChart, SERIES } from "@/components/charts/charts";
import { LevelBadge, MissionCard, XPProgressBar } from "@/components/gamification/progress";
import { MissionActions } from "@/components/gamification/mission-actions";
import { QuickCreateMenu, PeriodSelect } from "@/components/layout/topbar";
import { EmptyState } from "@/components/shared/empty-state";
import { GOAL_STATUS } from "@/lib/formatters/labels";
import { formatXp } from "@/lib/formatters";

const DEF = {
  billed: "Somme HT des factures émises (hors brouillons et annulations) dont la date d'émission est dans la période.",
  collected: "Somme des paiements clients (TTC) enregistrés dans la période. Distinct du CA facturé.",
  cash: "Solde d'ouverture + encaissements − décaissements réalisés jusqu'à la date. Simulation : la TVA n'est pas reversée.",
  receivables: "Soldes restants des factures émises. Le nombre et le montant échus sont indiqués.",
  expenses: "Dépenses engagées (HT) datées dans la période, qu'elles soient payées ou non.",
  result: "Estimation : CA facturé HT − dépenses engagées HT de la période. Ce n'est pas un résultat comptable.",
  margin: "Résultat opérationnel estimé ÷ CA facturé HT. Non calculable si le CA est nul.",
  mrr: "Revenu mensuel récurrent : somme des abonnements actifs ramenés au mois (trimestriel ÷ 3, annuel ÷ 12).",
  arr: "MRR × 12. Estimation annualisée, pas du chiffre d'affaires réalisé.",
  pipeline: "Montants des opportunités ouvertes (non gagnées / non perdues). Jamais compté comme du chiffre d'affaires.",
};

export function CommandCenter() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const updatedAt = useAppStore((s) => s.updatedAt);
  const { period, previous, label } = usePeriod();
  const p = useProgression();
  const [range, setRange] = React.useState<"6" | "12">("12");

  const snap = React.useMemo(() => financialSnapshot(data, summaries, period, previous, today), [data, summaries, period, previous, today]);
  const series = React.useMemo(() => monthlySeries(data, today, 12, summaries), [data, today, summaries]);
  const alerts = React.useMemo(() => computeAlerts(data, today, summaries), [data, today, summaries]);
  const goals = React.useMemo(() => data.goals.filter((g) => !g.archived).map((g) => evaluateGoal(g, data, today, summaries)), [data, today, summaries]);
  const missions = recommendedMissions(data.missions, today, 4);
  const chartSeries = series.slice(range === "6" ? -6 : -12);

  const danger = alerts.filter((a) => a.severity === "danger").length;
  const health = snap.cash < data.settings.company.cashAlertThreshold || danger >= 8 ? { label: "Sous tension", tone: "danger" as const } : danger >= 1 ? { label: "Sous surveillance", tone: "warning" as const } : { label: "Solide", tone: "success" as const };
  const overdueCount = snap.overdueCount;
  const spark = (k: "billed" | "collected" | "cash" | "expenses" | "result" | "mrr") => series.map((m) => m[k]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bonjour, dirigeant."
        description="Voici l'état de votre entreprise aujourd'hui."
        actions={
          <>
            <PeriodSelect className="sm:hidden" />
            <QuickCreateMenu label="Créer" />
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="capitalize">{formatDateLong(today)}</span>
          <span aria-hidden>·</span>
          <span>Période : {label}</span>
          <span aria-hidden>·</span>
          <Badge tone={health.tone}>
            <ShieldCheck /> État général : {health.label}
          </Badge>
          <span className="text-subtle">Dernière mise à jour des données : {updatedAt ? formatDateTime(updatedAt) : "—"}</span>
        </div>
      </PageHeader>

      {/* Progression */}
      {data.settings.gamification.enabled ? (
        <Card className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_1fr]">
            <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--violet)_14%,transparent),transparent_60%)]" aria-hidden />
              <LevelBadge level={p.level.level} size="lg" frameColor={p.frameColor} />
              <div className="relative min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-lg font-semibold text-fg">Niveau {p.level.level} · {p.title}</p>
                  <p className="text-xs tabular text-muted">{formatXp(p.xp)} au total</p>
                </div>
                <XPProgressBar into={p.level.xpIntoLevel} needed={p.level.xpForNext} />
                <p className="text-xs text-muted">
                  Encore <span className="tabular text-fg">{formatInt(p.level.xpForNext - p.level.xpIntoLevel)} XP</span> pour le niveau {p.level.level + 1}
                  {p.nextReward ? (
                    <>
                      {" "}
                      · prochain déblocage : <span className="text-gold">{p.nextReward.name}</span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-px border-t border-border bg-border lg:border-l lg:border-t-0">
              <div className="bg-card p-4">
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Building2 className="size-3.5" /> Rang entreprise
                </p>
                <p className="mt-1 text-sm font-semibold text-fg">
                  {p.rank.rank} · {p.rank.name}
                </p>
                {p.rank.next ? (
                  <>
                    <ProgressBar value={p.rank.progress * 100} tone="gold" className="mt-2" label="Progression vers le rang suivant" />
                    <p className="mt-1 text-[11px] text-subtle">
                      {p.rank.next.metCount}/{p.rank.next.criteria.length} critères pour « {p.rank.next.name} »
                    </p>
                  </>
                ) : null}
              </div>
              <Link href="/missions" className="bg-card p-4 hover:bg-interactive/40">
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Target className="size-3.5" /> Missions terminées
                </p>
                <p className="mt-1 text-2xl font-semibold tabular text-fg">{p.missionsDone}</p>
              </Link>
              <Link href="/progression?tab=succes" className="bg-card p-4 hover:bg-interactive/40">
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Trophy className="size-3.5" /> Succès
                </p>
                <p className="mt-1 text-2xl font-semibold tabular text-gold">
                  {p.achievementsCount}
                  <span className="text-sm text-subtle">/{p.achievementsTotal}</span>
                </p>
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Indicateurs financiers */}
      <section aria-labelledby="kpi-title">
        <SectionTitle title="Indicateurs financiers" description={`${label} — comparaison avec la période précédente de même durée.`} actions={<Link href="/finances" className="text-xs text-accent hover:underline">Module Finances →</Link>} />
        <h2 id="kpi-title" className="sr-only">Indicateurs financiers</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <FinancialMetricCard label="Chiffre d'affaires facturé" icon={<Receipt />} value={snap.current.billed} previous={snap.previous.billed} series={spark("billed")} definition={DEF.billed} href="/finances/factures" />
          <FinancialMetricCard label="Chiffre d'affaires encaissé" icon={<HandCoins />} value={snap.current.collected} previous={snap.previous.collected} series={spark("collected")} definition={DEF.collected} href="/finances/factures" />
          <FinancialMetricCard label="Trésorerie disponible" icon={<Landmark />} value={snap.cash} previous={snap.cashPrevious} series={spark("cash")} definition={DEF.cash} href="/finances/tresorerie" comparisonLabel="vs fin de période précédente" />
          <FinancialMetricCard label="Factures clients impayées" icon={<Banknote />} value={snap.receivables} definition={DEF.receivables} href="/finances/factures?status=overdue" good="down" />
          <FinancialMetricCard label="Dépenses de la période" icon={<Wallet />} value={snap.current.expenses} previous={snap.previous.expenses} series={spark("expenses")} good="down" definition={DEF.expenses} href="/finances/depenses" />
          <FinancialMetricCard label="Résultat opérationnel estimé" icon={<TrendingUp />} value={snap.current.operatingResult} previous={snap.previous.operatingResult} series={spark("result")} definition={DEF.result} href="/analyses" />
          <FinancialMetricCard
            label="Marge opérationnelle"
            icon={<Gauge />}
            value={snap.current.operatingMargin === null ? null : Math.round(snap.current.operatingMargin * 10) / 10}
            previous={snap.previous.operatingMargin === null ? null : Math.round(snap.previous.operatingMargin * 10) / 10}
            money={false}
            formatValue={(v) => formatPercent(v)}
            missing="Non calculable (CA nul)"
            definition={DEF.margin}
            href="/analyses"
          />
          <FinancialMetricCard label="MRR" icon={<Repeat />} value={snap.mrr} previous={snap.mrrPrevious} series={spark("mrr")} definition={DEF.mrr} href="/finances/abonnements" comparisonLabel="vs fin de période précédente" />
          <FinancialMetricCard label="ARR (estimation)" icon={<LineChart />} value={snap.arr} previous={snap.mrrPrevious * 12} definition={DEF.arr} href="/finances/abonnements" comparisonLabel="vs fin de période précédente" />
          <FinancialMetricCard label="Pipeline commercial" icon={<PiggyBank />} value={pipelineValue(data.opportunities)} definition={`${DEF.pipeline} Valeur pondérée : ${formatEUR(weightedPipeline(data.opportunities))}.`} href="/crm" />
        </div>
        {overdueCount ? (
          <p className="mt-2 text-xs text-danger">
            {overdueCount} facture(s) échue(s) pour {formatEUR(snap.overdueReceivables)} —{" "}
            <Link href="/finances/factures?status=overdue" className="underline">
              voir les factures en retard
            </Link>
          </p>
        ) : null}
      </section>

      {/* Alertes + missions */}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <section>
          <SectionTitle title="Alertes prioritaires" description={`${alerts.length} alerte(s) déterminée(s) par des règles configurables`} actions={<Link href="/operations?tab=risques" className="text-xs text-accent hover:underline">Toutes les alertes →</Link>} />
          {alerts.length ? (
            <div className="space-y-2">
              {alerts.slice(0, 7).map((a) => (
                <AlertCard key={a.key} alert={a} />
              ))}
            </div>
          ) : (
            <EmptyState title="Aucune alerte" description="Aucune situation ne nécessite votre attention." icon={<ShieldCheck />} />
          )}
        </section>
        <section>
          <SectionTitle title="Missions du jour" description="Recommandées à partir de vos données" actions={<Link href="/missions" className="text-xs text-accent hover:underline">Centre de missions →</Link>} />
          {missions.length ? (
            <div className="space-y-2.5">
              {missions.map((m) => (
                <MissionCard key={m.id} mission={m} today={today} compact action={<MissionActions mission={m} />} />
              ))}
            </div>
          ) : (
            <EmptyState title="Aucune mission active" description="Toutes les missions sont terminées. Bravo !" icon={<Sparkles />} />
          )}
        </section>
      </div>

      {/* Graphiques */}
      <section className="space-y-4">
        <SectionTitle
          title="Tendances"
          description="Graphiques construits à partir des factures, paiements, dépenses, abonnements et clients."
          actions={
            <Segmented
              label="Plage des graphiques"
              value={range}
              onChange={setRange}
              options={[
                { value: "6", label: "6 mois" },
                { value: "12", label: "12 mois" },
              ]}
            />
          }
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Évolution du chiffre d'affaires" description="CA facturé HT et encaissements TTC par mois">
            <RevenueChart data={chartSeries} />
          </ChartCard>
          <ChartCard title="Encaissements et décaissements" description="Flux de trésorerie réalisés par mois">
            <CashFlowChart data={chartSeries} />
          </ChartCard>
          <ChartCard title="Évolution de la trésorerie" description="Solde en fin de mois (flux réalisés uniquement)">
            <MonthlyLineChart area data={chartSeries} series={[{ key: "cash", label: "Trésorerie", color: SERIES[0] }]} />
          </ChartCard>
          <ChartCard title="Évolution du nombre de clients" description="Clients non perdus créés à la fin de chaque mois">
            <MonthlyLineChart money={false} data={chartSeries} series={[{ key: "clients", label: "Clients", color: SERIES[2] }]} />
          </ChartCard>
          <ChartCard title="Revenus par activité" description={`CA facturé HT par type d'offre — ${label.toLowerCase()}`} height={220}>
            <BreakdownDonut items={revenueByProductType(data, summaries, period).map((r) => ({ key: r.key, label: r.label, value: r.value }))} />
          </ChartCard>
          <ChartCard title="Dépenses par catégorie" description={`Dépenses engagées HT — ${label.toLowerCase()}`} height={220}>
            <BreakdownDonut items={expensesByCategory(data.expenses, period).map((r) => ({ key: r.key, label: r.label, value: r.value }))} />
          </ChartCard>
        </div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Progression des objectifs</CardTitle>
              <CardDescription>Objectifs actifs ; les mesures automatiques sont recalculées depuis les données</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/objectifs">
                Objectifs <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              {goals.map((g) => (
                <li key={g.goal.id}>
                  <Link href={`/objectifs?focus=${g.goal.id}`} className="block rounded-lg p-1 hover:bg-interactive/40">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-fg">{g.goal.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</Badge>
                        <span className="w-10 text-right tabular text-muted">{Math.round(g.progress)} %</span>
                      </span>
                    </div>
                    <ProgressBar value={g.progress} tone={g.status === "achieved" ? "gold" : g.status === "at_risk" ? "danger" : "accent"} label={g.goal.title} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Activité + actions rapides */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <section>
          <SectionTitle title="Fil d'activité" description="Derniers événements enregistrés" />
          <Card>
            <CardContent className="pt-4">
              <ActivityFeed events={data.activity} limit={9} />
            </CardContent>
          </Card>
        </section>
        <section>
          <SectionTitle title="Actions rapides" />
          <QuickActions />
          <div className="mt-6">
            <SectionTitle title="Top clients de la période" description="CA facturé HT" />
            <Card>
              <CardContent className="pt-4">
                <TopClients />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-subtle">
        <Activity className="size-3" /> Les indicateurs sont calculés à partir des données de démonstration (fictives). L&apos;XP est une unité ludique et ne représente jamais de l&apos;argent.
      </p>
    </div>
  );
}

function TopClients() {
  const data = useData();
  const summaries = useSummaries();
  const { period } = usePeriod();
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const totals = new Map<string, number>();
  for (const s of summaries) {
    if (s.invoice.baseStatus !== "issued" || s.invoice.issueDate < period.start || s.invoice.issueDate > period.end) continue;
    totals.set(s.invoice.clientId, (totals.get(s.invoice.clientId) ?? 0) + s.totalHT);
  }
  const items = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, value]) => ({ key: id, label: clients.get(id) ?? "—", value }));
  return <HorizontalBars items={items} />;
}
