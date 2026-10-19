"use client";
import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Download, UserPlus } from "lucide-react";
import type { Priority, RelationType } from "@/lib/domain/types";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { STAGES, STAGE_LABELS } from "@/lib/calculations/pipeline";
import { FOLLOW_UP, type ContactView, type FollowUpState } from "@/lib/crm/views";
import { RELATION, SOURCES } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar } from "@/components/tables/filter-bar";
import { Avatar, DueLabel, FollowUpBadge, PriorityBadge, RelationBadge, StageBadge } from "@/components/crm/crm-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { downloadCSV } from "@/lib/export/csv";
import { formatDate, formatDueIn } from "@/lib/formatters";
import { PRIORITY, options } from "@/lib/formatters/labels";
import { cn } from "@/lib/utils";

const RELATION_TABS: { value: RelationType | "all"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "prospect", label: "Prospects" },
  { value: "customer", label: "Clients actifs" },
  { value: "former", label: "Anciens clients" },
  { value: "partner", label: "Partenaires" },
  { value: "archived", label: "Archivés" },
];

type Row = ContactView & { id: string };

const CSV_HEADERS = [
  "Prénom",
  "Nom",
  "Entreprise",
  "Fonction",
  "E-mail",
  "Téléphone",
  "Relation",
  "Étape",
  "Responsable",
  "Source",
  "Priorité",
  "Dernière interaction",
  "Prochaine action",
  "Date de relance",
  "Suivi",
];
function csvRow(c: ContactView): (string | number)[] {
  return [
    c.contact.firstName,
    c.contact.lastName,
    c.company?.name ?? "",
    c.contact.jobTitle,
    c.contact.email,
    c.contact.phone,
    RELATION[c.contact.relation].label,
    c.stage ? STAGE_LABELS[c.stage] : "",
    c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "",
    c.contact.source,
    PRIORITY[c.contact.priority].label,
    c.lastInteraction?.date.slice(0, 10) ?? "",
    c.nextMission?.title ?? "",
    c.nextMission?.dueDate ?? "",
    FOLLOW_UP[c.followUp].label,
  ];
}

