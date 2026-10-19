"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink, ListPlus, MessageSquarePlus, NotebookPen, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import type { RelationType } from "@/lib/domain/types";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { STAGE_LABELS, isOpen } from "@/lib/calculations/pipeline";
import { FOLLOW_UP, type CompanyView, type FollowUpState } from "@/lib/crm/views";
import { RELATION } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar } from "@/components/tables/filter-bar";
import { Avatar, DueLabel, FollowUpBadge, MissionLine, RelationBadge, StageBadge } from "@/components/crm/crm-ui";
import { Timeline } from "@/components/crm/timeline";
import { NotesGrid } from "@/components/crm/notes-grid";
import { ErrorState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/forms/quick-create";
import { ClientForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLIENT_STATUS, QUOTE_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDueIn, formatEUR } from "@/lib/formatters";
import { OpportunityDialog } from "./opportunity-dialog";
import { cn } from "@/lib/utils";

type Row = CompanyView & { id: string };

const TABS: { value: RelationType | "all"; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "prospect", label: "Prospects" },
  { value: "customer", label: "Clients actifs" },
  { value: "former", label: "Anciens clients" },
  { value: "partner", label: "Partenaires" },
  { value: "archived", label: "Archivées" },
];

export function CompaniesPage() {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const openCreate = useUiStore((s) => s.openCreate);
  const [relation, setRelation] = useSyncedState<string>(useParam("relation") ?? "all");
  const [followUp, setFollowUp] = React.useState("all");
  const [owner, setOwner] = React.useState("all");
  const [sector, setSector] = React.useState("all");
  const match = (c: CompanyView, r: string) => (r === "all" ? c.company.relation !== "archived" : c.company.relation === r);
  const rows: Row[] = crm.companies
    .filter((c) => match(c, relation))
    .filter((c) => followUp === "all" || c.followUp === followUp)
    .filter((c) => owner === "all" || c.company.ownerId === owner)
    .filter((c) => sector === "all" || c.company.sector === sector)
    .map((c) => ({ ...c, id: c.company.id }));
  const sectors = [...new Set(data.clients.map((c) => c.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Entreprise",
      cell: (c) => (
        <div className="flex min-w-40 items-center gap-2">
          <Avatar name={c.company.name} size="sm" />
          <div className="min-w-0">
            <Link href={`/entreprises/${c.id}`} className="block truncate font-medium hover:underline">
              {c.company.name}
            </Link>
            <p className="truncate text-xs text-muted">{[c.company.sector, c.company.city].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
      ),
      sortValue: (c) => c.company.name,
      csv: (c) => c.company.name,
    },
    { id: "relation", header: "Relation", cell: (c) => <RelationBadge relation={c.company.relation} />, sortValue: (c) => c.company.relation, csv: (c) => RELATION[c.company.relation].label },
    { id: "sector", header: "Secteur", cell: () => null, csv: (c) => c.company.sector, className: "hidden" },
    { id: "size", header: "Taille", cell: (c) => <span className="text-xs">{c.company.size || "—"}</span>, sortValue: (c) => c.company.size || null, csv: (c) => c.company.size, hideBelow: "lg" },
    {
      id: "owner",
      header: "Responsable",
      cell: (c) => <span className="text-xs">{c.owner ? `${c.owner.firstName} ${c.owner.lastName[0]}.` : "—"}</span>,
      csv: (c) => (c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : ""),
      hideBelow: "lg",
    },
    { id: "contacts", header: "Contacts", align: "right", cell: (c) => c.contacts.length, sortValue: (c) => c.contacts.length, csv: (c) => c.contacts.length, hideBelow: "md" },
    {
      id: "pipeline",
      header: "Pipeline ouvert",
      align: "right",
      cell: (c) => (c.openOpportunities.length ? `${formatEUR(c.pipelineValue, { round: true })} (${c.openOpportunities.length})` : "—"),
      sortValue: (c) => c.pipelineValue,
      csv: (c) => c.pipelineValue / 100,
    },
    {
      id: "last",
      header: "Dernière interaction",
      cell: (c) => <span className="text-xs text-muted">{c.lastInteraction ? formatDueIn(c.lastInteraction.date, today) : "Aucune"}</span>,
      sortValue: (c) => c.lastInteraction?.date ?? null,
      csv: (c) => c.lastInteraction?.date.slice(0, 10) ?? "",
      hideBelow: "md",
    },
    {
      id: "next",
      header: "Prochaine action",
      cell: (c) =>
        c.nextMission ? (
          <div className="min-w-0">
            <p className="line-clamp-1 max-w-48 text-xs">{c.nextMission.title}</p>
            <DueLabel date={c.nextMission.dueDate} time={c.nextMission.dueTime} today={today} />
          </div>
        ) : (
          <span className="text-xs text-subtle">—</span>
        ),
      sortValue: (c) => c.nextMission?.dueDate ?? null,
      csv: (c) => (c.nextMission ? `${c.nextMission.title} (${c.nextMission.dueDate ?? ""})` : ""),
    },
    {
      id: "follow",
      header: "Suivi",
      cell: (c) => <FollowUpBadge state={c.followUp} />,
      sortValue: (c) => ["overdue", "due", "to_process", "waiting", "no_next_action", "up_to_date"].indexOf(c.followUp),
      csv: (c) => FOLLOW_UP[c.followUp].label,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Entreprises clientes"
        description="Organisations suivies : prospects, clients, anciens clients et partenaires. Chaque fiche regroupe contacts, opportunités, missions et historique."
        actions={
          <Button variant="primary" onClick={() => openCreate("client")}>
            <Building2 /> Nouvelle entreprise
          </Button>
        }
      />
      <div role="tablist" aria-label="Relation" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={relation === t.value}
            onClick={() => setRelation(t.value)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              relation === t.value ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:text-fg",
            )}
          >
            {t.label}
            <span className="tabular text-subtle">{crm.companies.filter((c) => match(c, t.value)).length}</span>
          </button>
        ))}
      </div>
      <DataTable
        caption="Entreprises"
        rows={rows}
        columns={columns}
        searchText={(c) => [c.company.name, c.company.sector, c.company.city, c.company.country].join(" ")}
        searchPlaceholder="Rechercher une entreprise…"
        rowHref={(c) => `/entreprises/${c.id}`}
        exportName="entreprises"
        initialSort={{ id: "name", dir: "asc" }}
        pageSize={20}
        emptyTitle="Aucune entreprise"
        toolbar={
          <FilterBar
            filters={[
              { id: "follow", label: "Suivi", value: followUp, onChange: setFollowUp, options: (Object.keys(FOLLOW_UP) as FollowUpState[]).map((k) => ({ value: k, label: FOLLOW_UP[k].label })) },
              { id: "sector", label: "Secteur", value: sector, onChange: setSector, options: sectors.map((s) => ({ value: s, label: s })) },
              {
                id: "owner",
                label: "Responsable",
                value: owner,
                onChange: setOwner,
                options: data.employees.filter((e) => e.department === "sales" || e.department === "direction").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
              },
            ]}
            onReset={() => {
              setFollowUp("all");
              setSector("all");
              setOwner("all");
            }}
          />
        }
      />
    </div>
  );
}

