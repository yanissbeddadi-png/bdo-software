"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, FileText, FolderPlus, Handshake, MessageSquarePlus, NotebookPen, Pencil, Plus, Star, Trash2, UserPlus, Paperclip } from "lucide-react";
import type { Client, ClientStatus, Contact } from "@/lib/domain/types";
import { useCommand, useData, useSummaries, useToday } from "@/lib/store/hooks";
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
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/forms/quick-create";
import { ClientForm, ContactForm, NoteForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { ACTIVITY_TYPE, CLIENT_STATUS, INVOICE_STATUS, PAYMENT_METHOD, PROJECT_STATUS, QUOTE_STATUS, SUBSCRIPTION_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDateTime, formatEUR } from "@/lib/formatters";
import { csvMoney } from "@/lib/export/csv";
import { STAGE_LABELS, isOpen } from "@/lib/calculations/pipeline";
import { documentTotals } from "@/lib/calculations/money";
import { computeMRR, monthlyValue, PERIODICITY_LABELS } from "@/lib/calculations/recurring";
import { projectProgress } from "@/lib/calculations/projects";
import type { InvoiceSummary } from "@/lib/calculations/invoices";

interface ClientStats {
  billed: number;
  collected: number;
  balance: number;
  overdue: number;
  projects: number;
  activeContracts: number;
  mrr: number;
  lastInteraction: string | null;
}

function useClientStats() {
  const data = useData();
  const summaries = useSummaries();
  const today = useToday();
  return React.useMemo(() => {
    const map = new Map<string, ClientStats>();
    const get = (id: string) => {
      let s = map.get(id);
      if (!s) {
        s = { billed: 0, collected: 0, balance: 0, overdue: 0, projects: 0, activeContracts: 0, mrr: 0, lastInteraction: null };
        map.set(id, s);
      }
      return s;
    };
    for (const s of summaries) {
      if (s.invoice.baseStatus !== "issued") continue;
      const st = get(s.invoice.clientId);
      st.billed += s.totalHT;
      st.collected += s.paid;
      st.balance += s.balance;
      if (s.status === "overdue") st.overdue += s.balance;
    }
    for (const p of data.projects) get(p.clientId).projects++;
    for (const sub of data.subscriptions) {
      if (sub.status !== "active") continue;
      const st = get(sub.clientId);
      st.activeContracts++;
    }
    for (const c of data.clients) get(c.id).mrr = computeMRR(data.subscriptions.filter((s) => s.clientId === c.id), today);
    for (const a of data.salesActivities) {
      if (!a.done || !a.clientId) continue;
      const st = get(a.clientId);
      if (!st.lastInteraction || a.date > st.lastInteraction) st.lastInteraction = a.date;
    }
    return map;
  }, [data, summaries, today]);
}

type Row = Client & { stats: ClientStats; primary?: Contact };

export function ClientsPage() {
  const data = useData();
  const stats = useClientStats();
  const openCreate = useUiStore((s) => s.openCreate);
  const f = useFilters(["status", "sector"] as const);
  const rows: Row[] = data.clients
    .filter((c) => f.match("status", c.status) && f.match("sector", c.sector))
    .map((c) => ({ ...c, stats: stats.get(c.id)!, primary: data.contacts.find((x) => x.clientId === c.id && x.isPrimary) }));
  const sectors = [...new Set(data.clients.map((c) => c.sector))].sort();
  const columns: Column<Row>[] = [
    { id: "name", header: "Client", cell: (c) => <span className="font-medium text-fg">{c.name}</span>, sortValue: (c) => c.name, csv: (c) => c.name },
    { id: "sector", header: "Secteur", cell: (c) => c.sector, sortValue: (c) => c.sector, csv: (c) => c.sector, hideBelow: "lg" },
    { id: "status", header: "Statut", cell: (c) => <StatusBadge meta={CLIENT_STATUS[c.status]} />, sortValue: (c) => c.status, csv: (c) => CLIENT_STATUS[c.status].label },
    { id: "contact", header: "Contact principal", cell: (c) => (c.primary ? `${c.primary.firstName} ${c.primary.lastName}` : <span className="text-subtle">—</span>), csv: (c) => (c.primary ? `${c.primary.firstName} ${c.primary.lastName}` : ""), hideBelow: "lg" },
    { id: "billed", header: "Facturé HT", align: "right", cell: (c) => formatEUR(c.stats.billed, { round: true }), sortValue: (c) => c.stats.billed, csv: (c) => csvMoney(c.stats.billed) },
    { id: "collected", header: "Encaissé", align: "right", cell: (c) => formatEUR(c.stats.collected, { round: true }), sortValue: (c) => c.stats.collected, csv: (c) => csvMoney(c.stats.collected), hideBelow: "md" },
    { id: "balance", header: "Impayé", align: "right", cell: (c) => <span className={c.stats.overdue > 0 ? "text-danger" : c.stats.balance ? "text-fg" : "text-subtle"}>{formatEUR(c.stats.balance, { round: true })}</span>, sortValue: (c) => c.stats.balance, csv: (c) => csvMoney(c.stats.balance) },
    { id: "projects", header: "Projets", align: "right", cell: (c) => c.stats.projects, sortValue: (c) => c.stats.projects, csv: (c) => c.stats.projects, hideBelow: "md" },
    { id: "contracts", header: "Contrats actifs", align: "right", cell: (c) => c.stats.activeContracts, sortValue: (c) => c.stats.activeContracts, csv: (c) => c.stats.activeContracts, hideBelow: "lg" },
    { id: "last", header: "Dernière interaction", cell: (c) => formatDate(c.stats.lastInteraction), sortValue: (c) => c.stats.lastInteraction ?? "", csv: (c) => c.stats.lastInteraction ?? "", hideBelow: "lg" },
  ];
  return (
    <div>
      <PageHeader
        title="Clients"
        description="Base clients : les montants sont calculés à partir des factures et paiements associés."
        actions={
          <Button variant="primary" onClick={() => openCreate("client")}>
            <Plus /> Nouveau client
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Clients actifs" value={data.clients.filter((c) => c.status === "active").length} />
        <MetricCard label="Clients avec contrat récurrent" value={new Set(data.subscriptions.filter((s) => s.status === "active").map((s) => s.clientId)).size} />
        <MetricCard label="Impayés clients" value={formatEUR([...stats.values()].reduce((s, x) => s + x.balance, 0), { round: true })} />
        <MetricCard label="Satisfaction moyenne" value={(() => { const v = data.clients.filter((c) => c.satisfaction).map((c) => c.satisfaction!); return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).replace(".", ",")} / 5` : "—"; })()} hint="Donnée déclarative de démonstration." />
      </div>
      <DataTable
        caption="Liste des clients"
        rows={rows}
        columns={columns}
        searchText={(c) => `${c.name} ${c.sector} ${c.city} ${c.primary?.lastName ?? ""}`}
        rowHref={(c) => `/clients/${c.id}`}
        exportName="clients"
        initialSort={{ id: "billed", dir: "desc" }}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              { id: "status", label: "Statut", value: f.values.status, onChange: f.set("status"), options: (Object.keys(CLIENT_STATUS) as ClientStatus[]).map((s) => ({ value: s, label: CLIENT_STATUS[s].label })) },
              { id: "sector", label: "Secteur", value: f.values.sector, onChange: f.set("sector"), options: sectors.map((s) => ({ value: s, label: s })) },
            ]}
          />
        }
      />
    </div>
  );
}

export function ClientDetail({ id }: { id: string }) {
  const data = useData();
  const summaries = useSummaries();
  const run = useCommand();
  const router = useRouter();
  const openCreate = useUiStore((s) => s.openCreate);
  const tabParam = useParam("tab");
  const [tab, setTab] = useSyncedState(tabParam ?? "overview");
  const stats = useClientStats().get(id);
  const { confirm, dialog } = useConfirm();
  const [edit, setEdit] = React.useState(false);
  const [contactEdit, setContactEdit] = React.useState<Contact | "new" | null>(null);
  const [doc, setDoc] = React.useState({ name: "", kind: "Contrat" });

  const client = data.clients.find((c) => c.id === id);
  if (!client || !stats) return <ErrorState title="Client introuvable" action={<Button asChild><Link href="/clients">Retour aux clients</Link></Button>} />;
  const contacts = data.contacts.filter((c) => c.clientId === id);
  const opps = data.opportunities.filter((o) => o.clientId === id);
  const quotes = data.quotes.filter((q) => q.clientId === id);
  const invoices = summaries.filter((s) => s.invoice.clientId === id).sort((a, b) => b.invoice.issueDate.localeCompare(a.invoice.issueDate));
  const invoiceIds = new Set(invoices.map((s) => s.invoice.id));
  const payments = data.payments.filter((p) => invoiceIds.has(p.invoiceId)).sort((a, b) => b.date.localeCompare(a.date));
  const projects = data.projects.filter((p) => p.clientId === id);
  const subs = data.subscriptions.filter((s) => s.clientId === id);
  const activities = data.salesActivities.filter((a) => a.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
  const notes = data.notes.filter((n) => n.clientId === id);
  const invNumber = new Map(invoices.map((s) => [s.invoice.id, s.invoice.number]));

  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Clients
      </Link>
      <PageHeader
        title={client.name}
        description={`${client.sector} · ${client.city || "ville non renseignée"} · client depuis le ${formatDate(client.createdAt)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("activity", { clientId: id })}>
              <MessageSquarePlus /> Activité
            </Button>
            <Button variant="secondary" onClick={() => openCreate("invoice", { clientId: id })}>
              <FilePlus2 /> Facture
            </Button>
            <Button variant="secondary" onClick={() => setEdit(true)}>
              <Pencil /> Modifier
            </Button>
            <RowActions
              label="Autres actions"
              actions={[
                { label: "Nouvelle opportunité", icon: <Handshake />, onSelect: () => openCreate("opportunity", { clientId: id }) },
                { label: "Nouveau devis", icon: <FileText />, onSelect: () => openCreate("quote", { clientId: id }) },
                { label: "Nouveau projet", icon: <FolderPlus />, onSelect: () => openCreate("project", { clientId: id }) },
                { label: "Nouvelle note", icon: <NotebookPen />, onSelect: () => openCreate("note", { clientId: id }) },
                {
                  label: "Supprimer le client",
                  icon: <Trash2 />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () =>
                    confirm({
                      title: `Supprimer ${client.name} ?`,
                      description: "La suppression n'est possible que si aucune facture, devis, projet ou contrat n'est rattaché. Sinon, passez le client au statut « Perdu ».",
                      confirmLabel: "Supprimer",
                      action: () => {
                        const r = run(C.deleteClient, { id });
                        if (r.ok) router.push("/clients");
                      },
                    }),
                },
              ]}
            />
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge meta={CLIENT_STATUS[client.status]} />
          {client.satisfaction ? (
            <Badge tone="gold">
              <Star /> {client.satisfaction}/5
            </Badge>
          ) : null}
          {stats.overdue > 0 ? <Badge tone="danger">{formatEUR(stats.overdue)} échus</Badge> : null}
        </div>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {[
            ["overview", "Vue d'ensemble"],
            ["contacts", `Contacts (${contacts.length})`],
            ["opportunities", `Opportunités (${opps.length})`],
            ["quotes", `Devis (${quotes.length})`],
            ["invoices", `Factures (${invoices.length})`],
            ["payments", `Paiements (${payments.length})`],
            ["projects", `Projets (${projects.length})`],
            ["contracts", `Contrats (${subs.length})`],
            ["activities", `Activités (${activities.length})`],
            ["documents", `Documents (${client.documents.length})`],
            ["notes", `Notes (${notes.length})`],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="CA facturé HT" value={formatEUR(stats.billed)} hint="Factures émises, hors annulations." />
            <MetricCard label="Encaissé" value={formatEUR(stats.collected)} />
            <MetricCard label="Solde impayé" value={formatEUR(stats.balance)} tone={stats.overdue ? "danger" : "default"} footer={stats.overdue ? <span className="text-[11px] text-danger">dont {formatEUR(stats.overdue)} échus</span> : null} />
            <MetricCard label="MRR du client" value={formatEUR(stats.mrr)} hint="Contrats récurrents actifs ramenés au mois." />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Relation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted">Contact principal : </span>
                  {contacts.find((c) => c.isPrimary) ? `${contacts.find((c) => c.isPrimary)!.firstName} ${contacts.find((c) => c.isPrimary)!.lastName}` : "—"}
                </p>
                <p>
                  <span className="text-muted">Projets : </span>
                  {projects.filter((p) => p.status !== "done" && p.status !== "cancelled").length} actifs, {projects.filter((p) => p.status === "done").length} terminés
                </p>
                <p>
                  <span className="text-muted">Opportunités ouvertes : </span>
                  {opps.filter(isOpen).length} ({formatEUR(opps.filter(isOpen).reduce((s, o) => s + o.amount, 0), { round: true })})
                </p>
                <p>
                  <span className="text-muted">Dernière interaction : </span>
                  {formatDate(stats.lastInteraction)}
                </p>
                <p>
                  <span className="text-muted">Site : </span>
                  {client.website || "—"}
                </p>
                {client.notes ? <p className="rounded-lg bg-bg-elevated p-3 text-xs text-muted">{client.notes}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dernières activités</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityList activities={activities.slice(0, 6)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => setContactEdit("new")}>
              <UserPlus /> Ajouter un contact
            </Button>
          </div>
          {contacts.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {contacts.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-1 pt-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-fg">
                        {c.firstName} {c.lastName}
                      </p>
                      {c.isPrimary ? <Badge tone="gold">Principal</Badge> : null}
                    </div>
                    <p className="text-xs text-muted">{c.jobTitle}</p>
                    <p className="text-xs">{c.email}</p>
                    <p className="text-xs tabular text-muted">{c.phone}</p>
                    <div className="flex gap-1 pt-2">
                      <Button size="sm" variant="ghost" onClick={() => setContactEdit(c)}>
                        <Pencil /> Modifier
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm({ title: "Supprimer ce contact ?", description: `${c.firstName} ${c.lastName}`, confirmLabel: "Supprimer", action: () => run(C.deleteContact, { id: c.id }) })}>
                        <Trash2 />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="Aucun contact" action={<Button onClick={() => setContactEdit("new")}>Ajouter un contact</Button>} />
          )}
        </TabsContent>

        <TabsContent value="opportunities">
          <SimpleList empty="Aucune opportunité" items={opps.map((o) => ({ id: o.id, href: `/crm?focus=${o.id}`, title: o.name, meta: `${STAGE_LABELS[o.stage]} · ${o.probability} %`, value: formatEUR(o.amount, { round: true }) }))} />
        </TabsContent>
        <TabsContent value="quotes">
          <SimpleList empty="Aucun devis" items={quotes.map((q) => ({ id: q.id, href: `/crm/devis/${q.id}`, title: q.number, meta: formatDate(q.issueDate), badge: QUOTE_STATUS[q.status], value: formatEUR(documentTotals(q.items).totalHT) }))} />
        </TabsContent>
        <TabsContent value="invoices">
          <SimpleList empty="Aucune facture" items={invoices.map((s: InvoiceSummary) => ({ id: s.invoice.id, href: `/finances/factures/${s.invoice.id}`, title: s.invoice.number, meta: `${formatDate(s.invoice.issueDate)} · échéance ${formatDate(s.invoice.dueDate)} · solde ${formatEUR(s.balance)}`, badge: INVOICE_STATUS[s.status], value: formatEUR(s.totalTTC) }))} />
        </TabsContent>
        <TabsContent value="payments">
          <SimpleList empty="Aucun paiement" items={payments.map((p) => ({ id: p.id, href: `/finances/factures/${p.invoiceId}`, title: `${formatEUR(p.amount)} · ${PAYMENT_METHOD[p.method]}`, meta: `${formatDate(p.date)} · ${invNumber.get(p.invoiceId)}`, value: "" }))} />
        </TabsContent>
        <TabsContent value="projects">
          <SimpleList empty="Aucun projet" items={projects.map((p) => ({ id: p.id, href: `/projets/${p.id}`, title: `${p.code} · ${p.name}`, meta: `Échéance ${formatDate(p.dueDate)} · progression ${projectProgress(p, data.tasks)} %`, badge: PROJECT_STATUS[p.status], value: formatEUR(p.salePrice, { round: true }) }))} />
        </TabsContent>
        <TabsContent value="contracts">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => openCreate("subscription", { clientId: id })}>
              <Plus /> Nouveau contrat
            </Button>
          </div>
          <SimpleList empty="Aucun contrat récurrent" items={subs.map((s) => ({ id: s.id, href: `/finances/abonnements?focus=${s.id}`, title: s.offer, meta: `${PERIODICITY_LABELS[s.periodicity]} · depuis le ${formatDate(s.startDate)}${s.endDate ? ` · fin ${formatDate(s.endDate)}` : ""}`, badge: SUBSCRIPTION_STATUS[s.status], value: `${formatEUR(monthlyValue(s))} / mois` }))} />
        </TabsContent>
        <TabsContent value="activities">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => openCreate("activity", { clientId: id })}>
              <MessageSquarePlus /> Consigner une activité
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              <ActivityList activities={activities} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="documents">
          <Card>
            <CardContent className="space-y-4 pt-4">
              <p className="text-xs text-muted">Le mode démonstration conserve uniquement des références de documents (nom et type). Aucun fichier n&apos;est téléversé ni stocké.</p>
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = run(C.addClientDocument, { clientId: id, ...doc });
                  if (r.ok) setDoc({ name: "", kind: doc.kind });
                }}
              >
                <div className="flex-1">
                  <Label htmlFor="doc-name">Nom du document</Label>
                  <Input id="doc-name" className="mt-1" value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} placeholder="Contrat-cadre 2026.pdf" />
                </div>
                <div>
                  <Label htmlFor="doc-kind">Type</Label>
                  <NativeSelect id="doc-kind" className="mt-1" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })}>
                    {["Contrat", "Cahier des charges", "Bon de commande", "Procès-verbal", "Autre"].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </NativeSelect>
                </div>
                <Button type="submit" variant="secondary">
                  <Paperclip /> Référencer
                </Button>
              </form>
              <ul className="divide-y divide-border/60">
                {client.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                    <FileText className="size-4 text-subtle" />
                    <span className="flex-1 text-fg">{d.name}</span>
                    <Badge>{d.kind}</Badge>
                    <span className="text-xs text-muted">{formatDate(d.addedAt)}</span>
                  </li>
                ))}
                {!client.documents.length ? <li className="py-4 text-center text-sm text-muted">Aucun document référencé.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notes">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => openCreate("note", { clientId: id })}>
              <NotebookPen /> Nouvelle note
            </Button>
          </div>
          <NotesGrid notes={notes} />
        </TabsContent>
      </Tabs>
      <FormDialog open={edit} onOpenChange={setEdit} title={`Modifier ${client.name}`}>
        <ClientForm entity={client} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </FormDialog>
      <FormDialog open={!!contactEdit} onOpenChange={(o) => !o && setContactEdit(null)} title={contactEdit === "new" ? "Nouveau contact" : "Modifier le contact"}>
        {contactEdit ? <ContactForm entity={contactEdit === "new" ? undefined : contactEdit} defaults={{ clientId: id }} onDone={() => setContactEdit(null)} onCancel={() => setContactEdit(null)} /> : null}
      </FormDialog>
      {dialog}
      
    </div>
  );
}

