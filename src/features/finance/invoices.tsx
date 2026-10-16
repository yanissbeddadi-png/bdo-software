"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Copy, FilePlus2, Pencil, Printer, Send, Trash2, Banknote, ArrowLeft, CheckCircle2, Undo2, FileMinus2, RotateCcw } from "lucide-react";
import type { InvoiceStatus } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useSummaries, useToday } from "@/lib/store/hooks";
import { useParam } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { RowActions } from "@/components/shared/row-actions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { FollowUpDialog } from "@/components/shared/follow-up-dialog";
import { FormDialog } from "@/components/forms/quick-create";
import { CreditNoteForm, InvoiceForm, PaymentForm, RefundForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { INVOICE_STATUS, PAYMENT_METHOD, ACTIVITY_TYPE } from "@/lib/formatters/labels";
import { formatDate, formatDateTime, formatEUR, formatQuantity, formatVat } from "@/lib/formatters";
import { lineHT } from "@/lib/calculations/money";
import { csvMoney } from "@/lib/export/csv";
import { creditableAmount, type InvoiceSummary } from "@/lib/calculations/invoices";
import { documentTotals } from "@/lib/calculations/money";
import { cn } from "@/lib/utils";

type Row = InvoiceSummary & { id: string };

export function InvoicesPage() {
  const data = useData();
  const summaries = useSummaries();
  const { clients } = useLookups();
  const openCreate = useUiStore((s) => s.openCreate);
  const statusParam = useParam("status");
  const f = useFilters(["status", "client", "kind"] as const);
  React.useEffect(() => {
    if (statusParam) f.set("status")(statusParam);
  }, [statusParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const [payFor, setPayFor] = React.useState<string | null>(null);
  const [followUp, setFollowUp] = React.useState<string | null>(null);

  const rows: Row[] = summaries
    .filter((s) => f.match("status", s.status) && f.match("client", s.invoice.clientId) && f.match("kind", s.invoice.subscriptionId ? "subscription" : s.invoice.projectId ? "project" : "other"))
    .map((s) => ({ ...s, id: s.invoice.id }));

  const totals = {
    billed: summaries.filter((s) => s.invoice.baseStatus === "issued").reduce((a, s) => a + s.totalTTC, 0),
    paid: summaries.reduce((a, s) => a + s.paid, 0),
    open: summaries.reduce((a, s) => a + s.balance, 0),
    overdue: summaries.filter((s) => s.status === "overdue").reduce((a, s) => a + s.balance, 0),
  };

  const columns: Column<Row>[] = [
    { id: "number", header: "Numéro", cell: (r) => <span className="font-medium text-fg">{r.invoice.number}</span>, sortValue: (r) => r.invoice.number, csv: (r) => r.invoice.number },
    {
      id: "client",
      header: "Client",
      cell: (r) => clients.get(r.invoice.clientId)?.name ?? "—",
      sortValue: (r) => clients.get(r.invoice.clientId)?.name ?? "",
      csv: (r) => clients.get(r.invoice.clientId)?.name ?? "",
    },
    { id: "issue", header: "Émission", cell: (r) => formatDate(r.invoice.issueDate), sortValue: (r) => r.invoice.issueDate, csv: (r) => r.invoice.issueDate, hideBelow: "md" },
    {
      id: "due",
      header: "Échéance",
      cell: (r) => <span className={cn(r.status === "overdue" && "text-danger")}>{formatDate(r.invoice.dueDate)}</span>,
      sortValue: (r) => r.invoice.dueDate,
      csv: (r) => r.invoice.dueDate,
    },
    { id: "ht", header: "Total HT", align: "right", cell: (r) => formatEUR(r.totalHT), sortValue: (r) => r.totalHT, csv: (r) => csvMoney(r.totalHT), hideBelow: "lg" },
    { id: "ttc", header: "Total TTC", align: "right", cell: (r) => formatEUR(r.totalTTC), sortValue: (r) => r.totalTTC, csv: (r) => csvMoney(r.totalTTC) },
    {
      id: "balance",
      header: "Solde",
      align: "right",
      cell: (r) => <span className={cn(r.balance > 0 ? "text-fg" : "text-subtle")}>{formatEUR(r.balance)}</span>,
      sortValue: (r) => r.balance,
      csv: (r) => csvMoney(r.balance),
    },
    { id: "status", header: "Statut", cell: (r) => <StatusBadge meta={INVOICE_STATUS[r.status]} />, sortValue: (r) => r.status, csv: (r) => INVOICE_STATUS[r.status].label },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <RowActions
          actions={[
            r.balance > 0 && { label: "Enregistrer un paiement", icon: <Banknote />, onSelect: () => setPayFor(r.invoice.id) },
            r.status === "overdue" && { label: "Consigner une relance", icon: <Send />, onSelect: () => setFollowUp(r.invoice.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Factures clients"
        description="Émission, suivi des échéances et encaissements. Les statuts « payée », « partiellement payée » et « en retard » sont calculés à partir des paiements et des dates."
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("payment")}>
              <Banknote /> Paiement
            </Button>
            <Button variant="primary" onClick={() => openCreate("invoice")}>
              <FilePlus2 /> Nouvelle facture
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total facturé (TTC)" value={formatEUR(totals.billed)} hint="Factures émises, hors brouillons et annulations." />
        <MetricCard label="Encaissé" value={formatEUR(totals.paid)} hint="Paiements enregistrés, nets des remboursements." />
        <MetricCard label="Reste à encaisser" value={formatEUR(totals.open)} hint="Créances clients : soldes des factures émises." />
        <MetricCard label="Dont échu" value={formatEUR(totals.overdue)} tone={totals.overdue ? "danger" : "default"} hint="Soldes des factures dont l'échéance est dépassée." />
      </div>
      <DataTable
        caption="Liste des factures"
        rows={rows}
        columns={columns}
        searchText={(r) => `${r.invoice.number} ${clients.get(r.invoice.clientId)?.name ?? ""} ${r.invoice.items.map((i) => i.description).join(" ")}`}
        searchPlaceholder="Numéro, client, désignation…"
        rowHref={(r) => `/finances/factures/${r.invoice.id}`}
        exportName="factures"
        initialSort={{ id: "issue", dir: "desc" }}
        emptyTitle="Aucune facture"
        emptyAction={<Button onClick={() => openCreate("invoice")}>Créer une facture</Button>}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              {
                id: "status",
                label: "Statut",
                value: f.values.status,
                onChange: f.set("status"),
                options: (Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((s) => ({ value: s, label: INVOICE_STATUS[s].label })),
              },
              { id: "client", label: "Client", value: f.values.client, onChange: f.set("client"), options: data.clients.map((c) => ({ value: c.id, label: c.name })) },
              {
                id: "kind",
                label: "Origine",
                value: f.values.kind,
                onChange: f.set("kind"),
                options: [
                  { value: "project", label: "Projet" },
                  { value: "subscription", label: "Abonnement" },
                  { value: "other", label: "Autre" },
                ],
              },
            ]}
          />
        }
      />
      <FormDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} title="Enregistrer un paiement">
        {payFor ? <PaymentForm defaults={{ invoiceId: payFor }} onDone={() => setPayFor(null)} onCancel={() => setPayFor(null)} /> : null}
      </FormDialog>
      {followUp ? <FollowUpDialog invoiceId={followUp} onClose={() => setFollowUp(null)} /> : null}
    </div>
  );
}

export function InvoiceDetail({ id }: { id: string }) {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const run = useCommand();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [edit, setEdit] = React.useState(false);
  const [pay, setPay] = React.useState(false);
  const [followUp, setFollowUp] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [creditOpen, setCreditOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const s = summaries.find((x) => x.invoice.id === id);
  if (!s)
    return (
      <ErrorState
        title="Facture introuvable"
        description="Elle a peut-être été supprimée."
        action={
          <Button asChild>
            <Link href="/finances/factures">Retour aux factures</Link>
          </Button>
        }
      />
    );
  const inv = s.invoice;
  const client = data.clients.find((c) => c.id === inv.clientId);
  const project = data.projects.find((p) => p.id === inv.projectId);
  const quote = data.quotes.find((q) => q.id === inv.quoteId);
  const payments = data.payments.filter((p) => p.invoiceId === id).sort((a, b) => a.date.localeCompare(b.date));
  const creditNotes = data.creditNotes.filter((c) => c.invoiceId === id).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const refunds = data.refunds.filter((r) => r.invoiceId === id).sort((a, b) => a.date.localeCompare(b.date));
  const creditable = creditableAmount(inv, data.creditNotes);
  const followUps = data.salesActivities.filter((a) => a.invoiceId === id).sort((a, b) => b.date.localeCompare(a.date));
  const audit = data.auditLogs.filter((a) => a.ref?.id === id).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link href="/finances/factures" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Factures
        </Link>
      </div>
      <PageHeader
        title={`Facture ${inv.number}`}
        description={
          <span>
            {client ? (
              <Link href={`/clients/${client.id}`} className="text-accent hover:underline">
                {client.name}
              </Link>
            ) : (
              "Client supprimé"
            )}{" "}
            · émise le {formatDate(inv.issueDate)} · échéance le {formatDate(inv.dueDate)}
          </span>
        }
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {inv.baseStatus === "draft" ? (
              <Button variant="primary" onClick={() => run(C.issueInvoice, { id })}>
                <CheckCircle2 /> Émettre
              </Button>
            ) : null}
            {s.balance > 0 ? (
              <Button variant="primary" onClick={() => setPay(true)}>
                <Banknote /> Enregistrer un paiement
              </Button>
            ) : null}
            {s.creditBalance > 0 ? (
              <Button variant="primary" onClick={() => setRefundOpen(true)}>
                <RotateCcw /> Rembourser {formatEUR(s.creditBalance)}
              </Button>
            ) : null}
            {inv.baseStatus === "issued" && creditable > 0 ? (
              <Button variant="secondary" onClick={() => setCreditOpen(true)}>
                <FileMinus2 /> Émettre un avoir
              </Button>
            ) : null}
            {s.status === "overdue" ? (
              <Button variant="secondary" onClick={() => setFollowUp(true)}>
                <Send /> Relancer
              </Button>
            ) : null}
            {inv.baseStatus !== "cancelled" ? (
              <Button variant="secondary" onClick={() => setEdit(true)}>
                <Pencil /> Modifier
              </Button>
            ) : null}
            <RowActions
              label="Autres actions"
              actions={[
                {
                  label: "Dupliquer",
                  icon: <Copy />,
                  onSelect: () => {
                    const r = run(C.duplicateInvoice, { id });
                    if (r.ok) router.push(`/finances/factures/${r.result.id}`);
                  },
                },
                { label: "Imprimer / PDF", icon: <Printer />, onSelect: () => window.print() },
                inv.baseStatus === "issued" && {
                  label: "Annuler la facture",
                  icon: <Ban />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => setCancelOpen(true),
                  disabled: payments.length > 0 || creditNotes.length > 0,
                },
                inv.baseStatus === "draft" && {
                  label: "Supprimer le brouillon",
                  icon: <Trash2 />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () =>
                    confirm({
                      title: "Supprimer ce brouillon ?",
                      description: "Le brouillon sera définitivement supprimé.",
                      confirmLabel: "Supprimer",
                      action: () => {
                        const r = run(C.deleteDraftInvoice, { id });
                        if (r.ok) router.push("/finances/factures");
                      },
                    }),
                },
              ]}
            />
          </div>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge meta={INVOICE_STATUS[s.status]} />
          {s.status === "overdue" ? <Badge tone="danger">{s.daysOverdue} j de retard</Badge> : null}
          {project ? (
            <Badge tone="violet">
              <Link href={`/projets/${project.id}`}>{project.code}</Link>
            </Badge>
          ) : null}
          {quote ? (
            <Badge>
              <Link href={`/crm/devis/${quote.id}`}>Devis {quote.number}</Link>
            </Badge>
          ) : null}
          {inv.subscriptionId ? <Badge tone="info">Abonnement</Badge> : null}
        </div>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="print-area">
          <CardHeader>
            <CardTitle>Lignes de facturation</CardTitle>
            <span className="text-xs text-muted">Prix figés à l&apos;émission</span>
          </CardHeader>
          <CardContent>
            <div className="hidden print:mb-4 print:block">
              <p className="text-lg font-semibold">{data.settings.company.legalName}</p>
              <p className="text-xs">{data.settings.company.address}</p>
              <p className="mt-2 text-xs">Document de démonstration — sans valeur légale.</p>
            </div>
            <div className="overflow-x-auto">
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
                  {inv.items.map((l) => (
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
            </div>
            <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm tabular">
              <div className="flex justify-between">
                <dt className="text-muted">Total HT</dt>
                <dd>{formatEUR(s.totalHT)}</dd>
              </div>
              {s.breakdown.map((b) => (
                <div key={b.rate} className="flex justify-between text-xs">
                  <dt className="text-subtle">
                    TVA {formatVat(b.rate)} sur {formatEUR(b.baseHT)}
                  </dt>
                  <dd>{formatEUR(b.vat)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Total TTC</dt>
                <dd>{formatEUR(s.totalTTC)}</dd>
              </div>
              {s.creditNotes.length ? (
                <>
                  <div className="flex justify-between text-warning">
                    <dt>Avoirs ({s.creditNotes.length})</dt>
                    <dd>−{formatEUR(s.creditedTTC)}</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>Net dû</dt>
                    <dd>{formatEUR(s.netTTC)}</dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between text-success">
                <dt>{s.refunded ? "Encaissé net (après remboursements)" : "Déjà payé"}</dt>
                <dd>{formatEUR(s.paid)}</dd>
              </div>
              {s.creditBalance > 0 ? (
                <div className="flex justify-between font-semibold text-warning">
                  <dt>Trop-perçu à rembourser</dt>
                  <dd>{formatEUR(s.creditBalance)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold">
                <dt>Solde restant</dt>
                <dd className={cn(s.status === "overdue" && "text-danger")}>{formatEUR(s.balance)}</dd>
              </div>
            </dl>
            {inv.notes ? <p className="mt-4 whitespace-pre-line rounded-lg bg-bg-elevated p-3 text-xs text-muted">{inv.notes}</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Paiements ({payments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length ? (
                <ul className="space-y-2">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
                      <Banknote className="size-4 text-success" />
                      <div className="min-w-0 flex-1">
                        <p className="tabular text-fg">{formatEUR(p.amount)}</p>
                        <p className="text-[11px] text-muted">
                          {formatDate(p.date)} · {PAYMENT_METHOD[p.method]} {p.reference ? `· ${p.reference}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Supprimer le paiement"
                        onClick={() =>
                          confirm({
                            title: "Supprimer ce paiement ?",
                            description: "Utilisez cette action uniquement pour corriger une erreur de saisie. L'opération est journalisée et les soldes seront recalculés.",
                            confirmLabel: "Supprimer",
                            action: () => run(C.deletePayment, { id: p.id }),
                          })
                        }
                      >
                        <Undo2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Aucun paiement"
                  description={inv.baseStatus === "draft" ? "Émettez la facture pour pouvoir enregistrer un paiement." : "Aucun encaissement enregistré pour cette facture."}
                />
              )}
            </CardContent>
          </Card>
          {creditNotes.length || refunds.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Avoirs et remboursements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {creditNotes.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
                      <FileMinus2 className="size-4 text-warning" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/finances/avoirs/${c.id}`} className="font-medium text-fg hover:text-accent hover:underline">
                          {c.number}
                        </Link>
                        <p className="truncate text-[11px] text-muted">
                          {formatDate(c.issueDate)} · {c.reason}
                        </p>
                      </div>
                      <span className="tabular text-warning">−{formatEUR(documentTotals(c.items).totalTTC)}</span>
                    </li>
                  ))}
                  {refunds.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
                      <RotateCcw className="size-4 text-danger" />
                      <div className="min-w-0 flex-1">
                        <p className="text-fg">Remboursement</p>
                        <p className="truncate text-[11px] text-muted">
                          {formatDate(r.date)} · {PAYMENT_METHOD[r.method]} {r.reference ? `· ${r.reference}` : ""}
                        </p>
                      </div>
                      <span className="tabular text-danger">−{formatEUR(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Relances et historique</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {followUps.map((a) => (
                <p key={a.id} className="text-muted">
                  <span className="text-fg">{ACTIVITY_TYPE[a.type]}</span> · {formatDateTime(a.date)} — {a.notes || a.subject}
                </p>
              ))}
              {audit.map((a) => (
                <p key={a.id} className="text-subtle">
                  {formatDateTime(a.at)} · {a.action} · {a.actor}
                </p>
              ))}
              {!followUps.length && !audit.length ? <p className="text-muted">Aucun événement.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <FormDialog
        open={edit}
        onOpenChange={setEdit}
        title={`Modifier ${inv.number}`}
        description={inv.baseStatus === "issued" ? "Facture émise : seuls l'échéance, le projet et les notes restent modifiables." : undefined}
        wide
      >
        <InvoiceForm entity={inv} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </FormDialog>
      <FormDialog open={pay} onOpenChange={setPay} title="Enregistrer un paiement">
        <PaymentForm defaults={{ invoiceId: id }} onDone={() => setPay(false)} onCancel={() => setPay(false)} />
      </FormDialog>
      <FormDialog
        open={creditOpen}
        onOpenChange={setCreditOpen}
        title={`Émettre un avoir sur ${inv.number}`}
        description="L'avoir réduit le chiffre d'affaires à sa date d'émission et le montant dû. Si la facture est déjà payée, le trop-perçu devra être remboursé."
        wide
      >
        <CreditNoteForm defaults={{ invoiceId: id }} onDone={() => setCreditOpen(false)} onCancel={() => setCreditOpen(false)} />
      </FormDialog>
      <FormDialog open={refundOpen} onOpenChange={setRefundOpen} title="Rembourser le client" description="Décaissement réel : réduit la trésorerie et la TVA collectée du mois du remboursement.">
        <RefundForm defaults={{ invoiceId: id }} onDone={() => setRefundOpen(false)} onCancel={() => setRefundOpen(false)} />
      </FormDialog>
      <FormDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Annuler la facture"
        description="Réservé aux factures émises par erreur, sans paiement ni avoir. Pour annuler une facture comptablement, émettez plutôt un avoir. Action journalisée."
      >
        <Label htmlFor="cancel-reason">Motif d&apos;annulation</Label>
        <Input id="cancel-reason" className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Erreur de saisie, projet annulé…" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>
            Retour
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const r = run(C.cancelInvoice, { id, reason });
              if (r.ok) setCancelOpen(false);
            }}
          >
            Confirmer l&apos;annulation
          </Button>
        </div>
      </FormDialog>
      {followUp ? <FollowUpDialog invoiceId={id} onClose={() => setFollowUp(false)} /> : null}
      {dialog}
      <p className="text-[11px] text-subtle">Échéance {today > inv.dueDate && s.balance > 0 ? "dépassée" : "à venir"} · outil de gestion interne, pas un logiciel de facturation certifié.</p>
    </div>
  );
}
