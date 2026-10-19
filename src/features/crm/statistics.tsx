"use client";
import * as React from "react";
import type { OpportunityStage } from "@/lib/domain/types";
import { useData, useToday } from "@/lib/store/hooks";
import { PERIOD_PRESET_LABELS, presetPeriod, type PeriodPreset } from "@/lib/calculations/dates";
import { STAGES } from "@/lib/calculations/pipeline";
import { computeCrmStats, type Kpi } from "@/lib/crm/stats";
import { SOURCES } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { ChartCard, HorizontalBars, MonthlyBarChart, SERIES } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatEUR, formatNumber, formatPercent } from "@/lib/formatters";

function display(k: Kpi): string {
  if (k.value === null) return "—";
  switch (k.unit) {
    case "pct":
      return formatPercent(k.value);
    case "days":
      return `${formatNumber(k.value, 1)} j`;
    case "eur":
      return formatEUR(k.value, { round: true, compact: true });
    default:
      return String(k.value);
  }
}

const weekLabel = (key: string, long?: boolean) => (long ? `Semaine ${key.slice(6)} (${key.slice(0, 4)})` : `S${key.slice(6)}`);

/** Statistiques CRM : chaque indicateur affiche sa définition (numérateur, dénominateur, période). */
export function StatisticsPage() {
  const data = useData();
  const today = useToday();
  const [preset, setPreset] = React.useState<PeriodPreset>("last_90");
  const [owner, setOwner] = React.useState("all");
  const [source, setSource] = React.useState("all");
  const [stage, setStage] = React.useState("all");
  const filters = {
    period: presetPeriod(preset, today),
    ownerId: owner === "all" ? null : owner,
    source: source === "all" ? null : source,
    stage: stage === "all" ? null : (stage as OpportunityStage),
  };
  const stats = React.useMemo(() => computeCrmStats(data, today, filters), [data, today, filters.period.start, filters.period.end, owner, source, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = stats.kpis;
  const filtered = owner !== "all" || source !== "all" || stage !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiques"
        description="Indicateurs calculés à partir des données réelles du CRM. Survolez l'icône ⓘ d'un indicateur pour lire sa définition exacte. Les filtres s'appliquent aux opportunités, contacts, interactions et missions concernés."
      />
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} aria-label="Période" className="h-8 w-auto text-xs">
          {(Object.keys(PERIOD_PRESET_LABELS) as PeriodPreset[]).map((p) => (
            <option key={p} value={p}>
              {PERIOD_PRESET_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsable" className="h-8 w-auto text-xs">
          <option value="all">Tous les responsables</option>
          {data.employees
            .filter((e) => e.department === "sales" || e.department === "direction")
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source" className="h-8 w-auto text-xs">
          <option value="all">Toutes les sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Étape" className="h-8 w-auto text-xs">
          <option value="all">Toutes les étapes</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOwner("all");
              setSource("all");
              setStage("all");
            }}
          >
            Réinitialiser
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          Du {filters.period.start.split("-").reverse().join("/")} au {filters.period.end.split("-").reverse().join("/")}
        </span>
      </div>

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {(Object.keys(k) as (keyof typeof k)[]).map((key) => (
          <MetricCard key={key} label={k[key].label} value={display(k[key])} hint={k[key].definition} tone={key === "overdueFollowups" && (k[key].value ?? 0) > 0 ? "danger" : undefined} />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Activité commerciale hebdomadaire" description="12 dernières semaines (indépendant de la période) : prospects créés, interactions consignées, conversions">
          <MonthlyBarChart
            money={false}
            xLabel={weekLabel}
            data={stats.weekly.map((w) => ({ month: w.week, prospects: w.prospects, interactions: w.interactions, conversions: w.conversions }))}
            series={[
              { key: "prospects", label: "Prospects créés", color: SERIES[0] },
              { key: "interactions", label: "Interactions", color: SERIES[6] },
              { key: "conversions", label: "Conversions", color: SERIES[2] },
            ]}
          />
        </ChartCard>
        <ChartCard title="Missions terminées : à l'heure ou en retard" description="Par semaine de réalisation ; « à l'heure » = terminée au plus tard le jour de l'échéance">
          <MonthlyBarChart
            money={false}
            stacked
            xLabel={weekLabel}
            data={stats.weekly.map((w) => ({ month: w.week, onTime: w.onTime, late: w.late }))}
            series={[
              { key: "onTime", label: "À l'heure", color: SERIES[2] },
              { key: "late", label: "En retard", color: SERIES[7] },
            ]}
          />
        </ChartCard>
        <ChartCard title="Taux de conversion mensuel" description="Gagnées ÷ (gagnées + perdues) des opportunités clôturées dans le mois">
          <MonthlyBarChart
            money={false}
            data={stats.monthlyConversion.map((m) => ({ month: m.month, rate: m.rate ?? 0 }))}
            series={[{ key: "rate", label: "Taux de conversion (%)", color: SERIES[2] }]}
          />
        </ChartCard>
        <Card>
          <CardHeader>
            <CardTitle>Opportunités par étape</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBars items={stats.byStage.map((s) => ({ key: s.stage, label: `${s.label} (${s.count})`, value: s.value, color: s.color }))} />
            <p className="mt-2 text-[11px] text-subtle">Valeur cumulée des opportunités non archivées à chaque étape (à date).</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Missions terminées par type</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.missionsByType.length ? (
              <HorizontalBars money={false} items={stats.missionsByType.map((m) => ({ key: m.type, label: m.label, value: m.count }))} />
            ) : (
              <p className="text-sm text-muted">Aucune mission terminée sur la période.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance par source</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Opportunités créées dans la période, par source</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 text-right font-medium">Créées</th>
                  <th className="py-2 text-right font-medium">Gagnées</th>
                  <th className="py-2 text-right font-medium">Taux</th>
                  <th className="py-2 text-right font-medium">Valeur gagnée</th>
                </tr>
              </thead>
              <tbody>
                {stats.bySource.map((s) => (
                  <tr key={s.source} className="border-b border-border/60 last:border-0">
                    <td className="py-2">{s.source}</td>
                    <td className="py-2 text-right tabular">{s.created}</td>
                    <td className="py-2 text-right tabular">{s.won}</td>
                    <td className="py-2 text-right tabular">{formatPercent(s.created ? (s.won / s.created) * 100 : null)}</td>
                    <td className="py-2 text-right tabular">{formatEUR(s.value, { round: true })}</td>
                  </tr>
                ))}
                {!stats.bySource.length ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted">
                      Aucune opportunité créée sur la période.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-subtle">Taux = gagnées ÷ créées, parmi les opportunités créées dans la période (les opportunités encore ouvertes restent au dénominateur).</p>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Activité par responsable</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Interactions, missions et gains par responsable</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="py-2 font-medium">Responsable</th>
                  <th className="py-2 text-right font-medium">Interactions</th>
                  <th className="py-2 text-right font-medium">Missions terminées</th>
                  <th className="py-2 text-right font-medium">Affaires gagnées</th>
                </tr>
              </thead>
              <tbody>
                {stats.byOwner.map((o) => (
                  <tr key={o.ownerId} className="border-b border-border/60 last:border-0">
                    <td className="py-2">{o.name}</td>
                    <td className="py-2 text-right tabular">{o.interactions}</td>
                    <td className="py-2 text-right tabular">{o.missions}</td>
                    <td className="py-2 text-right tabular">{o.won}</td>
                  </tr>
                ))}
                {!stats.byOwner.length ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted">
                      Aucune activité attribuée sur la période.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      <p className="text-[11px] text-subtle">Les opportunités ne sont jamais comptées comme du chiffre d&apos;affaires encaissé : la facturation reste dans le module Finances.</p>
    </div>
  );
}
