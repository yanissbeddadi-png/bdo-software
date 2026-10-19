"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Columns3, List, Plus, Search, UserPlus, X } from "lucide-react";
import type { OpportunityStage, Priority } from "@/lib/domain/types";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { STAGES, STAGE_LABELS, isOpen } from "@/lib/calculations/pipeline";
import { addDays } from "@/lib/calculations/dates";
import { FOLLOW_UP, type DealView, type FollowUpState } from "@/lib/crm/views";
import { SOURCES } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { KanbanBoard } from "@/components/shared/kanban";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Avatar, DueLabel, FollowUpBadge, PriorityBadge, StageBadge } from "@/components/crm/crm-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { formatDate, formatDueIn, formatEUR } from "@/lib/formatters";
import { PRIORITY, options } from "@/lib/formatters/labels";
import { OpportunityDialog } from "./opportunity-dialog";
import { cn } from "@/lib/utils";

/** Vues enregistrées du pipeline (filtres prédéfinis, cumulables avec les filtres). */
export const PIPELINE_VIEWS = {
  all: { label: "Tous", test: () => true },
  mine: { label: "Mes prospects", test: (d: DealView, me: string | null) => !!me && d.opportunity.ownerId === me },
  priority: { label: "Prioritaires", test: (d: DealView) => isOpen(d.opportunity) && (d.opportunity.priority === "high" || d.opportunity.priority === "critical") },
  today: { label: "À relancer aujourd'hui", test: (d: DealView) => d.followUp === "due" },
  overdue: { label: "En retard", test: (d: DealView) => d.overdue },
  no_next: { label: "Sans prochaine action", test: (d: DealView) => isOpen(d.opportunity) && !d.nextMission },
  proposals: { label: "Propositions en attente", test: (d: DealView) => isOpen(d.opportunity) && d.opportunity.stage === "proposal" },
  won: { label: "Clients gagnés", test: (d: DealView) => d.opportunity.stage === "won" },
  lost: { label: "Perdues", test: (d: DealView) => d.opportunity.stage === "lost" || !!d.opportunity.archivedAt },
} as const;
export type PipelineView = keyof typeof PIPELINE_VIEWS;

const EMPTY_FILTERS = {
  q: "",
  stage: "all",
  owner: "all",
  source: "all",
  priority: "all",
  followUp: "all",
  created: "all",
  lastContact: "all",
  due: "all",
  overdueOnly: false,
  noNext: false,
  noRecent: false,
};
type Filters = typeof EMPTY_FILTERS;

