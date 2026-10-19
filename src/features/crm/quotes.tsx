"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, FilePlus2, Pencil, Printer, Send, Trash2, X, ReceiptText } from "lucide-react";
import type { Quote, QuoteStatus } from "@/lib/domain/types";
import { useCommand, useData, useLookups } from "@/lib/store/hooks";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/forms/quick-create";
import { QuoteForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QUOTE_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatEUR, formatQuantity, formatVat } from "@/lib/formatters";
import { documentTotals, lineHT } from "@/lib/calculations/money";
import { csvMoney } from "@/lib/export/csv";

/* ----------------------------- Devis ----------------------------- */

type QuoteRow = Quote & { total: ReturnType<typeof documentTotals> };

export function QuotesPage() {
  const data = useData();
  const { clients } = useLookups();
  const openCreate = useUiStore((s) => s.openCreate);
  const f = useFilters(["status", "client"] as const);
  const rows: QuoteRow[] = data.quotes.filter((q) => f.match("status", q.status) && f.match("client", q.clientId)).map((q) => ({ ...q, total: documentTotals(q.items) }));
  const columns: Column<QuoteRow>[] = [
    { id: "number", header: "Numéro", cell: (q) => <span className="font-medium text-fg">{q.number}</span>, sortValue: (q) => q.number, csv: (q) => q.number },
    { id: "client", header: "Client", cell: (q) => clients.get(q.clientId)?.name ?? "—", sortValue: (q) => clients.get(q.clientId)?.name ?? "", csv: (q) => clients.get(q.clientId)?.name ?? "" },
    { id: "date", header: "Date", cell: (q) => formatDate(q.issueDate), sortValue: (q) => q.issueDate, csv: (q) => q.issueDate },
    { id: "expiry", header: "Expiration", cell: (q) => formatDate(q.expiryDate), sortValue: (q) => q.expiryDate, csv: (q) => q.expiryDate, hideBelow: "md" },
    { id: "ht", header: "Total HT", align: "right", cell: (q) => formatEUR(q.total.totalHT), sortValue: (q) => q.total.totalHT, csv: (q) => csvMoney(q.total.totalHT) },
    { id: "ttc", header: "Total TTC", align: "right", cell: (q) => formatEUR(q.total.totalTTC), sortValue: (q) => q.total.totalTTC, csv: (q) => csvMoney(q.total.totalTTC), hideBelow: "md" },
    { id: "status", header: "Statut", cell: (q) => <StatusBadge meta={QUOTE_STATUS[q.status]} />, sortValue: (q) => q.status, csv: (q) => QUOTE_STATUS[q.status].label },
  ];
  const sum = (s: QuoteStatus) => rows.filter((q) => q.status === s).reduce((a, q) => a + q.total.totalHT, 0);
  return (
    <div>
      <PageHeader
        title="Devis"
        description="Devis construits à partir du catalogue. Un devis accepté peut être converti en facture en conservant lignes, montants et client."
        actions={
          <Button variant="primary" onClick={() => openCreate("quote")}>
            <FilePlus2 /> Nouveau devis
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="En attente de réponse (HT)" value={formatEUR(sum("sent"), { round: true })} />
        <MetricCard label="Acceptés (HT)" value={formatEUR(sum("accepted"), { round: true })} tone="success" />
        <MetricCard label="Refusés / expirés (HT)" value={formatEUR(sum("refused") + sum("expired"), { round: true })} />
        <MetricCard label="Brouillons" value={rows.filter((q) => q.status === "draft").length} />
      </div>
      <DataTable
        caption="Liste des devis"
        rows={rows}
        columns={columns}
        searchText={(q) => `${q.number} ${clients.get(q.clientId)?.name ?? ""}`}
        rowHref={(q) => `/crm/devis/${q.id}`}
        exportName="devis"
        initialSort={{ id: "date", dir: "desc" }}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              { id: "status", label: "Statut", value: f.values.status, onChange: f.set("status"), options: Object.entries(QUOTE_STATUS).map(([value, m]) => ({ value, label: m.label })) },
              { id: "client", label: "Client", value: f.values.client, onChange: f.set("client"), options: data.clients.map((c) => ({ value: c.id, label: c.name })) },
            ]}
          />
        }
      />
    </div>
  );
}

