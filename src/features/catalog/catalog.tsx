"use client";
import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import type { Product } from "@/lib/domain/types";
import { useData, useSummaries } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { RowActions } from "@/components/shared/row-actions";
import { FormDialog } from "@/components/forms/quick-create";
import { ProductForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_TYPE_LABELS } from "@/lib/calculations/finance";
import { BILLING_MODE } from "@/lib/formatters/labels";
import { formatEUR, formatPercent, formatVat } from "@/lib/formatters";
import { csvMoney } from "@/lib/export/csv";
import { lineHT, ratio } from "@/lib/calculations/money";

export function CatalogPage() {
  const data = useData();
  const summaries = useSummaries();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const f = useFilters(["type", "status"] as const);
  const [editId, setEditId] = useSyncedState<string | null>(focus);
  const edit = data.products.find((x) => x.id === editId) ?? null;
  const setEdit = (p: Product | null) => setEditId(p?.id ?? null);

  const revenue = new Map<string, number>();
  for (const s of summaries) {
    if (s.invoice.baseStatus !== "issued") continue;
    for (const i of s.invoice.items) if (i.productId) revenue.set(i.productId, (revenue.get(i.productId) ?? 0) + lineHT(i));
  }
  const margin = (p: Product) => p.unitPrice - p.unitCost;
  const rows = data.products.filter((p) => f.match("type", p.type) && f.match("status", p.status));
  const columns: Column<Product>[] = [
    { id: "sku", header: "Référence", cell: (p) => <span className="font-mono text-xs text-muted">{p.sku}</span>, sortValue: (p) => p.sku, csv: (p) => p.sku },
    {
      id: "name",
      header: "Offre",
      cell: (p) => (
        <div>
          <p className="font-medium text-fg">{p.name}</p>
          <p className="line-clamp-1 text-[11px] text-muted">{p.description}</p>
        </div>
      ),
      sortValue: (p) => p.name,
      csv: (p) => p.name,
    },
    { id: "type", header: "Type", cell: (p) => <Badge tone="info">{PRODUCT_TYPE_LABELS[p.type]}</Badge>, sortValue: (p) => p.type, csv: (p) => PRODUCT_TYPE_LABELS[p.type], hideBelow: "md" },
    { id: "billing", header: "Facturation", cell: (p) => BILLING_MODE[p.billingMode], csv: (p) => BILLING_MODE[p.billingMode], hideBelow: "lg" },
    { id: "price", header: "Prix HT", align: "right", cell: (p) => formatEUR(p.unitPrice), sortValue: (p) => p.unitPrice, csv: (p) => csvMoney(p.unitPrice) },
    { id: "cost", header: "Coût estimé", align: "right", cell: (p) => formatEUR(p.unitCost), sortValue: (p) => p.unitCost, csv: (p) => csvMoney(p.unitCost), hideBelow: "md" },
    {
      id: "margin",
      header: "Marge estimée",
      align: "right",
      cell: (p) => `${formatEUR(margin(p))} · ${formatPercent(ratio(margin(p), p.unitPrice), 0)}`,
      sortValue: (p) => ratio(margin(p), p.unitPrice) ?? 0,
      csv: (p) => csvMoney(margin(p)),
    },
    { id: "vat", header: "TVA", align: "right", cell: (p) => formatVat(p.vatRate), csv: (p) => p.vatRate / 100, hideBelow: "lg" },
    {
      id: "revenue",
      header: "CA facturé HT",
      align: "right",
      cell: (p) => formatEUR(revenue.get(p.id) ?? 0, { round: true }),
      sortValue: (p) => revenue.get(p.id) ?? 0,
      csv: (p) => csvMoney(revenue.get(p.id) ?? 0),
    },
    {
      id: "status",
      header: "Statut",
      cell: (p) => <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status === "active" ? "Actif" : "Archivé"}</Badge>,
      sortValue: (p) => p.status,
      csv: (p) => p.status,
    },
    { id: "actions", header: "", align: "right", cell: (p) => <RowActions actions={[{ label: "Modifier", icon: <Pencil />, onSelect: () => setEdit(p) }]} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Produits et services"
        description="Catalogue centralisé alimentant les devis et factures. Modifier un prix n'altère jamais les pièces déjà émises (les prix sont figés dans chaque ligne)."
        actions={
          <Button variant="primary" onClick={() => openCreate("product")}>
            <Plus /> Nouvelle offre
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Offres actives" value={data.products.filter((p) => p.status === "active").length} />
        <MetricCard label="Abonnements SaaS" value={data.products.filter((p) => p.type === "saas").length} />
        <MetricCard
          label="Marge estimée moyenne"
          value={formatPercent(data.products.length ? data.products.reduce((s, p) => s + (ratio(margin(p), p.unitPrice) ?? 0), 0) / data.products.length : null, 0)}
          hint="Moyenne simple des marges unitaires estimées."
        />
        <MetricCard label="Meilleure vente" value={[...data.products].sort((a, b) => (revenue.get(b.id) ?? 0) - (revenue.get(a.id) ?? 0))[0]?.name ?? "—"} />
      </div>
      <DataTable
        caption="Catalogue"
        rows={rows}
        columns={columns}
        searchText={(p) => `${p.name} ${p.sku} ${p.description} ${p.category}`}
        exportName="catalogue"
        onRowClick={(p) => setEdit(p)}
        highlightId={focus}
        initialSort={{ id: "revenue", dir: "desc" }}
        toolbar={
          <FilterBar
            onReset={f.reset}
            filters={[
              {
                id: "type",
                label: "Type",
                value: f.values.type,
                onChange: f.set("type"),
                options: Object.entries(PRODUCT_TYPE_LABELS)
                  .filter(([k]) => k !== "other")
                  .map(([value, label]) => ({ value, label })),
              },
              {
                id: "status",
                label: "Statut",
                value: f.values.status,
                onChange: f.set("status"),
                options: [
                  { value: "active", label: "Actif" },
                  { value: "archived", label: "Archivé" },
                ],
              },
            ]}
          />
        }
      />
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.name ?? ""}>
        {edit ? <ProductForm entity={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} /> : null}
      </FormDialog>
    </div>
  );
}