export function CompanyDetail({ id }: { id: string }) {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const run = useCommand();
  const router = useRouter();
  const openCreate = useUiStore((s) => s.openCreate);
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useSyncedState(useParam("tab") ?? "apercu");
  const [editing, setEditing] = React.useState(false);
  const [deal, setDeal] = React.useState<string | null>(null);
  const view = crm.companyById.get(id);
  if (!view) return <ErrorState title="Entreprise introuvable" description="Elle a peut-être été supprimée." action={<Link href="/entreprises">Retour aux entreprises</Link>} />;
  const co = view.company;
  const refs = { clientId: id, contactId: view.contacts.find((c) => c.isPrimary)?.id ?? null, opportunityId: null };
  const activities = data.salesActivities.filter((a) => a.clientId === id);
  const notes = data.notes.filter((n) => n.clientId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const quotes = data.quotes.filter((q) => q.clientId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const invoices = data.invoices.filter((i) => i.clientId === id && i.baseStatus !== "draft");
  const done = view.missions.filter((t) => t.status === "done" || t.status === "cancelled").sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const won = view.opportunities.filter((o) => o.stage === "won");
  const contactNames = new Map(data.contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

  return (
    <div className="space-y-6">
      <Link href="/entreprises" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Entreprises
      </Link>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={co.name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{co.name}</h1>
            <p className="text-sm text-muted">{[co.sector, co.size ? `${co.size} salariés` : null, [co.city, co.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RelationBadge relation={co.relation} />
              <StatusBadge meta={CLIENT_STATUS[co.status]} />
              <FollowUpBadge state={view.followUp} />
              {co.source ? <Badge>{co.source}</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
              {co.website ? (
                <a href={co.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
                  <ExternalLink className="size-3.5" /> {co.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
              <span>Responsable : {view.owner ? `${view.owner.firstName} ${view.owner.lastName}` : "non attribué"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> Modifier
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("prospect", { clientId: id, relation: co.relation === "customer" ? "customer" : "prospect", stage: "" })}>
            <UserPlus /> Contact
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("opportunity", refs)}>
            <Plus /> Opportunité
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("action", { ...refs, type: "followup" })}>
            <ListPlus /> Mission
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("interaction", refs)}>
            <MessageSquarePlus /> Interaction
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("note", refs)}>
            <NotebookPen /> Note
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Contacts" value={String(view.contacts.length)} />
        <Kpi label="Pipeline ouvert" value={formatEUR(view.pipelineValue, { round: true })} />
        <Kpi
          label="Affaires gagnées"
          value={`${won.length} · ${formatEUR(
            won.reduce((s, o) => s + o.amount, 0),
            { round: true },
          )}`}
        />
        <Kpi label="Missions ouvertes" value={String(view.openMissions.length)} danger={view.openMissions.some((t) => t.dueDate && t.dueDate < today)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="apercu">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({view.contacts.length})</TabsTrigger>
          <TabsTrigger value="opportunites">Opportunités ({view.opportunities.length})</TabsTrigger>
          <TabsTrigger value="missions">Missions ({view.openMissions.length})</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="propositions">Propositions ({quotes.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="apercu">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Prochaines actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {view.openMissions.slice(0, 5).map((t) => (
                  <MissionLine key={t.id} task={t} today={today} contactName={t.contactId ? contactNames.get(t.contactId) : null} />
                ))}
                {!view.openMissions.length ? <p className="text-sm text-muted">Aucune action planifiée.</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Activité récente</CardTitle>
              </CardHeader>
              <CardContent>
                <Timeline activities={activities} limit={5} />
              </CardContent>
            </Card>
            {co.notes ? (
              <Card className="lg:col-span-2">
                <CardContent className="pt-4">
                  <p className="whitespace-pre-line text-sm text-muted">{co.notes}</p>
                </CardContent>
              </Card>
            ) : null}
            {invoices.length ? (
              <Card className="lg:col-span-2">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
                  <span className="text-muted">{invoices.length} facture(s) émise(s) dans le module Finances (module historique).</span>
                  <Link href="/finances/factures" className="text-accent hover:underline">
                    Voir la facturation
                  </Link>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="contacts">
          <div className="mb-3">
            <Button size="sm" variant="primary" onClick={() => openCreate("prospect", { clientId: id, stage: "" })}>
              <UserPlus /> Ajouter un contact
            </Button>
          </div>
          {view.contacts.length ? (
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {view.contacts.map((c) => {
                const cv = crm.contactById.get(c.id)!;
                return (
                  <li key={c.id}>
                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-interactive/40">
                      <Avatar name={cv.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">
                          {cv.name} {c.isPrimary ? <Badge tone="gold">Principal</Badge> : null}
                        </p>
                        <p className="truncate text-[11px] text-muted">{[c.jobTitle, c.email, c.phone].filter(Boolean).join(" · ")}</p>
                      </div>
                      {cv.archived ? <Badge>Archivé</Badge> : <FollowUpBadge state={cv.followUp} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucun contact rattaché.</p>
          )}
        </TabsContent>

        <TabsContent value="opportunites">
          <div className="mb-3">
            <Button size="sm" variant="primary" onClick={() => openCreate("opportunity", refs)}>
              <Plus /> Nouvelle opportunité
            </Button>
          </div>
          {view.opportunities.length ? (
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {[...view.opportunities]
                .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.updatedAt.localeCompare(a.updatedAt))
                .map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => setDeal(o.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-interactive/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{o.name}</p>
                        <p className="text-[11px] text-muted">
                          {STAGE_LABELS[o.stage]}
                          {o.contactId ? ` · ${contactNames.get(o.contactId) ?? ""}` : ""}
                          {o.closedAt ? ` · clôturée le ${formatDate(o.closedAt)}` : ""}
                        </p>
                      </div>
                      <StageBadge stage={o.stage} />
                      <span className="shrink-0 text-sm tabular">{formatEUR(o.amount, { round: true })}</span>
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune opportunité.</p>
          )}
        </TabsContent>

        <TabsContent value="missions">
          <div className="space-y-2">
            {view.openMissions.map((t) => (
              <MissionLine key={t.id} task={t} today={today} contactName={t.contactId ? contactNames.get(t.contactId) : null} />
            ))}
            {!view.openMissions.length ? <p className="text-sm text-muted">Aucune mission ouverte.</p> : null}
          </div>
          {done.length ? (
            <>
              <h3 className="mb-2 mt-6 text-sm font-medium text-muted">Terminées et annulées ({done.length})</h3>
              <div className="space-y-2">
                {done.slice(0, 20).map((t) => (
                  <MissionLine key={t.id} task={t} today={today} contactName={t.contactId ? contactNames.get(t.contactId) : null} />
                ))}
              </div>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="historique">
          <Card>
            <CardContent className="pt-4">
              <Timeline activities={activities} allowDelete />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="propositions">
          {quotes.length ? (
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/crm/devis/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-interactive/40">
                    <span className="min-w-0 flex-1 truncate text-sm">Proposition {q.number}</span>
                    <span className="text-xs text-muted">{formatDate(q.issueDate)}</span>
                    <StatusBadge meta={QUOTE_STATUS[q.status]} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune proposition commerciale.</p>
          )}
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => openCreate("quote", { clientId: id })}>
            <Plus /> Nouvelle proposition
          </Button>
        </TabsContent>

        <TabsContent value="notes">
          <div className="mb-3">
            <Button size="sm" variant="primary" onClick={() => openCreate("note", refs)}>
              <Plus /> Ajouter une note
            </Button>
          </div>
          <NotesGrid notes={notes} />
        </TabsContent>
      </Tabs>

      <Button
        size="sm"
        variant="ghost"
        className="text-danger"
        onClick={() =>
          confirm({
            title: `Supprimer ${co.name} ?`,
            description: "La suppression est refusée si l'entreprise a un historique (factures, opportunités, interactions). Passez plutôt sa relation à « Archivé ».",
            confirmLabel: "Supprimer",
            tone: "danger",
            action: () => {
              const r = run(C.deleteClient, { id });
              if (r.ok) router.push("/entreprises");
            },
          })
        }
      >
        <Trash2 /> Supprimer l&apos;entreprise
      </Button>

      <FormDialog open={editing} onOpenChange={setEditing} title={`Modifier ${co.name}`} wide>
        <ClientForm entity={co} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </FormDialog>
      {deal ? <OpportunityDialog id={deal} onClose={() => setDeal(null)} /> : null}
      {dialog}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn("text-base font-semibold tabular", danger ? "text-danger" : "text-fg")}>{value}</p>
    </div>
  );
}
