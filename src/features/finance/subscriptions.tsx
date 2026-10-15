"use client";
import * as React from "react";
import Link from "next/link";
import { FilePlus2, Pencil, Plus } from "lucide-react";
import type { Subscription } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { billingDates, computeARR, computeMRR, isSubscriptionActiveOn, monthlyValue, mrrSeries, nextBillingDate, PERIODICITY_LABELS } from "@/lib/calculations/recurring";
import { addMonths, daysBetween } from "@/lib/calculations/dates";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { RowActions } from "@/components/shared/row-actions";
import { FormDialog } from "@/components/forms/quick-create";
import { SubscriptionForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartCard, MonthlyLineChart, SERIES } from "@/components/charts/charts";
import { SUBSCRIPTION_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatEUR } from "@/lib/formatters";
import { csvMoney } from "@/lib/export/csv";

export function SubscriptionsPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const { clients } = useLookups();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const f = useFilters(["status", "periodicity"] as const);
  const [editId, setEditId] = useSyncedState<string | null>(focus);
  const edit = data.subscriptions.find((x) => x.id === editId) ?? null;
  const setEdit = (s: Subscription | null) => setEditId(s?.id ?? null);

  const mrr = computeMRR(data.subscriptions, today);
  const lastMonthMrr = computeMRR(data.subscriptions, addMonths(today, -1));
  const series = mrrSeries(data.subscriptions, today, 12);
  // Échéances exigibles non encore facturées (12 derniers mois).
  const unbilled = data.subscriptions.flatMap((s) =>
    billingDates(s, addMonths(today, -12), today)
      .filter((d) => !data.invoices.some((i) => i.subscriptionId === s.id && i.issueDate === d && i.baseStatus !== "cancelled"))
      .map((d) => ({ sub: s, date: d })),
  );

  const rows = data.subscriptions.filter((s) => f.match("status", s.status) && f.match("periodicity", s.periodicity));
  const columns: Column<Subscription>[] = [
    { id: "client", header: "Client", cell: (s) => <Link className="text-fg hover:underline" href={`/clients/${s.clientId}`}>{clients.get(s.clientId)?.name ?? "—"}</Link>, sortValue: (s) => clients.get(s.clientId)?.name ?? "", csv: (s) => clients.get(s.clientId)?.name ?? "" },
    { id: "offer", header: "Offre", cell: (s) => s.offer, sortValue: (s) => s.offer, csv: (s) => s.offer },
    { id: "amount", header: "Montant / période", align: "right", cell: (s) => formatEUR(s.amount), sortValue: (s) => s.amount, csv: (s) => csvMoney(s.amount), hideBelow: "md" },
    { id: "periodicity", header: "Périodicité", cell: (s) => PERIODICITY_LABELS[s.periodicity], csv: (s) => PERIODICITY_LABELS[s.periodicity], hideBelow: "md" },
    { id: "mrr", header: "MRR", align: "right", cell: (s) => (isSubscriptionActiveOn(s, today) ? formatEUR(monthlyValue(s)) : <span className="text-subtle">—</span>), sortValue: (s) => (isSubscriptionActiveOn(s, today) ? monthlyValue(s) : 0), csv: (s) => (isSubscriptionActiveOn(s, today) ? csvMoney(monthlyValue(s)) : 0) },
    { id: "start", header: "Début", cell: (s) => formatDate(s.startDate), sortValue: (s) => s.startDate, csv: (s) => s.startDate, hideBelow: "lg" },
    {
      id: "end",
      header: "Fin",
      cell: (s) => {
        if (!s.endDate) return <span className="text-subtle">Sans terme</span>;
        const d = daysBetween(today, s.endDate);
        return <span className={d >= 0 && d <= data.settings.rules.contractNoticeDays ? "text-warning" : undefined}>{formatDate(s.endDate)}</span>;
      },
      sortValue: (s) => s.endDate ?? "9999",
      csv: (s) => s.endDate ?? "",
    },
    { id: "next", header: "Prochaine échéance", cell: (s) => formatDate(s.status === "active" ? nextBillingDate(s, today) : null), hideBelow: "lg" },
    { id: "status", header: "Statut", cell: (s) => <StatusBadge meta={SUBSCRIPTION_STATUS[s.status]} />, sortValue: (s) => s.status, csv: (s) => SUBSCRIPTION_STATUS[s.status].label },
    { id: "actions", header: "", align: "right", cell: (s) => <RowActions actions={[{ label: "Modifier", icon: <Pencil />, onSelect: () => setEdit(s) }]} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenus récurrents"
        description="Abonnements et contrats récurrents. Le MRR ne comprend que les contrats actifs ; l'ARR est une annualisation du MRR, pas du chiffre d'affaires réalisé. Les opportunités ne sont jamais incluses."
        actions={
          <Button variant="primary" onClick={() => openCreate("subscription")}>
            <Plus /> Nouvel abonnement
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="MRR" value={formatEUR(mrr)} hint="Σ des abonnements actifs ramenés au mois (trimestriel ÷ 3, annuel ÷ 12)." footer={<span className="text-[11px] text-muted">Il y a un mois : {formatEUR(lastMonthMrr)}</span>} />
        <MetricCard label="ARR (estimation)" value={formatEUR(computeARR(mrr))} hint="MRR × 12." />
        <MetricCard label="Contrats actifs" value={data.subscriptions.filter((s) => s.status === "active").length} />
        <MetricCard label="Échéances à facturer" value={unbilled.length} tone={unbilled.length ? "gold" : "default"} hint="Échéances exigibles sans facture correspondante." />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Évolution du MRR" description="MRR en fin de mois, 12 derniers mois">
          <MonthlyLineChart area data={series} series={[{ key: "mrr", label: "MRR", color: SERIES[2] }]} />
        </ChartCard>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Échéances non facturées</CardTitle>
              <CardDescription>Facturation idempotente : une échéance ne peut être facturée qu&apos;une fois</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {unbilled.length ? (
              unbilled.slice(0, 8).map((u) => (
                <div key={`${u.sub.id}-${u.date}`} className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-fg">{clients.get(u.sub.clientId)?.name} · {u.sub.offer}</p>
                    <p className="text-[11px] text-muted">
                      Échéance du {formatDate(u.date)} · {formatEUR(u.sub.amount)} HT
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => run(C.invoiceSubscriptionPeriod, { id: u.sub.id, billingDate: u.date })}>
                    <FilePlus2 /> Facturer
                  </Button>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted">Toutes les échéances exigibles sont facturées.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <DataTable
        caption="Abonnements et contrats récurrents"
        rows={rows}
        columns={columns}
        searchText={(s) => `${s.offer} ${clients.get(s.clientId)?.name ?? ""}`}
        exportName="abonnements"
        highlightId={focus}
        onRowClick={(s) => setEdit(s)}
        initialSort={{ id: "mrr", dir: "desc" }}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              { id: "status", label: "Statut", value: f.values.status, onChange: f.set("status"), options: Object.entries(SUBSCRIPTION_STATUS).map(([value, m]) => ({ value, label: m.label })) },
              { id: "periodicity", label: "Périodicité", value: f.values.periodicity, onChange: f.set("periodicity"), options: Object.entries(PERIODICITY_LABELS).map(([value, label]) => ({ value, label })) },
            ]}
          />
        }
      />
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Modifier le contrat" description="Pour résilier : statut « Résilié » et date de fin.">
        {edit ? <SubscriptionForm entity={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} /> : null}
      </FormDialog>
    </div>
  );
}
