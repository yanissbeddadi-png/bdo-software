"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, FilePlus2, Handshake, MessageSquarePlus, Pencil, Plus, Printer, Send, Trash2, UserCheck, X, ReceiptText } from "lucide-react";
import type { Lead, Quote, QuoteStatus, SalesActivity, SalesActivityType } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { RowActions } from "@/components/shared/row-actions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/forms/quick-create";
import { LeadForm, QuoteForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIVITY_TYPE, LEAD_STATUS, PRIORITY, QUOTE_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDateTime, formatEUR, formatQuantity, formatVat } from "@/lib/formatters";
import { documentTotals, lineHT } from "@/lib/calculations/money";
import { csvMoney } from "@/lib/export/csv";
import { cn } from "@/lib/utils";

/* ----------------------------- Prospects ----------------------------- */

export function LeadsPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const router = useRouter();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const { confirm, dialog } = useConfirm();
  const f = useFilters(["status", "priority", "source"] as const);
  const [editId, setEditId] = useSyncedState<string | null>(focus);
  const edit = data.leads.find((x) => x.id === editId) ?? null;
  const setEdit = (l: Lead | null) => setEditId(l?.id ?? null);

  const rows = data.leads.filter((l) => f.match("status", l.status) && f.match("priority", l.priority) && f.match("source", l.source));
  const sources = [...new Set(data.leads.map((l) => l.source))];
  const columns: Column<Lead>[] = [
    { id: "company", header: "Entreprise", cell: (l) => <span className="font-medium text-fg">{l.company}</span>, sortValue: (l) => l.company, csv: (l) => l.company },
    { id: "contact", header: "Contact", cell: (l) => l.contactName || "—", csv: (l) => l.contactName, hideBelow: "md" },
    { id: "sector", header: "Secteur", cell: (l) => l.sector, sortValue: (l) => l.sector, csv: (l) => l.sector, hideBelow: "lg" },
    { id: "source", header: "Source", cell: (l) => l.source, sortValue: (l) => l.source, csv: (l) => l.source, hideBelow: "lg" },
    { id: "priority", header: "Priorité", cell: (l) => <StatusBadge meta={PRIORITY[l.priority]} />, sortValue: (l) => ["critical", "high", "normal", "low"].indexOf(l.priority), csv: (l) => PRIORITY[l.priority].label },
    { id: "status", header: "Statut", cell: (l) => <StatusBadge meta={LEAD_STATUS[l.status]} />, sortValue: (l) => l.status, csv: (l) => LEAD_STATUS[l.status].label },
    {
      id: "next",
      header: "Prochaine action",
      cell: (l) =>
        l.status === "converted" ? (
          <Link href={`/clients/${l.convertedClientId}`} className="text-xs text-accent hover:underline">
            Voir le client
          </Link>
        ) : (
          <div className="text-xs">
            <p className="truncate text-fg">{l.nextAction || "—"}</p>
            {l.nextActionDate ? <p className={cn(l.nextActionDate < today ? "text-danger" : "text-muted")}>{l.nextActionDate < today ? "Relance en retard · " : ""}{formatDate(l.nextActionDate)}</p> : null}
          </div>
        ),
      sortValue: (l) => l.nextActionDate ?? "9999",
      csv: (l) => `${l.nextAction} ${l.nextActionDate ?? ""}`,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (l) => (
        <RowActions
          actions={[
            { label: "Modifier", icon: <Pencil />, onSelect: () => setEdit(l) },
            l.status !== "converted" && { label: "Consigner une activité", icon: <MessageSquarePlus />, onSelect: () => openCreate("activity", { leadId: l.id }) },
            l.status !== "converted" && { label: "Créer une opportunité", icon: <Handshake />, onSelect: () => openCreate("opportunity", { leadId: l.id }) },
            l.status === "qualified" && {
              label: "Convertir en client",
              icon: <UserCheck />,
              onSelect: () =>
                confirm({
                  title: `Convertir ${l.company} en client ?`,
                  description: "Un client et son contact principal seront créés ; les opportunités et activités du prospect lui seront rattachées.",
                  confirmLabel: "Convertir",
                  tone: "primary",
                  action: () => {
                    const r = run(C.convertLead, { id: l.id });
                    if (r.ok) router.push(`/clients/${r.result.id}`);
                  },
                }),
            },
            l.status !== "converted" && { label: "Supprimer", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => confirm({ title: "Supprimer ce prospect ?", description: `« ${l.company} » sera supprimé.`, confirmLabel: "Supprimer", action: () => run(C.deleteLead, { id: l.id }) }) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Prospection"
        description="Suivi des prospects, relances et conversion en clients. Les doublons évidents (même entreprise ou même e-mail) sont refusés."
        actions={
          <Button variant="primary" onClick={() => openCreate("lead")}>
            <Plus /> Nouveau prospect
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Prospects actifs" value={data.leads.filter((l) => !["converted", "unqualified"].includes(l.status)).length} />
        <MetricCard label="Qualifiés" value={data.leads.filter((l) => l.status === "qualified").length} tone="success" />
        <MetricCard label="Relances en retard" value={data.leads.filter((l) => l.status !== "converted" && l.nextActionDate && l.nextActionDate < today).length} tone="danger" />
        <MetricCard label="Convertis" value={data.leads.filter((l) => l.status === "converted").length} tone="gold" />
      </div>
      <DataTable
        caption="Liste des prospects"
        rows={rows}
        columns={columns}
        searchText={(l) => `${l.company} ${l.contactName} ${l.sector} ${l.email}`}
        exportName="prospects"
        onRowClick={(l) => setEdit(l)}
        highlightId={focus}
        initialSort={{ id: "next", dir: "asc" }}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              { id: "status", label: "Statut", value: f.values.status, onChange: f.set("status"), options: Object.entries(LEAD_STATUS).map(([value, m]) => ({ value, label: m.label })) },
              { id: "priority", label: "Priorité", value: f.values.priority, onChange: f.set("priority"), options: Object.entries(PRIORITY).map(([value, m]) => ({ value, label: m.label })) },
              { id: "source", label: "Source", value: f.values.source, onChange: f.set("source"), options: sources.map((s) => ({ value: s, label: s })) },
            ]}
          />
        }
      />
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.company ?? ""} wide>
        {edit ? (
          <>
            <LeadForm entity={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} />
            <Interactions activities={data.salesActivities.filter((a) => a.leadId === edit.id)} />
          </>
        ) : null}
      </FormDialog>
      {dialog}
    </div>
  );
}

function Interactions({ activities }: { activities: SalesActivity[] }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-medium">Historique des interactions ({activities.length})</h3>
      <ul className="space-y-1.5 text-xs">
        {[...activities].sort((a, b) => b.date.localeCompare(a.date)).map((a) => (
          <li key={a.id} className="flex gap-2">
            <Badge tone={a.done ? "neutral" : "info"}>{ACTIVITY_TYPE[a.type]}</Badge>
            <span className="text-muted">{formatDateTime(a.date)}</span>
            <span className="truncate text-fg">{a.subject}</span>
          </li>
        ))}
        {!activities.length ? <li className="text-muted">Aucune interaction.</li> : null}
      </ul>
    </div>
  );
}

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
  if (!quote) return <ErrorState title="Devis introuvable" action={<Button asChild><Link href="/crm/devis">Retour aux devis</Link></Button>} />;
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
              <Button variant="ghost" onClick={() => confirm({ title: "Supprimer ce devis ?", description: "Le brouillon sera supprimé.", confirmLabel: "Supprimer", action: () => { const r = run(C.deleteQuote, { id }); if (r.ok) router.push("/crm/devis"); } })}>
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
            {contact ? <p className="text-xs text-muted">À l&apos;attention de {contact.firstName} {contact.lastName}, {contact.jobTitle}</p> : null}
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