export function NotesGrid({ notes }: { notes: { id: string; title: string; body: string; updatedAt: string }[] }) {
  const run = useCommand();
  const data = useData();
  const [edit, setEdit] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const note = data.notes.find((n) => n.id === edit);
  if (!notes.length) return <EmptyState title="Aucune note" />;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {notes.map((n) => (
          <Card key={n.id}>
            <CardContent className="space-y-2 pt-4">
              <p className="font-medium text-fg">{n.title}</p>
              <p className="whitespace-pre-line text-sm text-muted">{n.body}</p>
              <div className="flex items-center justify-between pt-1 text-[11px] text-subtle">
                <span>Modifiée le {formatDateTime(n.updatedAt)}</span>
                <span className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Modifier la note" onClick={() => setEdit(n.id)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Supprimer la note" onClick={() => confirm({ title: "Supprimer cette note ?", description: n.title, confirmLabel: "Supprimer", action: () => run(C.deleteNote, { id: n.id }) })}>
                    <Trash2 />
                  </Button>
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <FormDialog open={!!note} onOpenChange={(o) => !o && setEdit(null)} title="Modifier la note">
        {note ? <NoteForm entity={note} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} /> : null}
      </FormDialog>
      {dialog}
    </>
  );
}

export function ActivityList({ activities }: { activities: { id: string; type: keyof typeof ACTIVITY_TYPE; date: string; subject: string; done: boolean; notes: string }[] }) {
  if (!activities.length) return <p className="text-sm text-muted">Aucune activité consignée.</p>;
  return (
    <ul className="space-y-2">
      {activities.map((a) => (
        <li key={a.id} className="flex items-start gap-2 text-sm">
          <Badge tone={a.done ? "neutral" : "info"} className="mt-0.5">
            {ACTIVITY_TYPE[a.type]}
          </Badge>
          <div className="min-w-0">
            <p className="truncate text-fg">{a.subject}</p>
            <p className="text-[11px] text-subtle">
              {formatDateTime(a.date)}
              {a.done ? "" : " · planifiée"}
              {a.notes ? ` · ${a.notes}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SimpleList({ items, empty }: { items: { id: string; href: string; title: string; meta: string; value: string; badge?: { label: string; tone: Parameters<typeof Badge>[0]["tone"] } }[]; empty: string }) {
  if (!items.length) return <EmptyState title={empty} />;
  return (
    <Card>
      <ul className="divide-y divide-border/60">
        {items.map((i) => (
          <li key={i.id}>
            <Link href={i.href} className="flex items-center gap-3 px-4 py-3 hover:bg-interactive/40">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{i.title}</p>
                <p className="truncate text-[11px] text-muted">{i.meta}</p>
              </div>
              {i.badge ? <Badge tone={i.badge.tone}>{i.badge.label}</Badge> : null}
              <span className="shrink-0 text-sm tabular text-fg">{i.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

