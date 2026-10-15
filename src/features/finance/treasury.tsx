"use client";
import * as React from "react";
import { ClipboardCheck, Landmark, TriangleAlert } from "lucide-react";
import { useCommand, useData, useSummaries, useToday } from "@/lib/store/hooks";
import { buildForecast, SCENARIOS, type ForecastItemKind, type ScenarioKey } from "@/lib/calculations/cashflow";
import { monthlySeries, receivables, payables } from "@/lib/calculations/finance";
import { formatDate, formatDateTime, formatEUR, formatMonth } from "@/lib/formatters";
import { recordCashReview } from "@/lib/domain/commands";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { ChartCard, MonthlyLineChart, SERIES } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<ForecastItemKind, string> = {
  invoice: "Facture à encaisser",
  overdue_invoice: "Recouvrement (facture échue)",
  subscription: "Abonnement à facturer",
  pipeline: "Pipeline pondéré",
  expense: "Dépense saisie à payer",
  recurring_cost: "Charge récurrente estimée",
  variable_cost: "Charges variables estimées",
};

export function TreasuryPage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const run = useCommand();
  const [scenario, setScenario] = React.useState<ScenarioKey>("central");
  const forecasts = React.useMemo(
    () => ({
      prudent: buildForecast(data, today, "prudent", 6, summaries),
      central: buildForecast(data, today, "central", 6, summaries),
      optimistic: buildForecast(data, today, "optimistic", 6, summaries),
    }),
    [data, today, summaries],
  );
  const history = React.useMemo(() => monthlySeries(data, today, 7, summaries), [data, today, summaries]);
  const f = forecasts[scenario];
  const current = f.startBalance;
  const threshold = data.settings.company.cashAlertThreshold;

  const chart = [
    ...history.slice(0, -1).map((h) => ({ month: h.month, realized: h.cash, prudent: null, central: null, optimistic: null })),
    ...forecasts.central.months.map((m, i) => ({
      month: m.month,
      realized: i === 0 ? current : null,
      prudent: i === 0 ? current : forecasts.prudent.months[i - 1]!.closingBalance,
      central: i === 0 ? current : forecasts.central.months[i - 1]!.closingBalance,
      optimistic: i === 0 ? current : forecasts.optimistic.months[i - 1]!.closingBalance,
    })),
  ];
  const opening = data.settings.company;
  const totalIn = data.payments.filter((p) => p.date >= opening.openingBalanceDate && p.date <= today).reduce((s, p) => s + p.amount, 0);
  const upcoming = f.items.filter((i) => i.date <= f.months[1]!.month + "-31").slice(0, 40);
  const lastReview = data.settings.gamification.lastCashReviewAt;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trésorerie"
        description="Flux réalisés (paiements et dépenses payées) et prévisions calculées à partir des factures ouvertes, des abonnements, du pipeline et des charges récurrentes. Les prévisions sont des estimations, pas des données bancaires."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Solde actuel (calculé)"
          icon={<Landmark />}
          value={formatEUR(current)}
          tone={current < threshold ? "danger" : "default"}
          hint={`Solde d'ouverture ${formatEUR(opening.openingBalance)} au ${formatDate(opening.openingBalanceDate)} + encaissements − décaissements réalisés. Aucune connexion bancaire.`}
        />
        <MetricCard label="Encaissements réalisés (cumul)" value={formatEUR(totalIn)} hint="Paiements clients enregistrés depuis le début de la simulation." />
        <MetricCard label="Créances à encaisser" value={formatEUR(receivables(summaries))} hint="Soldes des factures émises." />
        <MetricCard label="Dettes à payer" value={formatEUR(payables(data.expenses))} hint="Dépenses saisies non payées (TTC)." />
      </div>

      <ChartCard
        title="Trésorerie réalisée et prévisionnelle"
        description="Trait plein : réalisé · pointillés : scénarios prévisionnels (fin de mois)"
        height={320}
        actions={<Badge tone="warning">Estimations</Badge>}
      >
        <MonthlyLineChart
          data={chart}
          series={[
            { key: "realized", label: "Réalisé", color: SERIES[0] },
            { key: "prudent", label: "Prudent", color: SERIES[1], forecast: true },
            { key: "central", label: "Central", color: SERIES[2], forecast: true },
            { key: "optimistic", label: "Optimiste", color: SERIES[3], forecast: true },
          ]}
        />
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Prévision mensuelle</CardTitle>
              <CardDescription>Scénario sélectionné — montants TTC</CardDescription>
            </div>
            <Segmented label="Scénario" value={scenario} onChange={setScenario} options={(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))} />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Prévision de trésorerie par mois</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="py-2 font-medium">Mois</th>
                  <th className="py-2 text-right font-medium">Encaissements prévus</th>
                  <th className="py-2 text-right font-medium">Décaissements prévus</th>
                  <th className="py-2 text-right font-medium">Flux net</th>
                  <th className="py-2 text-right font-medium">Solde fin de mois</th>
                </tr>
              </thead>
              <tbody>
                {f.months.map((m) => (
                  <tr key={m.month} className="border-b border-border/60">
                    <td className="py-2 capitalize">{formatMonth(m.month, false)}</td>
                    <td className="py-2 text-right tabular">{formatEUR(m.inflows, { round: true })}</td>
                    <td className="py-2 text-right tabular">{formatEUR(m.outflows, { round: true })}</td>
                    <td className={cn("py-2 text-right tabular", m.net < 0 ? "text-danger" : "text-success")}>{formatEUR(m.net, { round: true, sign: true })}</td>
                    <td className={cn("py-2 text-right font-medium tabular", m.closingBalance < threshold && "text-danger")}>{formatEUR(m.closingBalance, { round: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {f.lowestBalance < threshold ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-danger">
                <TriangleAlert className="size-4" /> Le scénario {SCENARIOS[scenario].label.toLowerCase()} passe sous le seuil d&apos;alerte ({formatEUR(threshold)}) en{" "}
                {formatMonth(f.lowestMonth ?? "", false)}.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Hypothèses du scénario {SCENARIOS[scenario].label.toLowerCase()}</CardTitle>
              <CardDescription>Règles explicites, modifiables dans le code (cashflow.ts)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-xs">
              {[
                ["Factures non échues encaissées", `${Math.round(SCENARIOS[scenario].currentInvoiceRate * 100)} %`],
                ["Retard moyen d'encaissement", `${SCENARIOS[scenario].paymentDelayDays} j`],
                ["Factures échues recouvrées", `${Math.round(SCENARIOS[scenario].overdueRecoveryRate * 100)} %`],
                ["Abonnements encaissés (à 30 j)", `${Math.round(SCENARIOS[scenario].subscriptionRate * 100)} %`],
                ["Pipeline pondéré retenu (à 45 j)", `${Math.round(SCENARIOS[scenario].pipelineFactor * 100)} %`],
                ["Coefficient sur les décaissements", `× ${SCENARIOS[scenario].outflowFactor}`],
                ["Charges récurrentes", "Moyenne des 3 derniers mois (salaires, logiciels, hébergement, locaux, frais bancaires)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-subtle">Simplification : la TVA collectée et déductible n&apos;est pas reversée dans la simulation.</p>
          </CardContent>
        </Card>
      </div>

      <section id="revue" className="scroll-mt-20">
        <SectionTitle title="Échéances prévues (2 prochains mois)" description={`Scénario ${SCENARIOS[scenario].label.toLowerCase()}`} />
        <Card>
          <CardContent className="pt-4">
            <ul className="divide-y divide-border/60">
              {upcoming.map((i, idx) => (
                <li key={`${i.date}-${idx}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs tabular text-muted">{formatDate(i.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  <Badge className="hidden sm:inline-flex">{KIND_LABELS[i.kind]}</Badge>
                  <span className={cn("w-28 shrink-0 text-right tabular", i.amount < 0 ? "text-danger" : "text-success")}>{formatEUR(i.amount, { sign: true })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="mt-4">
          <CardContent className="flex flex-col items-start gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-fg">Revue des prévisions de trésorerie</p>
              <p className="text-xs text-muted">Dernière revue : {lastReview ? formatDateTime(lastReview) : "jamais"}. Valider la revue fait progresser la mission hebdomadaire correspondante.</p>
            </div>
            <Button variant="primary" onClick={() => run(recordCashReview, undefined)}>
              <ClipboardCheck /> Valider la revue de la semaine
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