/* ----------------------------- Activités ----------------------------- */

export function ActivitiesPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const { clients, leads, opportunities } = useLookups();
  const openCreate = useUiStore((s) => s.openCreate);
  const { confirm, dialog } = useConfirm();
  const f = useFilters(["type", "done"] as const);
  const rows = data.salesActivities.filter((a) => f.match("type", a.type) && f.match("done", a.done ? "done" : "planned"));
  const linked = (a: SalesActivity) => {
    if (a.opportunityId) return { href: `/crm?focus=${a.opportunityId}`, label: opportunities.get(a.opportunityId)?.name ?? "Opportunité" };
    if (a.clientId) return { href: `/clients/${a.clientId}`, label: clients.get(a.clientId)?.name ?? "Client" };
    if (a.leadId) return { href: `/crm/prospects?focus=${a.leadId}`, label: leads.get(a.leadId)?.company ?? "Prospect" };
    return null;
  };
  const columns: Column<SalesActivity>[] = [
    { id: "date", header: "Date", cell: (a) => <span className={cn(!a.done && a.date.slice(0, 10) < today && "text-danger")}>{formatDateTime(a.date)}</span>, sortValue: (a) => a.date, csv: (a) => a.date },
    { id: "type", header: "Type", cell: (a) => <Badge tone={a.type === "followup" ? "warning" : "neutral"}>{ACTIVITY_TYPE[a.type]}</Badge>, sortValue: (a) => a.type, csv: (a) => ACTIVITY_TYPE[a.type] },
    { id: "subject", header: "Objet", cell: (a) => <span className="text-fg">{a.subject}</span>, sortValue: (a) => a.subject, csv: (a) => a.subject },
    {
      id: "link",
      header: "Lié à",
      cell: (a) => {
        const l = linked(a);
        return l ? <Link href={l.href} className="text-accent hover:underline">{l.label}</Link> : "—";
      },
      csv: (a) => linked(a)?.label ?? "",
      hideBelow: "md",
    },
    { id: "state", header: "État", cell: (a) => (a.done ? <Badge tone="success">Réalisée</Badge> : <Badge tone="info">Planifiée</Badge>), sortValue: (a) => (a.done ? 1 : 0), csv: (a) => (a.done ? "Réalisée" : "Planifiée") },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (a) => (
        <RowActions
          actions={[
            !a.done && { label: "Marquer comme réalisée", icon: <CheckCircle2 />, onSelect: () => run(C.completeSalesActivity, { id: a.id }) },
            { label: "Supprimer", icon: <Trash2 />, danger: true, onSelect: () => confirm({ title: "Supprimer cette activité ?", description: a.subject, confirmLabel: "Supprimer", action: () => run(C.deleteSalesActivity, { id: a.id }) }) },
          ]}
        />
      ),
    },
  ];
  const types = Object.keys(ACTIVITY_TYPE) as SalesActivityType[];
  return (
    <div>
      <PageHeader
        title="Activités commerciales"
        description="Appels, e-mails, réunions, démonstrations, relances et notes liés à un client, un prospect ou une opportunité. Les activités planifiées servent de rappels."
        actions={
          <Button variant="primary" onClick={() => openCreate("activity")}>
            <Plus /> Nouvelle activité
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Activités réalisées (30 j)" value={data.salesActivities.filter((a) => a.done && a.date.slice(0, 10) >= new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10)).length} />
        <MetricCard label="Planifiées" value={data.salesActivities.filter((a) => !a.done).length} />
        <MetricCard label="Rappels en retard" value={data.salesActivities.filter((a) => !a.done && a.date.slice(0, 10) < today).length} tone="danger" />
        <MetricCard label="Relances consignées" value={data.salesActivities.filter((a) => a.type === "followup").length} />
      </div>
      <DataTable
        caption="Activités commerciales"
        rows={rows}
        columns={columns}
        searchText={(a) => `${a.subject} ${a.notes} ${linked(a)?.label ?? ""}`}
        exportName="activites-commerciales"
        initialSort={{ id: "date", dir: "desc" }}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              { id: "type", label: "Type", value: f.values.type, onChange: f.set("type"), options: types.map((t) => ({ value: t, label: ACTIVITY_TYPE[t] })) },
              { id: "done", label: "État", value: f.values.done, onChange: f.set("done"), options: [{ value: "done", label: "Réalisées" }, { value: "planned", label: "Planifiées" }] },
            ]}
          />
        }
      />
      {dialog}
    </div>
  );
}
