"use client";
import * as React from "react";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import type { Expense, ExpenseCategory } from "@/lib/domain/types";
import { useCommand, useData, useLookups, usePeriod, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { RowActions } from "@/components/shared/row-actions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/forms/quick-create";
import { ExpenseForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChartCard, BreakdownDonut } from "@/components/charts/charts";
import { EXPENSE_CATEGORY_LABELS, committedExpensesHT, disbursedCash, expensesByCategory, payables } from "@/lib/calculations/finance";
import { expenseTTC } from "@/lib/calculations/money";
import { formatDate, formatEUR, formatVat } from "@/lib/formatters";
import { csvMoney } from "@/lib/export/csv";
import { cn } from "@/lib/utils";

export function ExpensesPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const { projects } = useLookups();
  const { period, label } = usePeriod();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const f = useFilters(["category", "paid", "project", "scope"] as const);
  const { confirm, dialog } = useConfirm();
  const [editId, setEditId] = useSyncedState<string | null>(focus);
  const edit = data.expenses.find((x) => x.id === editId) ?? null;
  const setEdit = (e: Expense | null) => setEditId(e?.id ?? null);

  const paidState = (e: Expense) => (e.paid ? "paid" : e.dueDate < today ? "overdue" : "unpaid");
  const rows = data.expenses.filter(
    (e) => f.match("category", e.category) && f.match("paid", paidState(e)) && f.match("project", e.projectId ?? "none") && (f.values.scope === "all" || (e.date >= period.start && e.date <= period.end)),
  );

  const columns: Column<Expense>[] = [
    { id: "date", header: "Date", cell: (e) => formatDate(e.date), sortValue: (e) => e.date, csv: (e) => e.date },
    { id: "label", header: "Libellé", cell: (e) => <span className="text-fg">{e.label}</span>, sortValue: (e) => e.label, csv: (e) => e.label },
    { id: "supplier", header: "Fournisseur", cell: (e) => e.supplier, sortValue: (e) => e.supplier, csv: (e) => e.supplier, hideBelow: "md" },
    { id: "category", header: "Catégorie", cell: (e) => <Badge>{EXPENSE_CATEGORY_LABELS[e.category]}</Badge>, sortValue: (e) => e.category, csv: (e) => EXPENSE_CATEGORY_LABELS[e.category] },
    { id: "project", header: "Projet", cell: (e) => (e.projectId ? (projects.get(e.projectId)?.code ?? "—") : <span className="text-subtle">—</span>), csv: (e) => (e.projectId ? (projects.get(e.projectId)?.code ?? "") : ""), hideBelow: "lg" },
    { id: "ht", header: "HT", align: "right", cell: (e) => formatEUR(e.amountHT), sortValue: (e) => e.amountHT, csv: (e) => csvMoney(e.amountHT) },
    { id: "vat", header: "TVA", align: "right", cell: (e) => formatVat(e.vatRate), csv: (e) => e.vatRate / 100, hideBelow: "lg" },
    { id: "ttc", header: "TTC", align: "right", cell: (e) => formatEUR(expenseTTC(e)), sortValue: (e) => expenseTTC(e), csv: (e) => csvMoney(expenseTTC(e)), hideBelow: "md" },
    {
      id: "state",
      header: "Paiement",
      cell: (e) => {
        const s = paidState(e);
        return <Badge tone={s === "paid" ? "success" : s === "overdue" ? "danger" : "warning"}>{s === "paid" ? `Payée ${formatDate(e.paidDate)}` : s === "overdue" ? `Échue ${formatDate(e.dueDate)}` : `À payer ${formatDate(e.dueDate)}`}</Badge>;
      },
      sortValue: (e) => paidState(e),
      csv: (e) => (e.paid ? `Payée ${e.paidDate}` : `À payer ${e.dueDate}`),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (e) => (
        <RowActions
          actions={[
            !e.paid && { label: "Marquer comme payée", icon: <CheckCircle2 />, onSelect: () => run(C.markExpensePaid, { id: e.id, paidDate: today }) },
            { label: "Modifier", icon: <Pencil />, onSelect: () => setEdit(e) },
            {
              label: "Supprimer",
              icon: <Trash2 />,
              danger: true,
              separatorBefore: true,
              onSelect: () => confirm({ title: "Supprimer cette dépense ?", description: `« ${e.label} » (${formatEUR(e.amountHT)} HT) sera supprimée. La trésorerie et les indicateurs seront recalculés. Action journalisée.`, confirmLabel: "Supprimer", action: () => run(C.deleteExpense, { id: e.id }) }),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dépenses"
        description="Dépenses engagées (date de la dépense) et décaissements (date de paiement) sont suivis séparément."
        actions={
          <Button variant="primary" onClick={() => openCreate("expense")}>
            <Plus /> Nouvelle dépense
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={`Engagées HT · ${label.toLowerCase()}`} value={formatEUR(committedExpensesHT(data.expenses, period))} hint="Dépenses datées dans la période, payées ou non." />
        <MetricCard label={`Décaissées TTC · ${label.toLowerCase()}`} value={formatEUR(disbursedCash(data.expenses, period))} hint="Dépenses payées dont la date de paiement est dans la période." />
        <MetricCard label="Dettes fournisseurs" value={formatEUR(payables(data.expenses))} hint="Dépenses non payées (TTC)." />
        <MetricCard label="Dépenses échues" value={data.expenses.filter((e) => !e.paid && e.dueDate < today).length} tone={data.expenses.some((e) => !e.paid && e.dueDate < today) ? "danger" : "default"} hint="Dépenses non payées dont l'échéance est dépassée." />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1fr_360px]">
        <DataTable
          caption="Liste des dépenses"
          rows={rows}
          columns={columns}
          searchText={(e) => `${e.label} ${e.supplier} ${e.notes}`}
          searchPlaceholder="Libellé, fournisseur…"
          exportName="depenses"
          onRowClick={(e) => setEdit(e)}
          highlightId={focus}
          initialSort={{ id: "date", dir: "desc" }}
          rowClassName={(e) => cn(paidState(e) === "overdue" && "bg-danger/5")}
          toolbar={
            <FilterBar
              onReset={f.reset}
              filters={[
                { id: "scope", label: "Période", value: f.values.scope, onChange: f.set("scope"), options: [{ value: "period", label: label }] },
                { id: "category", label: "Catégorie", value: f.values.category, onChange: f.set("category"), options: (Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => ({ value: k, label: EXPENSE_CATEGORY_LABELS[k] })) },
                { id: "paid", label: "Paiement", value: f.values.paid, onChange: f.set("paid"), options: [{ value: "paid", label: "Payées" }, { value: "unpaid", label: "À payer" }, { value: "overdue", label: "Échues" }] },
                { id: "project", label: "Projet", value: f.values.project, onChange: f.set("project"), options: [{ value: "none", label: "Sans projet" }, ...data.projects.map((p) => ({ value: p.id, label: p.code }))] },
              ]}
            />
          }
        />
        <ChartCard title="Répartition par catégorie" description={`Dépenses engagées HT — ${label.toLowerCase()}`} height={300}>
          <BreakdownDonut items={expensesByCategory(data.expenses, period).map((x) => ({ key: x.key, label: x.label, value: x.value }))} />
        </ChartCard>
      </div>
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Modifier la dépense" wide>
        {edit ? <ExpenseForm entity={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} /> : null}
      </FormDialog>
      {dialog}
    </div>
  );
}
