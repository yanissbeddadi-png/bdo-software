"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RotateCcw } from "lucide-react";
import { useData, useLookups, useSummaries, useToday } from "@/lib/store/hooks";
import { documentTotals, lineHT } from "@/lib/calculations/money";
import { inPeriod, monthKey } from "@/lib/calculations/dates";
import { DataTable, type Column } from "@/components/tables/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { ErrorState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/forms/quick-create";
import { RefundForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatEUR, formatQuantity, formatVat } from "@/lib/formatters";
import { csvMoney } from "@/lib/export/csv";
import type { CreditNote } from "@/lib/domain/types";

type Row = CreditNote & { totalHT: number; totalTTC: number; invoiceNumber: string; clientName: string; full: boolean };

export function CreditNotesPage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const { clients } = useLookups();
  const invoices = new Map(data.invoices.map((i) => [i.id, i]));
  const rows: Row[] = data.creditNotes.map((c) => {
    const t = documentTotals(c.items);
    const inv = invoices.get(c.invoiceId);
    const full = summaries.find((s) => s.invoice.id === c.invoiceId)?.status === "credited";
    return { ...c, totalHT: t.totalHT, totalTTC: t.totalTTC, invoiceNumber: inv?.number ?? "—", clientName: clients.get(c.clientId)?.name ?? "—", full };
  });
  const year = { start: `${today.slice(0, 4)}-01-01`, end: today };
  const yearHT = rows.filter((r) => inPeriod(r.issueDate, year)).reduce((s, r) => s + r.totalHT, 0);
  const refunded = data.refunds.reduce((s, r) => s + r.amount, 0);
  const toRefund = summaries.filter((s) => s.creditBalance > 0);

  const columns: Column<Row>[] = [
    { id: "number", header: "Numéro", cell: (r) => <span className="whitespace-nowrap font-medium text-fg">{r.number}</span>, sortValue: (r) => r.number, csv: (r) => r.number },
    { id: "date", header: "Date", cell: (r) => formatDate(r.issueDate), sortValue: (r) => r.issueDate, csv: (r) => r.issueDate },
    { id: "client", header: "Client", cell: (r) => r.clientName, sortValue: (r) => r.clientName, csv: (r) => r.clientName },
    {
      id: "invoice",
      header: "Facture",
      cell: (r) => (
        <Link href={`/finances/factures/${r.invoiceId}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-accent hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
      sortValue: (r) => r.invoiceNumber,
      csv: (r) => r.invoiceNumber,
      hideBelow: "md",
    },
    { id: "reason", header: "Motif", cell: (r) => <span className="line-clamp-1 text-muted">{r.reason}</span>, csv: (r) => r.reason, hideBelow: "lg" },
    { id: "ht", header: "Montant HT", align: "right", cell: (r) => formatEUR(-r.totalHT), sortValue: (r) => r.totalHT, csv: (r) => csvMoney(-r.totalHT), hideBelow: "md" },
    { id: "ttc", header: "Montant TTC", align: "right", cell: (r) => formatEUR(-r.totalTTC), sortValue: (r) => r.totalTTC, csv: (r) => csvMoney(-r.totalTTC) },
    {
      id: "kind",
      header: "Portée",
      cell: (r) => <Badge tone={r.full ? "neutral" : "warning"}>{r.full ? "Facture soldée par avoir" : "Partiel"}</Badge>,
      csv: (r) => (r.full ? "total" : "partiel"),
      hideBelow: "sm",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Avoirs"
        description="Un avoir annule tout ou partie d'une facture émise. Il réduit le chiffre d'affaires à sa date d'émission, le montant dû par le client et — via les remboursements — la TVA collectée. Pour émettre un avoir, ouvrez la facture concernée."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/finances/factures">Choisir une facture</Link>
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Avoirs émis" value={String(rows.length)} hint="Nombre total d'avoirs." />
        <MetricCard label={`Avoirs HT ${today.slice(0, 4)}`} value={formatEUR(yearHT)} hint="Déduits du CA facturé de l'année, à leur date d'émission." />
        <MetricCard label="Remboursements effectués" value={formatEUR(refunded)} hint="Trop-perçus reversés aux clients (décaissements)." />
        <MetricCard
          label="Trop-perçus à rembourser"
          value={formatEUR(toRefund.reduce((s, x) => s + x.creditBalance, 0))}
          tone={toRefund.length ? "danger" : "default"}
          hint={`${toRefund.length} facture(s) payée(s) puis créditée(s) sans remboursement.`}
        />
      </div>
      {toRefund.length ? (
        <Card className="mb-5 border-warning/40">
          <CardHeader>
            <CardTitle>Remboursements en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {toRefund.map((s) => (
                <PendingRefund key={s.invoice.id} invoiceId={s.invoice.id} label={`${s.invoice.number} · ${clients.get(s.invoice.clientId)?.name ?? ""}`} amount={s.creditBalance} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <DataTable
        caption="Liste des avoirs"
        rows={rows}
        columns={columns}
        searchText={(r) => `${r.number} ${r.invoiceNumber} ${r.clientName} ${r.reason}`}
        searchPlaceholder="Numéro, facture, client, motif…"
        rowHref={(r) => `/finances/avoirs/${r.id}`}
        exportName="avoirs"
        initialSort={{ id: "date", dir: "desc" }}
        emptyTitle="Aucun avoir"
        emptyDescription="Les avoirs s'émettent depuis la fiche d'une facture émise."
      />
    </div>
  );
}

function PendingRefund({ invoiceId, label, amount }: { invoiceId: string; label: string; amount: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
      <Link href={`/finances/factures/${invoiceId}`} className="min-w-0 flex-1 truncate text-fg hover:underline">
        {label}
      </Link>
      <span className="tabular text-warning">{formatEUR(amount)}</span>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        <RotateCcw /> Rembourser
      </Button>
      <FormDialog open={open} onOpenChange={setOpen} title="Rembourser le client" description="Décaissement réel : réduit la trésorerie et la TVA collectée du mois.">
        <RefundForm defaults={{ invoiceId }} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </FormDialog>
    </li>
  );
}

export function CreditNoteDetail({ id }: { id: string }) {
  const data = useData();
  const note = data.creditNotes.find((c) => c.id === id);
  if (!note)
    return (
      <ErrorState
        title="Avoir introuvable"
        action={
          <Button asChild>
            <Link href="/finances/avoirs">Retour aux avoirs</Link>
          </Button>
        }
      />
    );
  const invoice = data.invoices.find((i) => i.id === note.invoiceId);
  const client = data.clients.find((c) => c.id === note.clientId);
  const t = documentTotals(note.items);
  const refunds = data.refunds.filter((r) => r.creditNoteId === note.id);
  const company = data.settings.company;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link href="/finances/avoirs" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Avoirs
        </Link>
      </div>
      <PageHeader
        title={`Avoir ${note.number}`}
        description={
          <span>
            {client ? (
              <Link href={`/clients/${client.id}`} className="text-accent hover:underline">
                {client.name}
              </Link>
            ) : (
              "Client supprimé"
            )}{" "}
            · émis le {formatDate(note.issueDate)} · période de TVA {monthKey(note.issueDate)}
          </span>
        }
        actions={
          <div className="no-print flex gap-2">
            {invoice ? (
              <Button variant="secondary" asChild>
                <Link href={`/finances/factures/${invoice.id}`}>Facture {invoice.number}</Link>
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Imprimer / PDF
            </Button>
          </div>
        }
      />
      <Card className="print-area">
        <CardContent className="pt-5">
          <div className="mb-5 flex flex-wrap justify-between gap-4 text-xs">
            <div>
              <p className="text-sm font-semibold text-fg">{company.legalName}</p>
              <p className="text-muted">{company.address}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-fg">Avoir {note.number}</p>
              <p className="text-muted">Date : {formatDate(note.issueDate)}</p>
              <p className="text-muted">Facture d&apos;origine : {invoice?.number ?? "—"}</p>
              <p className="text-muted">Client : {client?.name ?? "—"}</p>
            </div>
          </div>
          <p className="mb-4 rounded-lg bg-bg-elevated p-3 text-xs text-muted">Motif : {note.reason}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Lignes de l&apos;avoir</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="py-2 font-medium">Désignation</th>
                  <th className="py-2 text-right font-medium">Qté</th>
                  <th className="py-2 text-right font-medium">PU HT</th>
                  <th className="py-2 text-right font-medium">TVA</th>
                  <th className="py-2 text-right font-medium">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {note.items.map((l) => (
                  <tr key={l.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{l.description}</td>
                    <td className="py-2 text-right tabular">{formatQuantity(l.quantity)}</td>
                    <td className="py-2 text-right tabular">{formatEUR(l.unitPrice)}</td>
                    <td className="py-2 text-right tabular">{formatVat(l.vatRate)}</td>
                    <td className="py-2 text-right tabular">{formatEUR(-lineHT(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm tabular">
            <div className="flex justify-between">
              <dt className="text-muted">Total HT</dt>
              <dd>{formatEUR(-t.totalHT)}</dd>
            </div>
            {t.breakdown.map((b) => (
              <div key={b.rate} className="flex justify-between text-xs">
                <dt className="text-subtle">TVA {formatVat(b.rate)}</dt>
                <dd>{formatEUR(-b.vat)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>Total TTC</dt>
              <dd>{formatEUR(-t.totalTTC)}</dd>
            </div>
          </dl>
          <p className="mt-6 text-[11px] text-subtle">Document de démonstration généré par un outil de gestion interne — sans valeur légale.</p>
        </CardContent>
      </Card>
      {refunds.length ? (
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Remboursements liés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {refunds.map((r) => (
              <p key={r.id} className="flex justify-between">
                <span className="text-muted">
                  {formatDate(r.date)} {r.reference ? `· ${r.reference}` : ""}
                </span>
                <span className="tabular text-danger">−{formatEUR(r.amount)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
