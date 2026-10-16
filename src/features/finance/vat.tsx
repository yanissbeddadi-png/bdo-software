"use client";
import * as React from "react";
import { CalendarClock, Download, FileCheck2, Landmark, Wallet } from "lucide-react";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { currentVatEstimate, nextPeriodToDeclare, VAT_STATE_LABELS, vatOutstanding, vatPaid, vatPeriods, type VatPeriodRow, type VatPeriodState } from "@/lib/calculations/vat";
import { declareVatReturn, payVatReturn } from "@/lib/domain/commands";
import { formatDate, formatDueIn, formatEUR, formatMonth } from "@/lib/formatters";
import { csvMoney, downloadCSV } from "@/lib/export/csv";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ChartCard, MonthlyBarChart, SERIES } from "@/components/charts/charts";
import { FormDialog } from "@/components/forms/quick-create";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATE_TONE: Record<VatPeriodState, BadgeTone> = { to_declare: "info", late: "danger", declared: "warning", paid: "success", credit: "violet" };

export function VatPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const [payRow, setPayRow] = React.useState<VatPeriodRow | null>(null);
  const rows = React.useMemo(() => vatPeriods(data, today), [data, today]);
  const current = React.useMemo(() => currentVatEstimate(data, today), [data, today]);
  const next = nextPeriodToDeclare(rows);
  const outstanding = vatOutstanding(data.vatReturns);
  const lastCredit = rows.at(-1) && rows.at(-1)!.net < 0 ? -rows.at(-1)!.net : 0;
  const yearPaid = vatPaid(data.vatReturns, { start: `${today.slice(0, 4)}-01-01`, end: today });
  const company = data.settings.company;
  const chart = [...rows.slice(-11), current].map((r) => ({ month: r.period, collected: r.collected, deductible: r.deductible }));
  const ordered = [...rows].reverse();

  const exportCsv = () =>
    downloadCSV(
      `tva-${today}.csv`,
      ["Période", "TVA collectée", "TVA déductible", "Crédit reporté", "Net", "Échéance", "État", "Déclarée le", "Payée le", "Référence"],
      rows.map((r) => [
        r.period,
        csvMoney(r.collected),
        csvMoney(r.deductible),
        csvMoney(r.creditCarriedIn),
        csvMoney(r.net),
        r.dueDate,
        VAT_STATE_LABELS[r.state],
        r.vatReturn?.declaredAt.slice(0, 10) ?? "",
        r.vatReturn?.paidDate ?? "",
        r.vatReturn?.reference ?? "",
      ]),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="TVA"
        description="Déclarations mensuelles calculées depuis les encaissements, remboursements et dépenses payées. Le paiement d'une déclaration est un décaissement qui réduit la trésorerie. Outil de gestion : aucune télédéclaration n'est effectuée."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Prochaine déclaration"
          icon={<CalendarClock />}
          value={next ? formatMonth(next.period, false) : "À jour"}
          tone={next?.state === "late" ? "danger" : "default"}
          hint={next ? `Échéance ${formatDate(next.dueDate)} (${formatDueIn(next.dueDate, today)}) · net ${formatEUR(next.net)}` : "Toutes les périodes complètes sont déclarées."}
        />
        <MetricCard label="TVA déclarée à payer" icon={<Wallet />} value={formatEUR(outstanding)} tone={outstanding > 0 ? "danger" : "default"} hint="Déclarations enregistrées non encore payées." />
        <MetricCard label="Crédit de TVA reporté" icon={<Landmark />} value={formatEUR(lastCredit)} hint="Imputé sur la période suivante (aucun remboursement de crédit demandé)." />
        <MetricCard
          label={`Estimation ${formatMonth(current.period, false)}`}
          value={formatEUR(current.net)}
          hint={`Mois en cours, au ${formatDate(today)} : collectée ${formatEUR(current.collected)} − déductible ${formatEUR(current.deductible)}${current.creditCarriedIn ? ` − crédit ${formatEUR(current.creditCarriedIn)}` : ""}.`}
        />
      </div>

      {next ? (
        <Card className={cn(next.state === "late" ? "border-danger/40" : "border-accent/40")}>
          <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-fg">Déclarer la TVA de {formatMonth(next.period, false)}</p>
              <p className="text-xs text-muted">
                Collectée {formatEUR(next.collected)} − déductible {formatEUR(next.deductible)}
                {next.creditCarriedIn ? ` − crédit reporté ${formatEUR(next.creditCarriedIn)}` : ""} = <span className="font-medium text-fg">{formatEUR(next.net)}</span>
                {next.net <= 0 ? " (crédit reporté sur la période suivante)" : ""}. Les montants seront figés et la période clôturée : plus aucun paiement, remboursement ni dépense payée ne pourra y
                être daté.
              </p>
            </div>
            <Button variant="primary" onClick={() => run(declareVatReturn, { period: next.period })}>
              <FileCheck2 /> Déclarer
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Périodes de TVA</CardTitle>
            <CardDescription>
              Depuis {formatMonth(company.vatTrackingStart.slice(0, 7), false)} · échéance le {company.vatDueDay} du mois suivant · TVA reversée en {today.slice(0, 4)} : {formatEUR(yearPaid)}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="relative overflow-x-auto">
          {rows.length ? (
            <table className="w-full text-sm">
              <caption className="sr-only">Périodes de TVA</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="py-2 font-medium">Période</th>
                  <th className="py-2 text-right font-medium">Collectée</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell">Déductible</th>
                  <th className="hidden py-2 text-right font-medium md:table-cell">Crédit reporté</th>
                  <th className="py-2 text-right font-medium">Net</th>
                  <th className="hidden py-2 pl-3 font-medium md:table-cell">Échéance</th>
                  <th className="py-2 pl-3 font-medium">État</th>
                  <th className="py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r) => (
                  <tr key={r.period} className="border-b border-border/60">
                    <td className="py-2 capitalize">{formatMonth(r.period, false)}</td>
                    <td className="py-2 text-right tabular">{formatEUR(r.collected)}</td>
                    <td className="hidden py-2 text-right tabular sm:table-cell">{formatEUR(r.deductible)}</td>
                    <td className="hidden py-2 text-right tabular text-muted md:table-cell">{r.creditCarriedIn ? formatEUR(r.creditCarriedIn) : "—"}</td>
                    <td className={cn("py-2 text-right font-medium tabular", r.net < 0 && "text-violet")}>{formatEUR(r.net)}</td>
                    <td className="hidden py-2 pl-3 text-muted md:table-cell">
                      {formatDate(r.dueDate)}
                      {r.vatReturn?.paidDate ? <span className="block text-[11px] text-subtle">payée le {formatDate(r.vatReturn.paidDate)}</span> : null}
                    </td>
                    <td className="py-2 pl-3">
                      <Badge tone={STATE_TONE[r.state]}>{VAT_STATE_LABELS[r.state]}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      {r.state === "declared" ? (
                        <Button size="sm" variant="primary" onClick={() => setPayRow(r)}>
                          Payer
                        </Button>
                      ) : next && r.period === next.period ? (
                        <Button size="sm" variant="secondary" onClick={() => run(declareVatReturn, { period: r.period })}>
                          Déclarer
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Aucune période complète" description="La première période sera déclarable à la fin du mois en cours." />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard title="TVA collectée et déductible" description="12 derniers mois — le dernier mois est en cours (estimation)">
          <MonthlyBarChart
            data={chart}
            series={[
              { key: "collected", label: "Collectée", color: SERIES[0] },
              { key: "deductible", label: "Déductible", color: SERIES[2] },
            ]}
          />
        </ChartCard>
        <Card>
          <CardHeader>
            <CardTitle>Règles de calcul</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted">
              <li>Régime de la TVA sur les encaissements (prestations de services), déclaration mensuelle.</li>
              <li>Collectée = part de TVA de chaque paiement client (TVA ÷ TTC de la facture), moins celle des remboursements du mois.</li>
              <li>Déductible = TVA des dépenses payées dans le mois.</li>
              <li>Net négatif : crédit reporté sur la période suivante.</li>
              <li>Déclarations dans l&apos;ordre chronologique ; une période déclarée est figée et clôturée.</li>
              <li>Les prévisions de trésorerie intègrent les déclarations à payer et la TVA nette estimée des flux futurs.</li>
            </ul>
            <p className="mt-3 text-[11px] text-subtle">Outil de gestion interne : ne remplace ni un logiciel comptable ni la déclaration officielle.</p>
          </CardContent>
        </Card>
      </div>

      <FormDialog open={!!payRow} onOpenChange={(o) => !o && setPayRow(null)} title={payRow ? `Payer la TVA de ${formatMonth(payRow.period, false)}` : "Payer la TVA"}>
        {payRow?.vatReturn ? <PayForm row={payRow} onDone={() => setPayRow(null)} /> : null}
      </FormDialog>
    </div>
  );
}

function PayForm({ row, onDone }: { row: VatPeriodRow; onDone: () => void }) {
  const run = useCommand();
  const today = useToday();
  const [date, setDate] = React.useState(today);
  const [reference, setReference] = React.useState("");
  const id = React.useId();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = run(payVatReturn, { id: row.vatReturn!.id, paidDate: date, reference });
        if (r.ok) onDone();
      }}
    >
      <p className="text-sm text-muted">
        Montant : <span className="font-semibold text-fg tabular">{formatEUR(row.net)}</span> · échéance {formatDate(row.dueDate)}. Le paiement est enregistré comme un décaissement de trésorerie
        (aucun virement n&apos;est émis).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-date`}>Date de paiement</Label>
          <Input id={`${id}-date`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-ref`}>Référence</Label>
          <Input id={`${id}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de télépaiement" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary">
          Enregistrer le paiement
        </Button>
      </div>
    </form>
  );
}
