"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { LineItem } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { useData } from "@/lib/store/hooks";
import { documentTotals, lineHT } from "@/lib/calculations/money";
import { formatEUR, formatVat } from "@/lib/formatters";
import { newId } from "@/lib/domain/ids";

/**
 * Éditeur de lignes de devis / facture. Le choix d'un produit du catalogue
 * recopie (fige) sa désignation, son prix et sa TVA dans la ligne.
 */
export function LineItemsEditor({ value, onChange }: { value: LineItem[]; onChange: (items: LineItem[]) => void }) {
  const data = useData();
  const products = data.products.filter((p) => p.status === "active");
  const vatRates = data.settings.company.vatRates;
  const update = (id: string, patch: Partial<LineItem>) => onChange(value.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => onChange([...value, { id: newId("li"), productId: null, description: "", quantity: 1, unitPrice: 0, vatRate: data.settings.company.defaultVatRate }]);
  const totals = documentTotals(value.filter((l) => Number.isFinite(l.unitPrice) && Number.isFinite(l.quantity)));

  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={l.id} className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-bg-elevated p-2">
          <NativeSelect
            aria-label={`Produit ligne ${i + 1}`}
            className="col-span-12 sm:col-span-4"
            value={l.productId ?? ""}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              if (p) update(l.id, { productId: p.id, description: p.name, unitPrice: p.unitPrice, vatRate: p.vatRate });
              else update(l.id, { productId: null });
            }}
          >
            <option value="">Ligne libre</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <Input aria-label={`Désignation ligne ${i + 1}`} className="col-span-12 sm:col-span-8" placeholder="Désignation" value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} />
          <Input aria-label={`Quantité ligne ${i + 1}`} className="col-span-3 tabular" type="number" step="0.01" min="0" value={Number.isFinite(l.quantity) ? l.quantity : ""} onChange={(e) => update(l.id, { quantity: e.target.value === "" ? Number.NaN : Number(e.target.value) })} />
          <MoneyInput aria-label={`Prix unitaire HT ligne ${i + 1}`} className="col-span-4" allowNegative value={l.unitPrice} onChange={(c) => update(l.id, { unitPrice: c })} />
          <NativeSelect aria-label={`TVA ligne ${i + 1}`} className="col-span-3" value={String(l.vatRate)} onChange={(e) => update(l.id, { vatRate: Number(e.target.value) })}>
            {vatRates.map((r) => (
              <option key={r.id} value={r.rate}>
                {formatVat(r.rate)}
              </option>
            ))}
          </NativeSelect>
          <div className="col-span-2 flex items-center justify-end gap-1">
            <span className="hidden text-xs tabular text-muted lg:inline">{Number.isFinite(l.unitPrice) && Number.isFinite(l.quantity) ? formatEUR(lineHT(l)) : "—"}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => onChange(value.filter((x) => x.id !== l.id))}>
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={add}>
          <Plus /> Ajouter une ligne
        </Button>
        <dl className="flex gap-4 text-xs tabular">
          <div>
            <dt className="text-subtle">Total HT</dt>
            <dd className="font-medium">{formatEUR(totals.totalHT)}</dd>
          </div>
          <div>
            <dt className="text-subtle">TVA</dt>
            <dd className="font-medium">{formatEUR(totals.totalVAT)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Total TTC</dt>
            <dd className="font-semibold text-fg">{formatEUR(totals.totalTTC)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
