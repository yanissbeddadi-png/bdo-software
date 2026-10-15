"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Columns3, FilePlus2, Flag, List, ListPlus, NotebookPen, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import type { Project, ProjectStatus } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useSummaries, useToday } from "@/lib/store/hooks";
import { useUiStore } from "@/lib/store/ui-store";
import { useParam } from "@/lib/store/params";
import * as C from "@/lib/domain/commands";
import { isProjectActive, isProjectLate, projectFinancials, projectProgress, PROJECT_STATUS_LABELS, onTimeDeliveryRate } from "@/lib/calculations/projects";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { RowActions } from "@/components/shared/row-actions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { KanbanBoard } from "@/components/shared/kanban";
import { MonthCalendar, LegendDot, type CalendarEvent } from "@/components/shared/calendar";
import { FormDialog } from "@/components/forms/quick-create";
import { ProjectForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox, ProgressBar } from "@/components/ui/misc";
import { PRIORITY, PROJECT_STATUS, INVOICE_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDueIn, formatEUR, formatNumber, formatPercent } from "@/lib/formatters";
import { csvMoney } from "@/lib/export/csv";
import { cn } from "@/lib/utils";
import { TaskTable } from "@/features/tasks/tasks";
import { NotesGrid } from "@/features/clients/clients";
import { expenseTTC } from "@/lib/calculations/money";

const STATUS_ORDER: ProjectStatus[] = ["to_plan", "planned", "in_progress", "on_hold", "at_risk", "done", "cancelled"];