export function ContactsPage() {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const run = useCommand();
  const openCreate = useUiStore((s) => s.openCreate);
  const { confirm, dialog } = useConfirm();
  const relationParam = useParam("relation");
  const followParam = useParam("followUp");
  const [relation, setRelation] = useSyncedState<string>(relationParam ?? "all");
  const [followUp, setFollowUp] = useSyncedState<string>(followParam ?? "all");
  const [owner, setOwner] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [stage, setStage] = React.useState("all");
  const [source, setSource] = React.useState("all");
  const [isNew, setIsNew] = useSyncedState<boolean>(useParam("new") === "1");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const rows: Row[] = React.useMemo(
    () =>
      crm.contacts
        .filter((c) => (relation === "all" ? !c.archived : relation === "archived" ? c.archived : c.contact.relation === relation && !c.archived))
        .filter((c) => followUp === "all" || c.followUp === followUp)
        .filter((c) => owner === "all" || (owner === "none" ? !c.contact.ownerId : c.contact.ownerId === owner))
        .filter((c) => priority === "all" || c.contact.priority === priority)
        .filter((c) => stage === "all" || (stage === "none" ? !c.stage : c.stage === stage))
        .filter((c) => source === "all" || c.contact.source === source)
        .filter((c) => !isNew || c.isNew)
        .map((c) => ({ ...c, id: c.contact.id })),
    [crm.contacts, relation, followUp, owner, priority, stage, source, isNew],
  );
  const counts = Object.fromEntries(
    RELATION_TABS.map((t) => [t.value, crm.contacts.filter((c) => (t.value === "all" ? !c.archived : t.value === "archived" ? c.archived : c.contact.relation === t.value && !c.archived)).length]),
  );

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Nom",
      cell: (c) => (
        <div className="flex min-w-44 items-center gap-2">
          <Avatar name={c.name} size="sm" />
          <div className="min-w-0">
            <Link href={`/contacts/${c.id}`} className="block truncate font-medium text-fg hover:underline">
              {c.name}
            </Link>
            <p className="truncate text-xs text-muted">{c.contact.jobTitle || "Fonction non renseignée"}</p>
          </div>
          {c.isNew ? <Badge tone="info">Nouveau</Badge> : null}
        </div>
      ),
      sortValue: (c) => `${c.contact.lastName} ${c.contact.firstName}`,
    },
    {
      id: "company",
      header: "Entreprise",
      cell: (c) =>
        c.company ? (
          <Link href={`/entreprises/${c.company.id}`} className="hover:underline">
            {c.company.name}
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        ),
      sortValue: (c) => c.company?.name ?? null,
    },
    {
      id: "email",
      header: "Coordonnées",
      cell: (c) => (
        <div className="text-xs">
          <p className="max-w-52 truncate">{c.contact.email || "—"}</p>
          <p className="whitespace-nowrap text-muted">{c.contact.phone || "—"}</p>
        </div>
      ),
      sortValue: (c) => c.contact.email || null,
      hideBelow: "lg",
    },
    { id: "relation", header: "Relation", cell: (c) => <RelationBadge relation={c.contact.relation} />, sortValue: (c) => c.contact.relation, hideBelow: "md" },
    { id: "stage", header: "Étape", cell: (c) => <StageBadge stage={c.stage} />, sortValue: (c) => (c.stage ? STAGES.findIndex((s) => s.id === c.stage) : null), hideBelow: "md" },
    {
      id: "owner",
      header: "Responsable",
      cell: (c) => <span className="text-xs">{c.owner ? `${c.owner.firstName} ${c.owner.lastName[0]}.` : "—"}</span>,
      sortValue: (c) => c.owner?.lastName ?? null,
      hideBelow: "lg",
    },
    {
      id: "last",
      header: "Dernière interaction",
      cell: (c) => <span className="text-xs text-muted">{c.lastInteraction ? formatDueIn(c.lastInteraction.date, today) : "Aucune"}</span>,
      sortValue: (c) => c.lastInteraction?.date ?? null,
      hideBelow: "md",
    },
    {
      id: "next",
      header: "Prochaine action",
      cell: (c) => (c.nextMission ? <span className="line-clamp-1 max-w-48 text-xs">{c.nextMission.title}</span> : <span className="text-xs text-subtle">—</span>),
      sortValue: (c) => c.nextMission?.title ?? null,
    },
    {
      id: "due",
      header: "Relance",
      cell: (c) => (c.nextMission ? <DueLabel date={c.nextMission.dueDate} time={c.nextMission.dueTime} today={today} /> : <span className="text-xs text-subtle">—</span>),
      sortValue: (c) => c.nextMission?.dueDate ?? null,
    },
    {
      id: "priority",
      header: "Priorité",
      cell: (c) => <PriorityBadge priority={c.contact.priority} hideNormal={false} />,
      sortValue: (c) => ["critical", "high", "normal", "low"].indexOf(c.contact.priority),
      hideBelow: "lg",
    },
    {
      id: "follow",
      header: "Suivi",
      cell: (c) => (c.archived ? <Badge>Archivé</Badge> : <FollowUpBadge state={c.followUp} />),
      sortValue: (c) => ["overdue", "due", "to_process", "waiting", "no_next_action", "up_to_date"].indexOf(c.followUp),
    },
  ];

  const sel = (ids: string[]) => crm.contacts.filter((c) => ids.includes(c.contact.id));
  const done = () => setSelected(new Set());

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contacts"
        description="Toutes les personnes suivies : prospects, clients, anciens clients et partenaires. L'état de suivi est calculé à partir des missions planifiées."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCSV("contacts", CSV_HEADERS, rows.map(csvRow))} disabled={!rows.length}>
              <Download /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => openCreate("prospect")}>
              <UserPlus /> Nouveau contact
            </Button>
          </>
        }
      />
      <div role="tablist" aria-label="Statut de relation" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {RELATION_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={relation === t.value}
            onClick={() => {
              setRelation(t.value);
              setSelected(new Set());
            }}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              relation === t.value ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:text-fg",
            )}
          >
            {t.label}
            <span className="tabular text-subtle">{counts[t.value]}</span>
          </button>
        ))}
      </div>
      <DataTable
        caption="Liste des contacts"
        rows={rows}
        columns={columns}
        searchText={(c) => [c.name, c.company?.name, c.contact.email, c.contact.phone, c.contact.jobTitle].join(" ")}
        searchPlaceholder="Rechercher un contact…"
        rowHref={(c) => `/contacts/${c.id}`}
        initialSort={{ id: "follow", dir: "asc" }}
        pageSize={20}
        emptyTitle="Aucun contact"
        emptyDescription="Ajoutez votre premier prospect pour démarrer le suivi."
        emptyAction={
          <Button variant="primary" onClick={() => openCreate("prospect")}>
            <UserPlus /> Nouveau contact
          </Button>
        }
        rowClassName={(c) => (c.followUp === "overdue" ? "bg-danger/5" : undefined)}
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <>
            <NativeSelect
              aria-label="Attribuer un responsable"
              className="h-8 w-auto text-xs"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const r = run(C.bulkUpdateContacts, { ids, ownerId: e.target.value === "none" ? null : e.target.value });
                if (r.ok) done();
              }}
            >
              <option value="">Attribuer à…</option>
              {data.employees
                .filter((e) => e.status !== "left")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              <option value="none">Retirer le responsable</option>
            </NativeSelect>
            <NativeSelect
              aria-label="Changer la priorité"
              className="h-8 w-auto text-xs"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const r = run(C.bulkUpdateContacts, { ids, priority: e.target.value as Priority });
                if (r.ok) done();
              }}
            >
              <option value="">Priorité…</option>
              {options(PRIORITY).map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
            <Button variant="ghost" size="sm" onClick={() => downloadCSV("contacts-selection", CSV_HEADERS, sel(ids).map(csvRow))}>
              <Download /> Exporter
            </Button>
            {relation === "archived" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const r = run(C.bulkUpdateContacts, { ids, archived: false });
                  if (r.ok) done();
                }}
              >
                <ArchiveRestore /> Restaurer
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  confirm({
                    title: `Archiver ${ids.length} contact(s) ?`,
                    description: "Les contacts archivés sortent des listes et du suivi, mais leur historique est conservé. Vous pourrez les restaurer.",
                    confirmLabel: "Archiver",
                    action: () => {
                      const r = run(C.bulkUpdateContacts, { ids, archived: true });
                      if (r.ok) done();
                    },
                  })
                }
              >
                <Archive /> Archiver
              </Button>
            )}
          </>
        )}
        toolbar={
          <>
            <FilterBar
              filters={[
                { id: "follow", label: "Suivi", value: followUp, onChange: setFollowUp, options: (Object.keys(FOLLOW_UP) as FollowUpState[]).map((k) => ({ value: k, label: FOLLOW_UP[k].label })) },
                {
                  id: "owner",
                  label: "Responsable",
                  value: owner,
                  onChange: setOwner,
                  options: [
                    ...data.employees.filter((e) => e.department === "sales" || e.department === "direction").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
                    { value: "none", label: "Non attribué" },
                  ],
                },
                { id: "stage", label: "Étape", value: stage, onChange: setStage, options: [...STAGES.map((s) => ({ value: s.id, label: s.label })), { value: "none", label: "Sans opportunité" }] },
                { id: "priority", label: "Priorité", value: priority, onChange: setPriority, options: options(PRIORITY) },
                { id: "source", label: "Source", value: source, onChange: setSource, options: SOURCES.map((s) => ({ value: s, label: s })) },
              ]}
              onReset={() => {
                setFollowUp("all");
                setOwner("all");
                setStage("all");
                setPriority("all");
                setSource("all");
                setIsNew(false);
              }}
            />
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} />
              Nouveaux non traités
            </label>
          </>
        }
      />
      <p className="text-[11px] text-subtle">Dernière mise à jour des états de suivi : {formatDate(today)}. Les contacts archivés ne sont jamais supprimés automatiquement.</p>
      {dialog}
    </div>
  );
}
