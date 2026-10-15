"use client";
import * as React from "react";
import { X } from "lucide-react";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface FilterDef {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

/** Barre de filtres : chaque filtre modifie réellement la liste affichée. */
export function FilterBar({ filters, onReset }: { filters: FilterDef[]; onReset?: () => void }) {
  const active = filters.some((f) => f.value !== "all");
  return (
    <>
      {filters.map((f) => (
        <NativeSelect key={f.id} value={f.value} onChange={(e) => f.onChange(e.target.value)} aria-label={f.label} className="h-8 w-auto min-w-36 text-xs">
          <option value="all">{f.label} : tous</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {active && onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X /> Réinitialiser
        </Button>
      ) : null}
    </>
  );
}

/** Gestion d'un ensemble de filtres « all | valeur ». */
export function useFilters<K extends string>(keys: readonly K[]) {
  const initial = Object.fromEntries(keys.map((k) => [k, "all"])) as Record<K, string>;
  const [values, setValues] = React.useState(initial);
  const set = (k: K) => (v: string) => setValues((s) => ({ ...s, [k]: v }));
  const reset = () => setValues(initial);
  const match = (k: K, v: string | null | undefined) => values[k] === "all" || values[k] === v;
  return { values, set, reset, match };
}