export function QuoteDetail({ id }: { id: string }) {
  const data = useData();
  const run = useCommand();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [edit, setEdit] = React.useState(false);
  const quote = data.quotes.find((q) => q.id === id);
  if (!quote)
    return (
      <ErrorState
        title="Devis introuvable"
        action={
          <Button asChild>
            <Link href="/crm/devis">Retour aux devis</Link>
          </Button>
        }
      />
    );
  const client = data.clients.find((c) => c.id === quote.clientId);
  const t = documentTotals(quote.items);
  const contact = data.contacts.find((c) => c.clientId === quote.clientId && c.isPrimary);
  const setStatus = (status: QuoteStatus) => run(C.setQuoteStatus, { id, status });
  return (
    <div className="space-y-6">
      <Link href="/crm/devis" className="no-print inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Devis
      </Link>
      <PageHeader
        title={`Devis ${quote.number}`}
        description={`${client?.name ?? "—"} · émis le ${formatDate(quote.issueDate)} · valable jusqu'au ${formatDate(quote.expiryDate)}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {quote.status === "draft" ? (
              <Button variant="primary" onClick={() => setStatus("sent")}>
                <Send /> Marquer comme envoyé
              </Button>
            ) : null}
            {quote.status === "sent" ? (
              <>
                <Button variant="success" onClick={() => setStatus("accepted")}>
                  <Check /> Accepté
                </Button>
                <Button variant="danger" onClick={() => setStatus("refused")}>
                  <X /> Refusé
                </Button>
                <Button variant="ghost" onClick={() => setStatus("expired")}>
                  Expiré
                </Button>
              </>
            ) : null}
            {quote.status === "accepted" && !quote.invoiceId ? (
              <Button
                variant="primary"
                onClick={() => {
                  const r = run(C.convertQuoteToInvoice, { id });
                  if (r.ok) router.push(`/finances/factures/${r.result.id}`);
                }}
              >
                <ReceiptText /> Convertir en facture
              </Button>
            ) : null}
            {quote.invoiceId ? (
              <Button variant="secondary" asChild>
                <Link href={`/finances/factures/${quote.invoiceId}`}>
                  <CheckCircle2 /> Voir la facture
                </Link>
              </Button>
            ) : null}
            {quote.status === "draft" || quote.status === "sent" ? (
              <Button variant="secondary" onClick={() => setEdit(true)}>
                <Pencil /> Modifier
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Imprimer
            </Button>
            {quote.status === "draft" ? (
              <Button
                variant="ghost"
                onClick={() =>
                  confirm({
                    title: "Supprimer ce devis ?",
                    description: "Le brouillon sera supprimé.",
                    confirmLabel: "Supprimer",
                    action: () => {
                      const r = run(C.deleteQuote, { id });
                      if (r.ok) router.push("/crm/devis");
                    },
                  })
                }
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="mt-3">
          <StatusBadge meta={QUOTE_STATUS[quote.status]} />
        </div>
      </PageHeader>
      <Card className="print-area mx-auto max-w-4xl">
        <CardContent className="space-y-8 p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div>
              <p className="text-xl font-semibold text-fg">{data.settings.company.name}</p>
              <p className="text-xs text-muted">{data.settings.company.legalName}</p>
              <p className="text-xs text-muted">{data.settings.company.address}</p>
              <p className="text-xs text-muted">{data.settings.company.email}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wide text-subtle">Devis</p>
              <p className="text-lg font-semibold text-fg">{quote.number}</p>
              <p className="text-xs text-muted">Date : {formatDate(quote.issueDate)}</p>
              <p className="text-xs text-muted">Validité : {formatDate(quote.expiryDate)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-subtle">Destinataire</p>
            <p className="text-sm font-medium text-fg">{client?.name}</p>
            {contact ? (
              <p className="text-xs text-muted">
                À l&apos;attention de {contact.firstName} {contact.lastName}, {contact.jobTitle}
              </p>
            ) : null}
            <p className="text-xs text-muted">{client?.city}</p>
          </div>
          <table className="w-full text-sm">
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
              {quote.items.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2 pr-3">{l.description}</td>
                  <td className="py-2 text-right tabular">{formatQuantity(l.quantity)}</td>
                  <td className="py-2 text-right tabular">{formatEUR(l.unitPrice)}</td>
                  <td className="py-2 text-right tabular">{formatVat(l.vatRate)}</td>
                  <td className="py-2 text-right tabular">{formatEUR(lineHT(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto w-full max-w-xs space-y-1 text-sm tabular">
            <div className="flex justify-between">
              <dt className="text-muted">Total HT</dt>
              <dd>{formatEUR(t.totalHT)}</dd>
            </div>
            {t.breakdown.map((b) => (
              <div key={b.rate} className="flex justify-between text-xs">
                <dt className="text-subtle">TVA {formatVat(b.rate)}</dt>
                <dd>{formatEUR(b.vat)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt>Total TTC</dt>
              <dd>{formatEUR(t.totalTTC)}</dd>
            </div>
          </dl>
          {quote.notes ? <p className="text-xs text-muted">{quote.notes}</p> : null}
          <p className="text-[10px] text-subtle">Document fictif généré par BDO Software — Business Simulator (démonstration, sans valeur contractuelle).</p>
        </CardContent>
      </Card>
      <FormDialog open={edit} onOpenChange={setEdit} title={`Modifier ${quote.number}`} wide>
        <QuoteForm entity={quote} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </FormDialog>
      {dialog}
    </div>
  );
}
