"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useData, usePeriod, useSummaries, useToday } from "@/lib/store/hooks";
import { financialSnapshot, monthlySeries, receivablesAging } from "@/lib/calculations/finance";
import { formatEUR, formatPercent } from "@/lib/formatters";
import { PageHeader } from "@/components/shared/page-header";
import { FinancialMetricCard } from "@/components/shared/metric-card";
import { ChartCard, CashFlowChart, HorizontalBars, MonthlyBarChart, SERIES } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodSelect } from "@/components/layout/topbar";

const LINKS = [
  { href: "/finances/factures", label: "Factures clients", desc: "Émission, paiements, relances" },
  { href: "/finances/depenses", label: "Dépenses", desc: "Catégories, échéances, paiements" },
  { href: "/finances/tresorerie", label: "Trésorerie", desc: "Réalisé et scénarios prévisionnels" },
  { href: "/finances/abonnements", label: "Revenus récurrents", desc: "MRR, ARR, contrats" },
];

export function FinanceOverview() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const { period, previous, label } = usePeriod();
  const s = React.useMemo(() => financialSnapshot(data, summaries, period, previous, today), [data, summaries, period, previous, today]);
  const series = React.useMemo(() => monthlySeries(data, today, 12, summaries), [data, today, summaries]);
  const aging = receivablesAging(summaries);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finances"
        description={`Vue générale — ${label.toLowerCase()}. Les données facturées, encaissées et estimées sont distinguées ; chaque indicateur affiche sa définition.`}
        actions={<PeriodSelect />}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FinancialMetricCard
          label="CA facturé HT"
          value={s.current.billed}
          previous={s.previous.billed}
          definition="Somme HT des factures émises dans la période (hors brouillons/annulées)."
          href="/finances/factures"
        />
        <FinancialMetricCard label="Encaissements TTC" value={s.current.collected} previous={s.previous.collected} definition="Paiements clients reçus dans la période." href="/finances/factures" />
        <FinancialMetricCard
          label="Décaissements TTC"
          value={s.current.disbursed}
          previous={s.previous.disbursed}
          good="down"
          definition="Dépenses payées dans la période (date de paiement)."
          href="/finances/depenses"
        />
        <FinancialMetricCard
          label="Trésorerie"
          value={s.cash}
          previous={s.cashPrevious}
          definition="Solde d'ouverture + encaissements − décaissements réalisés."
          href="/finances/tresorerie"
          comparisonLabel="vs fin de période précédente"
        />
        <FinancialMetricCard label="Créances clients" value={s.receivables} good="down" definition="Soldes restant dus sur les factures émises." href="/finances/factures?status=overdue" />
        <FinancialMetricCard label="Dettes fournisseurs" value={s.payables} good="down" definition="Dépenses non payées (TTC)." href="/finances/depenses" />
        <FinancialMetricCard
          label="Dépenses engagées HT"
          value={s.current.expenses}
          previous={s.previous.expenses}
          good="down"
          definition="Dépenses datées dans la période, payées ou non."
          href="/finances/depenses"
        />
        <FinancialMetricCard
          label="Résultat opérationnel estimé"
          value={s.current.operatingResult}
          previous={s.previous.operatingResult}
          definition="CA facturé HT − dépenses engagées HT (estimation de gestion)."
        />
        <FinancialMetricCard
          label="Marge opérationnelle"
          value={s.current.operatingMargin === null ? null : Math.round(s.current.operatingMargin * 10) / 10}
          previous={s.previous.operatingMargin === null ? null : Math.round(s.previous.operatingMargin * 10) / 10}
          money={false}
          formatValue={(v) => formatPercent(v)}
          missing="Non calculable (CA nul)"
          definition="Résultat opérationnel estimé ÷ CA facturé HT."
        />
        <FinancialMetricCard
          label="MRR"
          value={s.mrr}
          previous={s.mrrPrevious}
          definition="Revenu mensuel récurrent normalisé des contrats actifs."
          href="/finances/abonnements"
          comparisonLabel="vs fin de période précédente"
        />
        <FinancialMetricCard label="ARR (estimation)" value={s.arr} definition="MRR × 12 — estimation annualisée." href="/finances/abonnements" />
        <FinancialMetricCard
          label="Factures en retard"
          value={s.overdueReceivables}
          good="down"
          definition={`${s.overdueCount} facture(s) dont l'échéance est dépassée et le solde non nul.`}
          href="/finances/factures?status=overdue"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Résultat opérationnel estimé par mois" description="CA facturé HT − dépenses engagées HT">
          <MonthlyBarChart data={series} series={[{ key: "result", label: "Résultat estimé", color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard title="Encaissements et décaissements" description="Flux réalisés par mois (TTC)">
          <CashFlowChart data={series} />
        </ChartCard>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Échéancier des créances</CardTitle>
              <CardDescription>Soldes ouverts par ancienneté de retard</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <HorizontalBars items={aging.map((a, i) => ({ key: a.bucket, label: `${a.bucket} (${a.count})`, value: a.value, color: i === 0 ? SERIES[0] : SERIES[1] }))} />
            <p className="mt-3 text-xs text-muted">Total ouvert : {formatEUR(aging.reduce((t, a) => t + a.value, 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accès rapides</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {LINKS.map((l) => (
              <Button key={l.href} variant="secondary" asChild className="h-auto justify-between py-3">
                <Link href={l.href}>
                  <span className="text-left">
                    <span className="block text-sm">{l.label}</span>
                    <span className="block text-[11px] font-normal text-muted">{l.desc}</span>
                  </span>
                  <ArrowRight />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="text-[11px] text-subtle">
        Outil de gestion interne — ce module n&apos;est pas un logiciel comptable certifié et ne garantit aucune conformité fiscale. Les taux de TVA sont des paramètres de simulation.
      </p>
    </div>
  );
}
