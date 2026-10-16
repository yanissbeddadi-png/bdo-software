"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  FolderPlus,
  Handshake,
  ListPlus,
  Menu,
  NotebookPen,
  Plus,
  ReceiptText,
  Search,
  Target,
  UserPlus,
  Wallet,
  Settings,
  Trophy,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { useUiStore } from "@/lib/store/ui-store";
import { useCommand, useData, useLookups, useToday } from "@/lib/store/hooks";
import { segmentLabel } from "./nav";
import { formatDateLong, formatRelative, initials } from "@/lib/formatters";
import { entityHref } from "@/lib/domain/routes";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/domain/commands";
import { cn } from "@/lib/utils";
import { PERIOD_PRESET_LABELS, type PeriodPreset } from "@/lib/calculations/dates";
import { NativeSelect } from "@/components/ui/input";

function Breadcrumb() {
  const pathname = usePathname();
  const { clients, projects, invoices } = useLookups();
  const data = useData();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [{ href: "/", label: "BDO Software" }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    const label =
      segmentLabel(p) ??
      clients.get(p)?.name ??
      projects.get(p)?.code ??
      invoices.get(p)?.number ??
      data.quotes.find((q) => q.id === p)?.number ??
      data.creditNotes.find((c) => c.id === p)?.number ??
      "Détail";
    crumbs.push({ href: acc, label });
  }
  if (!parts.length) crumbs.push({ href: "/", label: "Vue d'ensemble" });
  return (
    <nav aria-label="Fil d'Ariane" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
      {crumbs.map((c, i) => (
        <React.Fragment key={`${c.href}-${i}`}>
          {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-subtle" /> : null}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-fg" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="truncate text-muted hover:text-fg">
              {c.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function QuickCreateMenu({ label = "Créer" }: { label?: string }) {
  const openCreate = useUiStore((s) => s.openCreate);
  const items = [
    { kind: "client", label: "Client", icon: Building2 },
    { kind: "lead", label: "Prospect", icon: UserPlus },
    { kind: "opportunity", label: "Opportunité commerciale", icon: Handshake },
    { kind: "project", label: "Projet", icon: FolderPlus },
    { kind: "task", label: "Tâche", icon: ListPlus },
    { kind: "invoice", label: "Facture", icon: ReceiptText },
    { kind: "expense", label: "Dépense", icon: Wallet },
    { kind: "quote", label: "Devis", icon: FileText },
    { kind: "note", label: "Note", icon: NotebookPen },
    { kind: "goal", label: "Objectif", icon: Target },
  ] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" size="sm" aria-label="Créer un élément">
          <Plus /> <span className="hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Création rapide</DropdownMenuLabel>
        {items.map((i) => (
          <DropdownMenuItem key={i.kind} onSelect={() => openCreate(i.kind)}>
            <i.icon /> {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const data = useData();
  const run = useCommand();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const list = [...data.notifications].sort((a, b) => b.at.localeCompare(a.at));
  const unread = list.filter((n) => !n.read);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread.length} non lues)`} className="relative">
          <Bell />
          {unread.length ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger animate-pulse-ring" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length ? (
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => run(markAllNotificationsRead, {}, { silent: true })}>
              Tout marquer comme lu
            </button>
          ) : null}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {list.slice(0, 8).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn("flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-interactive/60", !n.read && "bg-accent/5")}
                onClick={() => {
                  if (!n.read) run(markNotificationRead, { id: n.id, read: true }, { silent: true });
                  const href = entityHref(n.ref, data);
                  setOpen(false);
                  if (href) router.push(href);
                }}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.severity === "danger" ? "bg-danger" : n.severity === "warning" ? "bg-warning" : n.severity === "success" ? "bg-success" : "bg-action",
                    n.read && "opacity-30",
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-fg">{n.title}</span>
                  <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>
                  <span className="mt-0.5 block text-[11px] text-subtle">{formatRelative(n.at)}</span>
                </span>
              </button>
            </li>
          ))}
          {!list.length ? <li className="px-4 py-8 text-center text-sm text-muted">Aucune notification.</li> : null}
        </ul>
        <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-xs text-accent hover:underline">
          Ouvrir le centre de notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Sélecteur de période des vues analytiques (Command Center, Finances, Analyses). */
export function PeriodSelect({ className }: { className?: string }) {
  const period = useUiStore((s) => s.period);
  const setPeriod = useUiStore((s) => s.setPeriod);
  return (
    <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value as PeriodPreset)} aria-label="Période analysée" className={cn("h-8 w-auto text-xs", className)}>
      {(Object.keys(PERIOD_PRESET_LABELS) as PeriodPreset[]).map((p) => (
        <option key={p} value={p}>
          {PERIOD_PRESET_LABELS[p]}
        </option>
      ))}
    </NativeSelect>
  );
}

const PERIOD_ROUTES = ["/", "/finances", "/analyses"];

export function Topbar() {
  const setMobile = useUiStore((s) => s.setMobileNavOpen);
  const setSearch = useUiStore((s) => s.setSearchOpen);
  const pathname = usePathname();
  const today = useToday();
  const data = useData();
  const showPeriod = PERIOD_ROUTES.includes(pathname);
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur md:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Ouvrir le menu">
        <Menu />
      </Button>
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <button
          type="button"
          onClick={() => setSearch(true)}
          className="flex h-8 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-2.5 text-xs text-subtle hover:text-fg md:w-56 cursor-pointer"
          aria-label="Recherche globale (Ctrl+K)"
        >
          <Search className="size-4" />
          <span className="hidden md:inline">Rechercher…</span>
          <kbd className="ml-auto hidden rounded border border-border px-1 text-[10px] md:inline">Ctrl K</kbd>
        </button>
        {showPeriod ? <PeriodSelect className="hidden sm:flex" /> : null}
        <span className="hidden items-center gap-1.5 text-xs capitalize text-muted xl:flex" title={data.settings.preferences.referenceDate ? "Date de référence simulée (paramètres)" : "Date du jour"}>
          <CalendarDays className="size-3.5" />
          {formatDateLong(today)}
          {data.settings.preferences.referenceDate ? <span className="text-gold">(simulée)</span> : null}
        </span>
        <QuickCreateMenu />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-accent/40 to-violet/40 text-xs font-semibold text-fg ring-1 ring-border cursor-pointer"
              aria-label="Menu du profil"
            >
              {initials(data.settings.user.name)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{data.settings.user.name}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/progression">
                <Trophy /> Progression
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/parametres?tab=roles">
                <UserCog /> Rôle de démonstration
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/parametres">
                <Settings /> Paramètres
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