export function PipelinePage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const crm = useCrm();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const viewParam = useParam("view");
  const stageParam = useParam("stage");
  const [selected, setSelected] = useSyncedState<string | null>(focus);
  const [view, setView] = useSyncedState<PipelineView>(viewParam && viewParam in PIPELINE_VIEWS ? (viewParam as PipelineView) : "all");
  const [layout, setLayout] = React.useState<"kanban" | "list">("kanban");
  const [filters, setFilters] = React.useState<Filters>({ ...EMPTY_FILTERS, stage: stageParam ?? "all" });
  // Un lien « ?stage=… » (vue d'ensemble) resynchronise le filtre d'étape.
  const [syncedStage, setSyncedStage] = React.useState(stageParam);
  if (stageParam !== syncedStage) {
    setSyncedStage(stageParam);
    setFilters((f) => ({ ...f, stage: stageParam ?? "all" }));
  }
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const me = data.settings.user.employeeId ?? null;
  const inactivity = data.settings.crm.inactivityDays;

  const deals = React.useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return crm.deals.filter((d) => {
      const o = d.opportunity;
      if (!PIPELINE_VIEWS[view].test(d, me)) return false;
      if (q) {
        const hay = [o.name, d.company?.name, d.contact?.firstName, d.contact?.lastName, d.contact?.email, o.source].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.stage !== "all" && o.stage !== filters.stage) return false;
      if (filters.owner !== "all" && (filters.owner === "none" ? !!o.ownerId : o.ownerId !== filters.owner)) return false;
      if (filters.source !== "all" && o.source !== filters.source) return false;
      if (filters.priority !== "all" && o.priority !== filters.priority) return false;
      if (filters.followUp !== "all" && d.followUp !== filters.followUp) return false;
      if (filters.created !== "all" && o.createdAt.slice(0, 10) < addDays(today, -Number(filters.created))) return false;
      if (filters.lastContact === "7" && d.daysSinceInteraction > 7) return false;
      if (filters.lastContact === "30" && (d.daysSinceInteraction <= 7 || d.daysSinceInteraction > 30)) return false;
      if (filters.lastContact === "old" && d.daysSinceInteraction <= 30) return false;
      const due = d.nextMission?.dueDate ?? null;
      if (filters.due === "today" && due !== today) return false;
      if (filters.due === "week" && (!due || due < today || due > addDays(today, 7))) return false;
      if (filters.due === "none" && due) return false;
      if (filters.overdueOnly && !d.overdue) return false;
      if (filters.noNext && (d.nextMission || !isOpen(o))) return false;
      if (filters.noRecent && (!isOpen(o) || d.daysSinceInteraction <= inactivity)) return false;
      return true;
    });
  }, [crm.deals, filters, view, me, today, inactivity]);

  const activeFilters = Object.entries(filters).filter(([k, v]) => v !== EMPTY_FILTERS[k as keyof Filters]).length;
  const columns = STAGES.filter((s) => filters.stage === "all" || s.id === filters.stage).map((s) => ({ id: s.id, label: s.label }));
  const open = crm.deals.filter((d) => isOpen(d.opportunity));

  const move = (d: DealView, to: OpportunityStage) => {
    if (to === "lost") openCreate("stage", { opportunityId: d.opportunity.id, stage: "lost" });
    else run(C.moveOpportunity, { id: d.opportunity.id, stage: to });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline CRM"
        description="Cycle de vente en 7 étapes. Glissez une carte d'une colonne à l'autre ou utilisez le sélecteur d'étape de chaque carte. « En attente » et « À relancer » sont des états de suivi (filtre Suivi), pas des étapes."
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("prospect")}>
              <UserPlus /> Nouveau prospect
            </Button>
            <Button variant="primary" onClick={() => openCreate("opportunity")}>
              <Plus /> Nouvelle opportunité
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Opportunités actives" value={String(open.length)} />
        <Stat
          label="Valeur du pipeline"
          value={formatEUR(
            open.reduce((s, d) => s + d.opportunity.amount, 0),
            { round: true },
          )}
          hint="Somme des montants des opportunités actives."
        />
        <Stat label="En retard" value={String(open.filter((d) => d.overdue).length)} tone={open.some((d) => d.overdue) ? "danger" : undefined} />
        <Stat label="Sans prochaine action" value={String(open.filter((d) => !d.nextMission).length)} />
      </div>

      <div role="tablist" aria-label="Vues enregistrées" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(Object.keys(PIPELINE_VIEWS) as PipelineView[]).map((v) => {
          const count = crm.deals.filter((d) => PIPELINE_VIEWS[v].test(d, me)).length;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                view === v ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:text-fg",
              )}
            >
              {PIPELINE_VIEWS[v].label}
              <span className="tabular text-subtle">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={filters.q} onChange={(e) => set("q", e.target.value)} placeholder="Nom, entreprise, e-mail…" aria-label="Rechercher dans le pipeline" className="h-8 pl-8 text-xs" />
          </div>
          <Select label="Étape" value={filters.stage} onChange={(v) => set("stage", v)} options={STAGES.map((s) => ({ value: s.id, label: s.label }))} />
          <Select
            label="Responsable"
            value={filters.owner}
            onChange={(v) => set("owner", v)}
            options={[
              ...data.employees.filter((e) => e.department === "sales" || e.department === "direction").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
              { value: "none", label: "Non attribué" },
            ]}
          />
          <Select label="Source" value={filters.source} onChange={(v) => set("source", v)} options={SOURCES.map((s) => ({ value: s, label: s }))} />
          <Select label="Priorité" value={filters.priority} onChange={(v) => set("priority", v as Priority | "all")} options={options(PRIORITY)} />
          <Select
            label="Suivi"
            value={filters.followUp}
            onChange={(v) => set("followUp", v)}
            options={(Object.keys(FOLLOW_UP) as FollowUpState[]).map((k) => ({ value: k, label: FOLLOW_UP[k].label }))}
          />
          <Select
            label="Création"
            value={filters.created}
            onChange={(v) => set("created", v)}
            options={[
              { value: "7", label: "7 derniers jours" },
              { value: "30", label: "30 derniers jours" },
              { value: "90", label: "90 derniers jours" },
            ]}
          />
          <Select
            label="Dernière interaction"
            value={filters.lastContact}
            onChange={(v) => set("lastContact", v)}
            options={[
              { value: "7", label: "Moins de 7 jours" },
              { value: "30", label: "8 à 30 jours" },
              { value: "old", label: "Plus de 30 jours" },
            ]}
          />
          <Select
            label="Prochaine échéance"
            value={filters.due}
            onChange={(v) => set("due", v)}
            options={[
              { value: "today", label: "Aujourd'hui" },
              { value: "week", label: "7 prochains jours" },
              { value: "none", label: "Aucune" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Toggle label="Missions en retard" checked={filters.overdueOnly} onChange={(v) => set("overdueOnly", v)} />
          <Toggle label="Sans prochaine action" checked={filters.noNext} onChange={(v) => set("noNext", v)} />
          <Toggle label={`Sans interaction depuis ${inactivity} j`} checked={filters.noRecent} onChange={(v) => set("noRecent", v)} />
          {activeFilters ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X /> Réinitialiser ({activeFilters})
            </Button>
          ) : null}
          <span className="ml-auto text-muted" aria-live="polite">
            {deals.length} opportunité{deals.length > 1 ? "s" : ""}
          </span>
          <Segmented
            label="Affichage"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "kanban", label: "Kanban", icon: <Columns3 /> },
              { value: "list", label: "Liste", icon: <List /> },
            ]}
          />
        </div>
      </div>

      {layout === "kanban" ? (
        <KanbanBoard<DealView & { id: string }, OpportunityStage>
          columns={columns}
          items={deals.map((d) => ({ ...d, id: d.opportunity.id }))}
          getColumn={(d) => (d.opportunity.archivedAt ? "lost" : d.opportunity.stage)}
          onMove={move}
          itemLabel={(d) => d.opportunity.name}
          emptyLabel="Déposez une opportunité ici"
          cardClassName={(d) => cn(focus === d.opportunity.id && "border-accent", d.overdue && "border-l-2 border-l-danger")}
          renderHeader={(col, list) => {
            const stage = STAGES.find((s) => s.id === col.id)!;
            return (
              <header className="border-b border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: stage.color }} />
                    {col.label}
                  </h3>
                  <span className="text-xs tabular text-muted">{list.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] tabular text-muted">
                  {formatEUR(
                    list.reduce((s, d) => s + d.opportunity.amount, 0),
                    { round: true },
                  )}
                </p>
              </header>
            );
          }}
          renderCard={(d) => <DealCard deal={d} today={today} onOpen={() => setSelected(d.opportunity.id)} />}
        />
      ) : (
        <DealTable deals={deals} today={today} onOpen={setSelected} />
      )}
      {selected ? <OpportunityDialog id={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function DealCard({ deal, today, onOpen }: { deal: DealView; today: string; onOpen: () => void }) {
  const o = deal.opportunity;
  const contactName = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : null;
  const next = deal.nextMission;
  return (
    <div className="space-y-2 text-xs" data-opportunity={o.id}>
      <div className="flex items-start gap-2">
        <Avatar name={contactName ?? deal.company?.name ?? o.name} size="sm" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left">
          <p className="truncate text-sm font-medium text-fg">{contactName ?? deal.company?.name ?? o.name}</p>
          <p className="truncate text-muted">
            {deal.company?.name ?? "—"}
            {deal.contact?.jobTitle ? ` · ${deal.contact.jobTitle}` : ""}
          </p>
        </button>
        {deal.overdue ? (
          <span title="Mission en retard" className="text-danger">
            <AlertTriangle className="size-4" aria-label="Mission en retard" />
          </span>
        ) : null}
      </div>
      <p className="line-clamp-1 text-muted">{o.name}</p>
      <div className="flex items-center justify-between">
        <span className="font-semibold tabular text-fg">{formatEUR(o.amount, { round: true })}</span>
        <div className="flex items-center gap-1">
          <PriorityBadge priority={o.priority} />
          {o.source ? <Badge>{o.source}</Badge> : null}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-subtle">Dernier contact</dt>
        <dd className="truncate text-muted">{formatDueIn(deal.lastInteractionAt, today)}</dd>
        <dt className="text-subtle">Prochaine action</dt>
        <dd className="min-w-0">
          {next ? (
            <span className="flex flex-col">
              <span className="truncate text-fg">{next.title}</span>
              <DueLabel date={next.dueDate} time={next.dueTime} today={today} />
            </span>
          ) : isOpen(o) ? (
            <span className="text-warning">Aucune</span>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </dd>
      </dl>
      <div className="flex items-center justify-between gap-2">
        {isOpen(o) ? <FollowUpBadge state={deal.followUp} /> : <span className="text-[11px] text-subtle">Clôturée le {formatDate(o.closedAt ?? o.archivedAt)}</span>}
        {deal.openMissions.length ? <span className="text-[11px] text-muted">{deal.openMissions.length} mission(s)</span> : null}
      </div>
    </div>
  );
}

function DealTable({ deals, today, onOpen }: { deals: DealView[]; today: string; onOpen: (id: string) => void }) {
  const columns: Column<DealView & { id: string }>[] = [
    {
      id: "contact",
      header: "Contact",
      cell: (d) => (
        <div className="flex items-center gap-2">
          <Avatar name={d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : (d.company?.name ?? "?")} size="sm" />
          <div className="min-w-0">
            {d.contact ? (
              <Link href={`/contacts/${d.contact.id}`} className="block truncate font-medium hover:underline">
                {d.contact.firstName} {d.contact.lastName}
              </Link>
            ) : (
              <span className="text-muted">—</span>
            )}
            <p className="truncate text-xs text-muted">{d.company?.name ?? ""}</p>
          </div>
        </div>
      ),
      sortValue: (d) => (d.contact ? `${d.contact.lastName} ${d.contact.firstName}` : ""),
      csv: (d) => (d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : ""),
    },
    { id: "name", header: "Opportunité", cell: (d) => d.opportunity.name, sortValue: (d) => d.opportunity.name, csv: (d) => d.opportunity.name },
    // Colonne exportée uniquement (l'entreprise est déjà affichée sous le contact).
    { id: "company", header: "Entreprise", cell: () => null, csv: (d) => d.company?.name ?? "", className: "hidden" },
    {
      id: "stage",
      header: "Étape",
      cell: (d) => <StageBadge stage={d.opportunity.stage} />,
      sortValue: (d) => STAGES.findIndex((s) => s.id === d.opportunity.stage),
      csv: (d) => STAGE_LABELS[d.opportunity.stage],
    },
    { id: "amount", header: "Valeur", align: "right", cell: (d) => formatEUR(d.opportunity.amount, { round: true }), sortValue: (d) => d.opportunity.amount, csv: (d) => d.opportunity.amount / 100 },
    { id: "source", header: "Source", cell: (d) => d.opportunity.source || "—", sortValue: (d) => d.opportunity.source, csv: (d) => d.opportunity.source, hideBelow: "lg" },
    {
      id: "last",
      header: "Dernier contact",
      cell: (d) => <span className="text-xs text-muted">{formatDueIn(d.lastInteractionAt, today)}</span>,
      sortValue: (d) => d.lastInteractionAt,
      csv: (d) => d.lastInteractionAt.slice(0, 10),
      hideBelow: "md",
    },
    {
      id: "next",
      header: "Prochaine action",
      cell: (d) =>
        d.nextMission ? (
          <div className="min-w-0">
            <p className="truncate text-xs">{d.nextMission.title}</p>
            <DueLabel date={d.nextMission.dueDate} time={d.nextMission.dueTime} today={today} />
          </div>
        ) : (
          <span className="text-xs text-subtle">—</span>
        ),
      sortValue: (d) => d.nextMission?.dueDate ?? null,
      csv: (d) => (d.nextMission ? `${d.nextMission.title} (${d.nextMission.dueDate ?? ""})` : ""),
    },
    {
      id: "priority",
      header: "Priorité",
      cell: (d) => <PriorityBadge priority={d.opportunity.priority} hideNormal={false} />,
      sortValue: (d) => ["critical", "high", "normal", "low"].indexOf(d.opportunity.priority),
      csv: (d) => PRIORITY[d.opportunity.priority].label,
      hideBelow: "lg",
    },
    { id: "follow", header: "Suivi", cell: (d) => (isOpen(d.opportunity) ? <FollowUpBadge state={d.followUp} /> : null), sortValue: (d) => d.followUp, csv: (d) => FOLLOW_UP[d.followUp].label },
  ];
  return (
    <DataTable
      caption="Opportunités du pipeline"
      rows={deals.map((d) => ({ ...d, id: d.opportunity.id }))}
      columns={columns}
      onRowClick={(d) => onOpen(d.opportunity.id)}
      exportName="pipeline"
      initialSort={{ id: "next", dir: "asc" }}
      emptyTitle="Aucune opportunité"
      pageSize={20}
    />
  );
}

function Select({ label, value, onChange, options: opts }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={cn("h-8 w-auto min-w-32 text-xs", value !== "all" && "border-accent")}>
      <option value="all">{label} : tous</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted hover:text-fg">
      <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5" title={hint}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn("text-lg font-semibold tabular", tone === "danger" ? "text-danger" : "text-fg")}>{value}</p>
    </div>
  );
}