export function ProjectsPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const summaries = useSummaries();
  const { clients, employees } = useLookups();
  const openCreate = useUiStore((s) => s.openCreate);
  const [view, setView] = React.useState<"list" | "kanban" | "calendar">("list");
  const f = useFilters(["status", "client", "manager", "late"] as const);
  const rows = data.projects.filter(
    (p) => f.match("status", p.status) && f.match("client", p.clientId) && f.match("manager", p.managerId ?? "") && f.match("late", isProjectLate(p, today) ? "late" : "ok"),
  );
  const fin = React.useMemo(() => new Map(data.projects.map((p) => [p.id, projectFinancials(p, data, summaries)])), [data, summaries]);
  const active = data.projects.filter(isProjectActive);
  const sum = (k: "budget" | "actualCost" | "estimatedHours" | "actualHours" | "estimatedMargin", list = active) => list.reduce((s, p) => s + fin.get(p.id)![k], 0);
  const moveStatus = (p: Project, status: ProjectStatus) => run(C.setProjectStatus, { id: p.id, status });

  const columns: Column<Project>[] = [
    { id: "code", header: "Code", cell: (p) => <span className="font-mono text-xs text-muted">{p.code}</span>, sortValue: (p) => p.code, csv: (p) => p.code },
    { id: "name", header: "Projet", cell: (p) => <span className="font-medium text-fg">{p.name}</span>, sortValue: (p) => p.name, csv: (p) => p.name },
    {
      id: "client",
      header: "Client",
      cell: (p) => clients.get(p.clientId)?.name ?? "—",
      sortValue: (p) => clients.get(p.clientId)?.name ?? "",
      csv: (p) => clients.get(p.clientId)?.name ?? "",
      hideBelow: "md",
    },
    {
      id: "manager",
      header: "Responsable",
      cell: (p) => (p.managerId ? employees.get(p.managerId)?.firstName : "—"),
      csv: (p) => (p.managerId ? `${employees.get(p.managerId)?.firstName} ${employees.get(p.managerId)?.lastName}` : ""),
      hideBelow: "lg",
    },
    { id: "due", header: "Échéance", cell: (p) => <span className={cn(isProjectLate(p, today) && "text-danger")}>{formatDate(p.dueDate)}</span>, sortValue: (p) => p.dueDate, csv: (p) => p.dueDate },
    {
      id: "progress",
      header: "Progression",
      cell: (p) => {
        const v = projectProgress(p, data.tasks);
        return (
          <div className="flex w-28 items-center gap-2">
            <ProgressBar value={v} tone={p.status === "done" ? "success" : "accent"} label={`Progression ${p.code}`} />
            <span className="w-8 text-right text-xs tabular text-muted">{v} %</span>
          </div>
        );
      },
      sortValue: (p) => projectProgress(p, data.tasks),
      csv: (p) => projectProgress(p, data.tasks),
    },
    {
      id: "budget",
      header: "Budget consommé",
      align: "right",
      cell: (p) => {
        const x = fin.get(p.id)!;
        return <span className={cn(x.budgetVariance > 0 && "text-danger")}>{formatPercent(x.budgetConsumption, 0)}</span>;
      },
      sortValue: (p) => fin.get(p.id)!.budgetConsumption ?? 0,
      csv: (p) => Math.round(fin.get(p.id)!.budgetConsumption ?? 0),
      hideBelow: "lg",
    },
    { id: "price", header: "Prix de vente", align: "right", cell: (p) => formatEUR(p.salePrice, { round: true }), sortValue: (p) => p.salePrice, csv: (p) => csvMoney(p.salePrice), hideBelow: "md" },
    {
      id: "priority",
      header: "Priorité",
      cell: (p) => <StatusBadge meta={PRIORITY[p.priority]} />,
      sortValue: (p) => ["critical", "high", "normal", "low"].indexOf(p.priority),
      csv: (p) => PRIORITY[p.priority].label,
      hideBelow: "lg",
    },
    { id: "status", header: "Statut", cell: (p) => <StatusBadge meta={PROJECT_STATUS[p.status]} />, sortValue: (p) => STATUS_ORDER.indexOf(p.status), csv: (p) => PROJECT_STATUS[p.status].label },
  ];

  const events: CalendarEvent[] = [
    ...rows.map((p) => ({
      id: `due-${p.id}`,
      date: p.dueDate,
      title: `${p.code} · échéance`,
      tone: (p.status === "done" ? "success" : isProjectLate(p, today) ? "danger" : "accent") as CalendarEvent["tone"],
      href: `/projets/${p.id}`,
    })),
    ...rows.flatMap((p) =>
      p.milestones.map((m) => ({
        id: m.id,
        date: m.dueDate,
        title: `${p.code} · ${m.title}`,
        tone: (m.done ? "success" : m.dueDate < today ? "danger" : "violet") as CalendarEvent["tone"],
        href: `/projets/${p.id}`,
      })),
    ),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projets"
        description="Suivi des livraisons, de la charge et de la rentabilité. La progression est pondérée par l'effort estimé des tâches et les jalons."
        actions={
          <Button variant="primary" onClick={() => openCreate("project")}>
            <Plus /> Nouveau projet
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <MetricCard label="Projets actifs" value={active.length} />
        <MetricCard label="Projets terminés" value={data.projects.filter((p) => p.status === "done").length} tone="success" />
        <MetricCard label="Projets en retard" value={data.projects.filter((p) => isProjectLate(p, today)).length} tone={data.projects.some((p) => isProjectLate(p, today)) ? "danger" : "default"} />
        <MetricCard label="Budget total (actifs)" value={formatEUR(sum("budget"), { compact: true })} hint="Enveloppes de coûts des projets actifs." />
        <MetricCard label="Budget consommé" value={formatEUR(sum("actualCost"), { compact: true })} hint="Coûts réels saisis (dépenses + temps) des projets actifs." />
        <MetricCard label="Charge estimée" value={`${formatNumber(sum("estimatedHours"))} h`} />
        <MetricCard label="Charge réalisée" value={`${formatNumber(sum("actualHours"))} h`} />
        <MetricCard
          label="Marge estimée (actifs)"
          value={formatEUR(sum("estimatedMargin"), { compact: true })}
          hint="Σ (prix de vente − coût estimé) des projets actifs."
          footer={<span className="text-[11px] text-muted">Livraison à l&apos;heure : {formatPercent(onTimeDeliveryRate(data.projects), 0)}</span>}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Vue"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "Liste", icon: <List /> },
            { value: "kanban", label: "Kanban", icon: <Columns3 /> },
            { value: "calendar", label: "Calendrier", icon: <CalendarDays /> },
          ]}
        />
        <FilterBar
          onReset={f.reset}
          filters={[
            { id: "status", label: "Statut", value: f.values.status, onChange: f.set("status"), options: STATUS_ORDER.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] })) },
            {
              id: "client",
              label: "Client",
              value: f.values.client,
              onChange: f.set("client"),
              options: data.clients.filter((c) => data.projects.some((p) => p.clientId === c.id)).map((c) => ({ value: c.id, label: c.name })),
            },
            { id: "manager", label: "Responsable", value: f.values.manager, onChange: f.set("manager"), options: data.employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })) },
            {
              id: "late",
              label: "Délais",
              value: f.values.late,
              onChange: f.set("late"),
              options: [
                { value: "late", label: "En retard" },
                { value: "ok", label: "Dans les délais" },
              ],
            },
          ]}
        />
      </div>
      {view === "list" ? (
        <DataTable
          caption="Liste des projets"
          rows={rows}
          columns={columns}
          searchText={(p) => `${p.code} ${p.name} ${clients.get(p.clientId)?.name ?? ""}`}
          rowHref={(p) => `/projets/${p.id}`}
          exportName="projets"
          initialSort={{ id: "due", dir: "asc" }}
          emptyTitle="Aucun projet"
        />
      ) : view === "kanban" ? (
        <KanbanBoard
          columns={STATUS_ORDER.map((s) => ({ id: s, label: PROJECT_STATUS_LABELS[s] }))}
          items={rows}
          getColumn={(p) => p.status}
          onMove={moveStatus}
          itemLabel={(p) => p.name}
          renderCard={(p) => (
            <Link href={`/projets/${p.id}`} className="block">
              <p className="font-mono text-[11px] text-subtle">{p.code}</p>
              <p className="line-clamp-2 text-sm font-medium text-fg">{p.name}</p>
              <p className="text-xs text-muted">{clients.get(p.clientId)?.name}</p>
              <ProgressBar value={projectProgress(p, data.tasks)} className="mt-2" label={`Progression ${p.code}`} />
              <p className={cn("mt-1 text-[11px]", isProjectLate(p, today) ? "text-danger" : "text-subtle")}>Échéance {formatDueIn(p.dueDate, today)}</p>
            </Link>
          )}
        />
      ) : (
        <MonthCalendar
          events={events}
          today={today}
          legend={
            <>
              <LegendDot tone="accent" label="Échéance" />
              <LegendDot tone="violet" label="Jalon" />
              <LegendDot tone="danger" label="En retard" />
              <LegendDot tone="success" label="Terminé" />
            </>
          }
        />
      )}
    </div>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const run = useCommand();
  const router = useRouter();
  const openCreate = useUiStore((s) => s.openCreate);
  const { employees, clients } = useLookups();
  const { confirm, dialog } = useConfirm();
  const [edit, setEdit] = React.useState(false);
  const [ms, setMs] = React.useState({ title: "", dueDate: today });
  const focus = useParam("focus");
  const project = data.projects.find((p) => p.id === id);
  if (!project)
    return (
      <ErrorState
        title="Projet introuvable"
        action={
          <Button asChild>
            <Link href="/projets">Retour aux projets</Link>
          </Button>
        }
      />
    );
  const f = projectFinancials(project, data, summaries);
  const progress = projectProgress(project, data.tasks);
  const tasks = data.tasks.filter((t) => t.projectId === id);
  const invoices = summaries.filter((s) => s.invoice.projectId === id);
  const expenses = data.expenses.filter((e) => e.projectId === id);
  const notes = data.notes.filter((n) => n.projectId === id);
  const late = isProjectLate(project, today);

  return (
    <div className="space-y-6">
      <Link href="/projets" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Projets
      </Link>
      <PageHeader
        title={`${project.code} · ${project.name}`}
        description={
          <span>
            <Link href={`/clients/${project.clientId}`} className="text-accent hover:underline">
              {clients.get(project.clientId)?.name}
            </Link>{" "}
            · du {formatDate(project.startDate)} au {formatDate(project.dueDate)} · responsable{" "}
            {project.managerId ? `${employees.get(project.managerId)?.firstName} ${employees.get(project.managerId)?.lastName}` : "—"}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("task", { projectId: id, clientId: project.clientId })}>
              <ListPlus /> Tâche
            </Button>
            {project.status !== "done" ? (
              <Button variant="success" onClick={() => run(C.setProjectStatus, { id, status: "done" })}>
                <CheckCircle2 /> Terminer le projet
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setEdit(true)}>
              <Pencil /> Modifier
            </Button>
            <RowActions
              label="Autres actions"
              actions={[
                { label: "Facturer ce projet", icon: <FilePlus2 />, onSelect: () => openCreate("invoice", { clientId: project.clientId, projectId: id }) },
                { label: "Ajouter une dépense", icon: <Wallet />, onSelect: () => openCreate("expense", { projectId: id }) },
                { label: "Ajouter une note", icon: <NotebookPen />, onSelect: () => openCreate("note", { projectId: id, clientId: project.clientId }) },
                {
                  label: "Supprimer",
                  icon: <Trash2 />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () =>
                    confirm({
                      title: "Supprimer ce projet ?",
                      description: "Possible uniquement sans tâches, dépenses ni factures rattachées ; sinon, passez-le au statut « Annulé ».",
                      confirmLabel: "Supprimer",
                      action: () => {
                        const r = run(C.deleteProject, { id });
                        if (r.ok) router.push("/projets");
                      },
                    }),
                },
              ]}
            />
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge meta={PROJECT_STATUS[project.status]} />
          <StatusBadge meta={PRIORITY[project.priority]} />
          {late ? <Badge tone="danger">En retard</Badge> : null}
          {f.budgetVariance > 0 ? <Badge tone="danger">Dépassement {formatEUR(f.budgetVariance)}</Badge> : null}
        </div>
      </PageHeader>

      <Card>
        <CardContent className="grid gap-6 pt-5 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-xs text-muted">Progression</p>
            <p className="mt-1 text-3xl font-semibold tabular">{progress} %</p>
            <ProgressBar value={progress} className="mt-2 h-2" tone={project.status === "done" ? "success" : "accent"} label="Progression du projet" />
            <p className="mt-2 text-[11px] text-subtle">Règle : 70 % effort des tâches terminées + 30 % jalons atteints ; 100 % uniquement à la clôture.</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            {[
              ["Prix de vente HT", formatEUR(f.salePrice), "Contractuel"],
              ["Budget (coûts)", formatEUR(f.budget), "Enveloppe autorisée"],
              ["Coût estimé", formatEUR(f.estimatedCost), "Estimation initiale"],
              ["Coût réel saisi", formatEUR(f.actualCost), `Dépenses ${formatEUR(f.expenseCost, { round: true })} + temps ${formatEUR(f.laborCost, { round: true })}`],
              ["CA facturé HT", formatEUR(f.invoiced), `Encaissé TTC ${formatEUR(f.collected, { round: true })}`],
              ["Marge estimée", formatEUR(f.estimatedMargin), formatPercent(f.estimatedMarginRate)],
              ["Marge à date", formatEUR(f.currentMargin), "CA facturé − coût réel"],
              ["Écart budgétaire", formatEUR(f.budgetVariance, { sign: true }), f.budgetVariance > 0 ? "Dépassement" : "Sous le budget"],
            ].map(([k, v, h]) => (
              <div key={k}>
                <dt className="text-[11px] text-muted">{k}</dt>
                <dd className={cn("tabular font-medium", k === "Écart budgétaire" && f.budgetVariance > 0 && "text-danger")}>{v}</dd>
                <dd className="text-[11px] text-subtle">{h}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section>
        <SectionTitle title={`Tâches (${tasks.length})`} description={`Charge : ${formatNumber(f.actualHours, 1)} h réalisées / ${formatNumber(f.estimatedHours, 1)} h estimées`} />
        <TaskTable tasks={tasks} focusId={focus} compact />
      </section>
      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Jalons</CardTitle>
              <CardDescription>
                {project.milestones.filter((m) => m.done).length}/{project.milestones.length} atteints
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-2">
              {project.milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <Checkbox checked={m.done} onCheckedChange={() => run(C.toggleMilestone, { projectId: id, milestoneId: m.id }, { silent: true })} aria-label={`Jalon ${m.title}`} />
                  <Flag className={cn("size-3.5", m.done ? "text-success" : m.dueDate < today ? "text-danger" : "text-violet")} />
                  <span className={cn("flex-1", m.done && "text-muted line-through")}>{m.title}</span>
                  <span className={cn("text-xs tabular", !m.done && m.dueDate < today ? "text-danger" : "text-muted")}>{formatDate(m.dueDate)}</span>
                  <Button size="icon-sm" variant="ghost" aria-label="Supprimer le jalon" onClick={() => run(C.deleteMilestone, { projectId: id, milestoneId: m.id })}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
              {!project.milestones.length ? <li className="text-sm text-muted">Aucun jalon défini.</li> : null}
            </ol>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const r = run(C.addMilestone, { projectId: id, ...ms });
                if (r.ok) setMs({ title: "", dueDate: today });
              }}
            >
              <Input aria-label="Titre du jalon" placeholder="Nouveau jalon" className="min-w-40 flex-1" value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} />
              <Input aria-label="Date du jalon" type="date" className="w-40" value={ms.dueDate} onChange={(e) => setMs({ ...ms, dueDate: e.target.value })} />
              <Button type="submit" variant="secondary" size="icon" aria-label="Ajouter le jalon">
                <Plus />
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Équipe et risques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {project.memberIds.map((m) => (
                <Link key={m} href={`/equipe?focus=${m}`}>
                  <Badge tone="info">
                    {employees.get(m)?.firstName} {employees.get(m)?.lastName}
                  </Badge>
                </Link>
              ))}
              {!project.memberIds.length ? <span className="text-muted">Aucun membre.</span> : null}
            </div>
            <p className="text-xs text-muted">{project.description}</p>
            {project.risks ? <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">{project.risks}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Factures et dépenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {invoices.map((s) => (
              <Link key={s.invoice.id} href={`/finances/factures/${s.invoice.id}`} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-interactive/40">
                <span className="flex-1 truncate">{s.invoice.number}</span>
                <StatusBadge meta={INVOICE_STATUS[s.status]} />
                <span className="w-24 text-right tabular">{formatEUR(s.totalHT, { round: true })}</span>
              </Link>
            ))}
            {expenses.map((e) => (
              <Link key={e.id} href={`/finances/depenses?focus=${e.id}`} className="flex items-center gap-2 rounded px-1 py-1 text-muted hover:bg-interactive/40">
                <span className="flex-1 truncate">{e.label}</span>
                <Badge>{e.paid ? "Payée" : "À payer"}</Badge>
                <span className="w-24 text-right tabular">−{formatEUR(expenseTTC(e), { round: true })}</span>
              </Link>
            ))}
            {!invoices.length && !expenses.length ? <p className="text-muted">Aucune pièce rattachée.</p> : null}
          </CardContent>
        </Card>
      </div>
      {notes.length ? (
        <section>
          <SectionTitle title="Notes" />
          <NotesGrid notes={notes} />
        </section>
      ) : null}
      <FormDialog open={edit} onOpenChange={setEdit} title={`Modifier ${project.code}`} wide>
        <ProjectForm entity={project} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </FormDialog>
      {dialog}
      {!tasks.length && project.status === "to_plan" ? <EmptyState title="Projet à planifier" description="Ajoutez des tâches et des jalons pour suivre sa progression." /> : null}
    </div>
  );
}
