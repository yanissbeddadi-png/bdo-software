"use client";
import * as React from "react";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface KanbanColumn<S extends string> {
  id: S;
  label: string;
  hint?: string;
}

/**
 * Tableau Kanban générique : glisser-déposer natif et, pour l'accessibilité
 * clavier / mobile, un sélecteur de colonne sur chaque carte.
 */
export function KanbanBoard<T extends { id: string }, S extends string>({
  columns,
  items,
  getColumn,
  onMove,
  renderCard,
  itemLabel,
  renderHeader,
  cardClassName,
  emptyLabel = "Aucun élément",
}: {
  columns: KanbanColumn<S>[];
  items: T[];
  getColumn: (item: T) => S;
  onMove: (item: T, to: S) => void;
  renderCard: (item: T) => React.ReactNode;
  itemLabel: (item: T) => string;
  /** En-tête de colonne personnalisé (compteurs, valeurs…). */
  renderHeader?: (column: KanbanColumn<S>, items: T[]) => React.ReactNode;
  cardClassName?: (item: T) => string | undefined;
  emptyLabel?: string;
}) {
  const [over, setOver] = React.useState<S | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => {
          const list = items.filter((i) => getColumn(i) === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.label}
              data-column={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const item = items.find((i) => i.id === id);
                if (item && getColumn(item) !== col.id) onMove(item, col.id);
              }}
              className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-bg-elevated", over === col.id ? "border-accent bg-accent/5" : "border-border")}
            >
              {renderHeader ? (
                renderHeader(col, list)
              ) : (
                <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <h3 className="text-sm font-medium text-fg">{col.label}</h3>
                  <span className="text-xs tabular text-muted">{list.length}</span>
                </header>
              )}
              <div className="flex min-h-24 flex-col gap-2 p-2">
                {list.map((item) => (
                  <article
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", item.id);
                      setDragging(item.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    data-card-id={item.id}
                    className={cn(
                      "cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm hover:border-border-strong active:cursor-grabbing",
                      dragging === item.id && "opacity-50",
                      cardClassName?.(item),
                    )}
                  >
                    {renderCard(item)}
                    <NativeSelect aria-label={`Déplacer ${itemLabel(item)}`} value={getColumn(item)} onChange={(e) => onMove(item, e.target.value as S)} className="mt-2 h-7 text-[11px]">
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </article>
                ))}
                {!list.length ? <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-subtle">{emptyLabel}</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
