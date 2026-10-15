"use client";
import * as React from "react";
import { Download, Printer } from "lucide-react";
import { useData, usePeriod, useSummaries, useToday } from "@/lib/store/hooks";
import { endOfMonthISO, inPeriod, monthKey, monthPeriod, monthsBetween, type Period } from "@/lib/calculations/dates";
import { cashBalance, EXPENSE_CATEGORY_LABELS, receivablesAging } from "@/lib/calculations/finance";
import { lineHT } from "@/lib/calculations/money";
import { computeMRR } from "@/lib/calculations/recurring";
import { averageSalesCycle, conversionRate, STAGES } from "@/lib/calculations/pipeline";
import { isProjectLate, isTaskLate, onTimeDeliveryRate, projectFinancials } from "@/lib/calculations/projects";
import { buildForecast } from "@/lib/calculations/cashflow";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { ChartCard, HorizontalBars, MonthlyBarChart, MonthlyLineChart, SERIES } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { INVOICE_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDateTime, formatEUR, formatMonth, formatNumber, formatPercent } from "@/lib/formatters";
import { csvMoney, downloadCSV, type CsvCell } from "@/lib/export/csv";
import type { ExpenseCategory, InvoiceStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface Filters {
  start: string;
  end: string;
  client: string;
  product: string;
  project: string;
  category: string;
  status: string;
}

function ExportButton({ name, headers, rows }: { name: string; headers: string[]; rows: CsvCell[][] }) {
  return (
    <Button size="sm" variant="ghost" className="no-print" onClick={() => downloadCSV(name, headers, rows)} disabled={!rows.length}>
      <Download /> CSV
    </Button>
  );
}

function ReportTable({ headers, rows, align }: { headers: string[]; rows: React.ReactNode[][]; align?: ("left" | "right")[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">Aucune donnée pour ces filtres.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
            {headers.map((h, i) => (
              <th key={h} className={cn("py-2 pr-3 font-medium", align?.[i] === "right" && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((c, j) => (
                <td key={j} className={cn("py-2 pr-3", align?.[j] === "right" && "text-right tabular")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsPage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const { period: preset, label } = usePeriod();
  const [f, setF] = React.useState<Filters>({ start: preset.start, end: preset.end > today ? today : preset.end, client: "all", product: "all", project: "all", category: "all", status: "all" });
  const [presetKey, setPresetKey] = React.useState(`${preset.start}|${preset.end}`);
  if (presetKey !== `${preset.start}|${preset.end}`) {
    setPresetKey(`${preset.start}|${preset.end}`);
    setF((s) => ({ ...s, start: preset.start, end: preset.end }));
  }
  const set = (k: keyof Filters) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const period: Period = { start: f.start <= f.end ? f.start : f.end, end: f.end };
  const months = monthsBetween(period.start, period.end);
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const products = new Map(data.products.map((p) => [p.id, p.name]));

  // Lignes de CA facturé filtrées (client, produit, projet, statut, période).
  const lines = React.useMemo(() => {
    const out: { month: string; clientId: string; productId: string | null; projectId: string | null; ht: number; invoiceId: string }[] = [];
    for (const s of summaries) {
      if (s.invoice.baseStatus !== "issued" || !inPeriod(s.invoice.issueDate, period)) continue;
      if (f.client !== "all" && s.invoice.clientId !== f.client) continue;
      if (f.project !== "all" && s.invoice.projectId !== f.project) continue;
      if (f.status !== "all" && s.status !== f.status) continue;
      for (const l of s.invoice.items) {
        if (f.product !== "all" && l.productId !== f.product) continue;
        out.push({ month: monthKey(s.invoice.issueDate), clientId: s.invoice.clientId, productId: l.productId, projectId: s.invoice.projectId, ht: lineHT(l), invoiceId: s.invoice.id });
      }
    }
    return out;
  }, [summaries, period.start, period.end, f.client, f.project, f.status, f.product]); // eslint-disable-line react-hooks/exhaustive-deps

  const expenses = data.expenses.filter((e) => inPeriod(e.date, period) && (f.category === "all" || e.category === f.category) && (f.project === "all" || e.projectId === f.project));
  const revenueByMonth = months.map((m) => ({ month: m, billed: lines.filter((l) => l.month === m).reduce((s, l) => s + l.ht, 0), expenses: expenses.filter((e) => monthKey(e.date) === m).reduce((s, e) => s + e.amountHT, 0) }));
  const group = <K extends string>(key: (l: (typeof lines)[number]) => K | null, name: (k: K) => string) => {
    const map = new Map<K, number>();
    for (const l of lines) {
      const k = key(l);
      if (k === null) continue;
      map.set(k, (map.get(k) ?? 0) + l.ht);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: name(k), value: v }));
  };
  const byClient = group((l) => l.clientId, (k) => clients.get(k) ?? "—");
  const byProduct = group((l) => l.productId ?? "free", (k) => (k === "free" ? "Lignes libres" : (products.get(k) ?? "—")));
  const byCategory = (Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => ({ key: k, label: EXPENSE_CATEGORY_LABELS[k], value: expenses.filter((e) => e.category === k).reduce((s, e) => s + e.amountHT, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const cashSeries = months.map((m) => {
    const end = endOfMonthISO(monthPeriod(m).start);
    return { month: m, cash: cashBalance(data, end > today ? today : end), mrr: computeMRR(data.subscriptions, end > today ? today : end) };
  });
  const totalBilled = lines.reduce((s, l) => s + l.ht, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amountHT, 0);
  const projectRows = data.projects.filter((p) => f.project === "all" || p.id === f.project).filter((p) => f.client === "all" || p.clientId === f.client).map((p) => ({ p, fin: projectFinancials(p, data, summaries) }));
  const aging = receivablesAging(summaries.filter((s) => f.client === "all" || s.invoice.clientId === f.client));
  const forecast = buildForecast(data, today, "central", 6, summaries);

  // Commercial
  const opps = data.opportunities.filter((o) => f.client === "all" || o.clientId === f.client);
  const closedIn = opps.filter((o) => inPeriod(o.closedAt, period));
  const wonIn = closedIn.filter((o) => o.stage === "won");
  const lostIn = closedIn.filter((o) => o.stage === "lost");
  const byStage = STAGES.map((s) => ({ key: s.id, label: s.label, count: opps.filter((o) => o.stage === s.id).length, value: opps.filter((o) => o.stage === s.id).reduce((a, o) => a + o.amount, 0) }));
  const owners = [...new Set(opps.map((o) => o.ownerId ?? "none"))].map((id) => {
    const list = opps.filter((o) => (o.ownerId ?? "none") === id);
    const emp = data.employees.find((e) => e.id === id);
    return { id, name: emp ? `${emp.firstName} ${emp.lastName}` : "Non attribué", open: list.filter((o) => o.stage !== "won" && o.stage !== "lost").length, won: list.filter((o) => o.stage === "won").length, lost: list.filter((o) => o.stage === "lost").length, value: list.filter((o) => o.stage !== "won" && o.stage !== "lost").reduce((s, o) => s + o.amount, 0) };
  });
  const sources = [...new Set([...data.leads.map((l) => l.source), ...opps.map((o) => o.source)])].map((s) => ({ key: s, label: s, leads: data.leads.filter((l) => l.source === s && inPeriod(l.createdAt, period)).length, opps: opps.filter((o) => o.source === s).length, won: opps.filter((o) => o.source === s && o.stage === "won").reduce((a, o) => a + o.amount, 0) }));
  const wonByMonth = months.map((m) => ({ month: m, won: opps.filter((o) => o.stage === "won" && o.closedAt && monthKey(o.closedAt) === m).reduce((s, o) => s + o.amount, 0), lost: opps.filter((o) => o.stage === "lost" && o.closedAt && monthKey(o.closedAt) === m).reduce((s, o) => s + o.amount, 0) }));
  const avgBasket = wonIn.length ? wonIn.reduce((s, o) => s + o.amount, 0) / wonIn.length : null;

  // Projets
  const lateTasksByEmployee = data.employees.map((e) => ({ key: e.id, label: `${e.firstName} ${e.lastName}`, value: data.tasks.filter((t) => t.assigneeId === e.id && isTaskLate(t, today) && (f.project === "all" || t.projectId === f.project)).length })).filter((x) => x.value > 0);

  const scope = [f.client !== "all" && `client ${clients.get(f.client)}`, f.product !== "all" && `produit ${products.get(f.product)}`, f.project !== "all" && `projet ${data.projects.find((p) => p.id === f.project)?.code}`, f.category !== "all" && `catégorie ${EXPENSE_CATEGORY_LABELS[f.category as ExpenseCategory]}`, f.status !== "all" && `statut ${INVOICE_STATUS[f.status as InvoiceStatus].label}`].filter(Boolean).join(", ") || "toute l'entreprise";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analyses et rapports"
        description="Rapports financiers, commerciaux et projets. Les filtres modifient réellement les données ; chaque rapport est exportable en CSV, et la page s'imprime en PDF avec la période et le périmètre."
        actions={
          <Button variant="secondary" onClick={() => window.print()} className="no-print">
            <Printer /> Imprimer / PDF
          </Button>
        }
      />
      <div className="hidden print:block">
        <p className="text-sm font-semibold">BDO Software — rapport d&apos;analyse (données de démonstration)</p>
        <p className="text-xs">
          Édité le {formatDateTime(new Date().toISOString())} · période du {formatDate(period.start)} au {formatDate(period.end)} · périmètre : {scope}
        </p>
      </div>
      <Card className="no-print">
        <CardContent className="grid grid-cols-2 gap-3 pt-4 md:grid-cols-4 xl:grid-cols-7">
          <div>
            <Label htmlFor="f-start">Du</Label>
            <Input id="f-start" type="date" className="mt-1 h-8 text-xs" value={f.start} onChange={(e) => set("start")(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-end">Au</Label>
            <Input id="f-end" type="date" className="mt-1 h-8 text-xs" value={f.end} onChange={(e) => set("end")(e.target.value)} />
          </div>
          {[
            { k: "client" as const, l: "Client", o: data.clients.map((c) => ({ value: c.id, label: c.name })) },
            { k: "product" as const, l: "Produit", o: data.products.map((p) => ({ value: p.id, label: p.name })) },
            { k: "project" as const, l: "Projet", o: data.projects.map((p) => ({ value: p.id, label: p.code })) },
            { k: "category" as const, l: "Catégorie", o: (Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => ({ value: k, label: EXPENSE_CATEGORY_LABELS[k] })) },
            { k: "status" as const, l: "Statut facture", o: (Object.keys(INVOICE_STATUS) as InvoiceStatus[]).filter((s) => s !== "draft" && s !== "cancelled").map((s) => ({ value: s, label: INVOICE_STATUS[s].label })) },
          ].map((x) => (
            <div key={x.k}>
              <Label htmlFor={`f-${x.k}`}>{x.l}</Label>
              <NativeSelect id={`f-${x.k}`} className="mt-1 h-8 text-xs" value={f[x.k]} onChange={(e) => set(x.k)(e.target.value)}>
                <option value="all">Tous</option>
                {x.o.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
          <p className="col-span-full text-[11px] text-subtle">
            Période initialisée sur « {label} » (barre supérieure). Périmètre : {scope}.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="finance">
        <TabsList className="no-print">
          <TabsTrigger value="finance">Rapports financiers</TabsTrigger>
          <TabsTrigger value="sales">Rapports commerciaux</TabsTrigger>
          <TabsTrigger value="projects">Rapports projets</TabsTrigger>
        </TabsList>

        <TabsContent value="finance" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="CA facturé HT (filtré)" value={formatEUR(totalBilled)} />
            <MetricCard label="Dépenses HT (filtrées)" value={formatEUR(totalExpenses)} />
            <MetricCard label="Écart CA − dépenses" value={formatEUR(totalBilled - totalExpenses)} tone={totalBilled - totalExpenses < 0 ? "danger" : "default"} hint="Indicatif : les filtres client/produit ne s'appliquent pas aux dépenses." />
            <MetricCard label="Factures concernées" value={new Set(lines.map((l) => l.invoiceId)).size} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Chiffre d'affaires par mois" description="CA facturé HT et dépenses engagées HT" actions={<ExportButton name="ca-par-mois" headers={["Mois", "CA HT", "Dépenses HT"]} rows={revenueByMonth.map((r) => [r.month, csvMoney(r.billed), csvMoney(r.expenses)])} />}>
              <MonthlyBarChart data={revenueByMonth} series={[{ key: "billed", label: "CA facturé HT", color: SERIES[0] }, { key: "expenses", label: "Dépenses HT", color: SERIES[1] }]} />
            </ChartCard>
            <ChartCard title="Évolution de la trésorerie et du MRR" description="Fin de mois — deux graphiques à échelle unique" height={260} actions={<ExportButton name="tresorerie-mrr" headers={["Mois", "Trésorerie", "MRR"]} rows={cashSeries.map((r) => [r.month, csvMoney(r.cash), csvMoney(r.mrr)])} />}>
              <div className="grid h-full grid-rows-2 gap-2">
                <MonthlyLineChart area data={cashSeries} series={[{ key: "cash", label: "Trésorerie", color: SERIES[0] }]} />
                <MonthlyLineChart data={cashSeries} series={[{ key: "mrr", label: "MRR", color: SERIES[2] }]} />
              </div>
            </ChartCard>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Revenus par client</CardTitle>
                  <CardDescription>CA facturé HT</CardDescription>
                </div>
                <ExportButton name="revenus-par-client" headers={["Client", "CA HT"]} rows={byClient.map((r) => [r.label, csvMoney(r.value)])} />
              </CardHeader>
              <CardContent>
                <HorizontalBars items={byClient.slice(0, 10)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Revenus par produit</CardTitle>
                  <CardDescription>Lignes de facture par offre du catalogue</CardDescription>
                </div>
                <ExportButton name="revenus-par-produit" headers={["Produit", "CA HT"]} rows={byProduct.map((r) => [r.label, csvMoney(r.value)])} />
              </CardHeader>
              <CardContent>
                <HorizontalBars items={byProduct} color={SERIES[2]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Dépenses par catégorie</CardTitle>
                  <CardDescription>Dépenses engagées HT</CardDescription>
                </div>
                <ExportButton name="depenses-par-categorie" headers={["Catégorie", "HT"]} rows={byCategory.map((r) => [r.label, csvMoney(r.value)])} />
              </CardHeader>
              <CardContent>
                <HorizontalBars items={byCategory} color={SERIES[1]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Échéancier des créances</CardTitle>
                  <CardDescription>Soldes ouverts par ancienneté (à date)</CardDescription>
                </div>
                <ExportButton name="echeancier-creances" headers={["Tranche", "Nombre", "Montant"]} rows={aging.map((a) => [a.bucket, a.count, csvMoney(a.value)])} />
              </CardHeader>
              <CardContent>
                <ReportTable headers={["Tranche", "Factures", "Montant"]} align={["left", "right", "right"]} rows={aging.map((a) => [a.bucket, a.count, formatEUR(a.value)])} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Marge par projet</CardTitle>
                <CardDescription>Coûts saisis (dépenses + temps) distincts des coûts estimés et des revenus facturés</CardDescription>
              </div>
              <ExportButton name="marge-par-projet" headers={["Projet", "Prix de vente", "Coût estimé", "Marge estimée", "Coût réel", "Facturé HT", "Marge à date"]} rows={projectRows.map(({ p, fin }) => [p.code, csvMoney(fin.salePrice), csvMoney(fin.estimatedCost), csvMoney(fin.estimatedMargin), csvMoney(fin.actualCost), csvMoney(fin.invoiced), csvMoney(fin.currentMargin)])} />
            </CardHeader>
            <CardContent>
              <ReportTable
                headers={["Projet", "Prix de vente", "Coût estimé", "Marge estimée", "Coût réel saisi", "Facturé HT", "Marge à date"]}
                align={["left", "right", "right", "right", "right", "right", "right"]}
                rows={projectRows.map(({ p, fin }) => [`${p.code} · ${p.name}`, formatEUR(fin.salePrice, { round: true }), formatEUR(fin.estimatedCost, { round: true }), `${formatEUR(fin.estimatedMargin, { round: true })} (${formatPercent(fin.estimatedMarginRate, 0)})`, formatEUR(fin.actualCost, { round: true }), formatEUR(fin.invoiced, { round: true }), <span key="m" className={fin.currentMargin < 0 ? "text-danger" : undefined}>{formatEUR(fin.currentMargin, { round: true })}</span>])}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Prévisions de trésorerie (scénario central)</CardTitle>
                <CardDescription>Estimations — voir la page Trésorerie pour les hypothèses</CardDescription>
              </div>
              <ExportButton name="previsions-tresorerie" headers={["Mois", "Encaissements", "Décaissements", "Solde"]} rows={forecast.months.map((m) => [m.month, csvMoney(m.inflows), csvMoney(m.outflows), csvMoney(m.closingBalance)])} />
            </CardHeader>
            <CardContent>
              <ReportTable headers={["Mois", "Encaissements prévus", "Décaissements prévus", "Solde fin de mois"]} align={["left", "right", "right", "right"]} rows={forecast.months.map((m) => [formatMonth(m.month, false), formatEUR(m.inflows, { round: true }), formatEUR(m.outflows, { round: true }), formatEUR(m.closingBalance, { round: true })])} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="Taux de conversion (période)" value={formatPercent(conversionRate(opps, period))} hint="Gagnées ÷ clôturées dans la période." />
            <MetricCard label="Ventes gagnées" value={`${wonIn.length} · ${formatEUR(wonIn.reduce((s, o) => s + o.amount, 0), { compact: true })}`} tone="success" />
            <MetricCard label="Ventes perdues" value={`${lostIn.length} · ${formatEUR(lostIn.reduce((s, o) => s + o.amount, 0), { compact: true })}`} />
            <MetricCard label="Cycle de vente estimé" value={averageSalesCycle(opps) === null ? "—" : `${formatNumber(averageSalesCycle(opps)!, 0)} j`} hint="Durée moyenne entre création et gain (toutes périodes)." />
            <MetricCard label="Panier moyen gagné" value={avgBasket === null ? "Données insuffisantes" : formatEUR(avgBasket, { round: true })} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pipeline par étape</CardTitle>
                  <CardDescription>Nombre et montant des opportunités</CardDescription>
                </div>
                <ExportButton name="pipeline-par-etape" headers={["Étape", "Nombre", "Montant"]} rows={byStage.map((s) => [s.label, s.count, csvMoney(s.value)])} />
              </CardHeader>
              <CardContent>
                <HorizontalBars items={byStage.map((s) => ({ key: s.key, label: `${s.label} (${s.count})`, value: s.value }))} />
              </CardContent>
            </Card>
            <ChartCard title="Ventes gagnées et perdues" description="Montants par mois de clôture" actions={<ExportButton name="gagnees-perdues" headers={["Mois", "Gagnées", "Perdues"]} rows={wonByMonth.map((r) => [r.month, csvMoney(r.won), csvMoney(r.lost)])} />}>
              <MonthlyBarChart data={wonByMonth} series={[{ key: "won", label: "Gagnées", color: SERIES[0] }, { key: "lost", label: "Perdues", color: SERIES[1] }]} />
            </ChartCard>
            <Card>
              <CardHeader>
                <CardTitle>Opportunités par commercial</CardTitle>
                <ExportButton name="opportunites-par-commercial" headers={["Commercial", "Ouvertes", "Gagnées", "Perdues", "Pipeline"]} rows={owners.map((o) => [o.name, o.open, o.won, o.lost, csvMoney(o.value)])} />
              </CardHeader>
              <CardContent>
                <ReportTable headers={["Commercial", "Ouvertes", "Gagnées", "Perdues", "Pipeline"]} align={["left", "right", "right", "right", "right"]} rows={owners.map((o) => [o.name, o.open, o.won, o.lost, formatEUR(o.value, { round: true })])} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Sources d&apos;acquisition</CardTitle>
                  <CardDescription>Prospects créés dans la période, opportunités et montants gagnés</CardDescription>
                </div>
                <ExportButton name="sources-acquisition" headers={["Source", "Prospects", "Opportunités", "Gagné"]} rows={sources.map((s) => [s.label, s.leads, s.opps, csvMoney(s.won)])} />
              </CardHeader>
              <CardContent>
                <ReportTable headers={["Source", "Prospects", "Opportunités", "Montant gagné"]} align={["left", "right", "right", "right"]} rows={sources.sort((a, b) => b.won - a.won).map((s) => [s.label, s.leads, s.opps, formatEUR(s.won, { round: true })])} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Livraison dans les délais" value={formatPercent(onTimeDeliveryRate(data.projects), 0)} hint="Projets terminés au plus tard à l'échéance ÷ projets terminés." />
            <MetricCard label="Projets en risque / retard" value={data.projects.filter((p) => p.status === "at_risk" || isProjectLate(p, today)).length} tone="danger" />
            <MetricCard label="Charge réalisée" value={`${formatNumber(projectRows.reduce((s, x) => s + x.fin.actualHours, 0))} h`} />
            <MetricCard label="Tâches en retard" value={data.tasks.filter((t) => isTaskLate(t, today) && (f.project === "all" || t.projectId === f.project)).length} tone="danger" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Écart budgétaire</CardTitle>
                  <CardDescription>Coût réel saisi − budget (positif = dépassement)</CardDescription>
                </div>
                <ExportButton name="ecart-budgetaire" headers={["Projet", "Budget", "Coût réel", "Écart"]} rows={projectRows.map(({ p, fin }) => [p.code, csvMoney(fin.budget), csvMoney(fin.actualCost), csvMoney(fin.budgetVariance)])} />
              </CardHeader>
              <CardContent>
                <HorizontalBars items={projectRows.filter((x) => x.fin.actualCost > 0).map(({ p, fin }) => ({ key: p.id, label: `${p.code} · ${formatPercent(fin.budgetConsumption, 0)} consommé`, value: -fin.budgetVariance, color: SERIES[2] }))} />
                <p className="mt-2 text-[11px] text-subtle">Barre rouge = dépassement ; barre verte = budget restant.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Charge réalisée par projet</CardTitle>
                  <CardDescription>Heures saisies / estimées</CardDescription>
                </div>
                <ExportButton name="charge-par-projet" headers={["Projet", "Heures réalisées", "Heures estimées"]} rows={projectRows.map(({ p, fin }) => [p.code, fin.actualHours, fin.estimatedHours])} />
              </CardHeader>
              <CardContent>
                <HorizontalBars money={false} suffix=" h" items={projectRows.filter((x) => x.fin.estimatedHours > 0).map(({ p, fin }) => ({ key: p.id, label: `${p.code} (${formatNumber(fin.estimatedHours)} h estimées)`, value: fin.actualHours }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Projets en risque</CardTitle>
              </CardHeader>
              <CardContent>
                <ReportTable headers={["Projet", "Statut", "Échéance", "Raison"]} rows={data.projects.filter((p) => p.status === "at_risk" || isProjectLate(p, today) || projectFinancials(p, data, summaries).budgetVariance > 0).filter((p) => p.status !== "done").map((p) => [`${p.code} · ${p.name}`, p.status, formatDate(p.dueDate), [isProjectLate(p, today) && "retard", projectFinancials(p, data, summaries).budgetVariance > 0 && "dépassement", p.status === "at_risk" && "marqué en risque"].filter(Boolean).join(", ")])} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tâches en retard par responsable</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBars money={false} items={lateTasksByEmployee} color={SERIES[1]} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
