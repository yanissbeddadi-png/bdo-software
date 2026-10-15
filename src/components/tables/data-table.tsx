"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { downloadCSV, type CsvCell } from "@/lib/export/csv";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Valeur de tri ; si absente, la colonne n'est pas triable. */
  sortValue?: (row: T) => string | number | null;
  /** Valeur exportée en CSV ; si absente, la colonne n'est pas exportée. */
  csv?: (row: T) => CsvCell;
  align?: "left" | "right" | "center";
  className?: string;
  /** Masquée sous ce point de rupture. */
  hideBelow?: "sm" | "md" | "lg";
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchText,
  searchPlaceholder = "Rechercher…",
  rowHref,
  onRowClick,
  toolbar,
  exportName,
  pageSize = 15,
  initialSort,
  emptyTitle = "Aucun élément",
  emptyDescription,
  emptyAction,
  highlightId,
  rowClassName,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  rowHref?: (row: T) => string | null;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  exportName?: string;
  pageSize?: number;
  initialSort?: { id: string; dir: "asc" | "desc" };
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  highlightId?: string | null;
  rowClassName?: (row: T) => string | undefined;
  caption: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q));
  }, [rows, query, searchText]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr")) * dir;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  // Affiche la page contenant l'élément mis en évidence (ajustement pendant le rendu).
  const [shownHighlight, setShownHighlight] = React.useState<string | null | undefined>(null);
  if (highlightId && highlightId !== shownHighlight) {
    setShownHighlight(highlightId);
    const idx = sorted.findIndex((r) => r.id === highlightId);
    if (idx >= 0) setPage(Math.floor(idx / pageSize));
  }

  const toggleSort = (id: string) => {
    setSort((s) => (s?.id === id ? (s.dir === "asc" ? { id, dir: "desc" } : null) : { id, dir: "asc" }));
  };

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv);
    downloadCSV(
      exportName ?? "export",
      cols.map((c) => c.header),
      sorted.map((r) => cols.map((c) => c.csv!(r))),
    );
  };

  const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {searchText ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              className="pl-8"
              aria-label={searchPlaceholder}
            />
          </div>
        ) : null}
        <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        {exportName ? (
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!sorted.length}>
            <Download /> Export CSV
          </Button>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          title={rows.length ? "Aucun résultat pour ces critères" : emptyTitle}
          description={rows.length ? "Modifiez la recherche ou les filtres." : emptyDescription}
          action={rows.length ? undefined : emptyAction}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                {columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={cn(
                      "px-3 py-2.5 font-medium whitespace-nowrap",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideBelow && hide[c.hideBelow],
                      c.className,
                    )}
                    aria-sort={sort?.id === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn("inline-flex items-center gap-1 uppercase hover:text-fg cursor-pointer", c.align === "right" && "flex-row-reverse")}
                      >
                        {c.header}
                        {sort?.id === c.id ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const href = rowHref?.(row) ?? null;
                const clickable = Boolean(href || onRowClick);
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,a,input,select,label,[role=menuitem]")) return;
                      if (href) router.push(href);
                      else onRowClick?.(row);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.target !== e.currentTarget) return;
                      if (href) router.push(href);
                      else onRowClick?.(row);
                    }}
                    tabIndex={clickable ? 0 : undefined}
                    className={cn(
                      "border-b border-border/60 last:border-0 transition-colors",
                      clickable && "cursor-pointer hover:bg-interactive/60 focus-visible:bg-interactive/60",
                      highlightId === row.id && "bg-accent/10",
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={cn("px-3 py-2.5 align-middle", c.align === "right" && "text-right tabular", c.align === "center" && "text-center", c.hideBelow && hide[c.hideBelow], c.className)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length > pageSize ? (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} sur {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Page précédente">
              <ChevronLeft />
            </Button>
            <span className="tabular">
              {current + 1} / {pages}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Page suivante">
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
