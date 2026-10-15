"use client";
import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CircleAlert,
  CircleDot,
  FilePlus2,
  FileText,
  FolderPlus,
  Handshake,
  Info,
  ListChecks,
  ReceiptText,
  Sparkles,
  Swords,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ActivityEvent, ActivityEventType } from "@/lib/domain/types";
import type { Alert } from "@/lib/calculations/alerts";
import { ALERT_KIND_LABELS } from "@/lib/calculations/alerts";
import { entityHref } from "@/lib/domain/routes";
import { useData } from "@/lib/store/hooks";
import { useUiStore } from "@/lib/store/ui-store";
import { formatRelative } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";

const ACTIVITY_ICONS: Partial<Record<ActivityEventType, LucideIcon>> = {
  invoice_created: FileText,
  invoice_issued: ReceiptText,
  invoice_cancelled: ReceiptText,
  payment_recorded: Banknote,
  client_created: Building2,
  opportunity_won: Handshake,
  opportunity_created: Handshake,
  opportunity_stage: Handshake,
  opportunity_lost: Handshake,
  project_completed: BadgeCheck,
  task_completed: ListChecks,
  mission_completed: Swords,
  achievement_unlocked: Trophy,
  level_up: Sparkles,
  rank_up: Trophy,
  expense_created: Wallet,
};

const ACTIVITY_TONE: Partial<Record<ActivityEventType, string>> = {
  payment_recorded: "text-success bg-success/10",
  opportunity_won: "text-success bg-success/10",
  project_completed: "text-success bg-success/10",
  achievement_unlocked: "text-gold bg-gold/10",
  level_up: "text-gold bg-gold/10",
  rank_up: "text-gold bg-gold/10",
  mission_completed: "text-violet bg-violet/10",
  opportunity_lost: "text-danger bg-danger/10",
  invoice_cancelled: "text-muted bg-interactive",
};

export function ActivityFeed({ events, limit = 10 }: { events: ActivityEvent[]; limit?: number }) {
  const data = useData();
  const list = [...events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  if (!list.length) return <EmptyState title="Aucune activité récente" />;
  return (
    <ol className="relative space-y-3 before:absolute before:inset-y-1 before:left-[13px] before:w-px before:bg-border">
      {list.map((e) => {
        const Icon = ACTIVITY_ICONS[e.type] ?? CircleDot;
        const href = entityHref(e.ref, data);
        const body = (
          <>
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-card", ACTIVITY_TONE[e.type] ?? "bg-interactive text-muted")}>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-fg">{e.description}</span>
              <span className="block text-[11px] text-subtle">
                <time dateTime={e.at}>{formatRelative(e.at)}</time>
              </span>
            </span>
          </>
        );
        return (
          <li key={e.id}>
            {href ? (
              <Link href={href} className="flex gap-3 rounded-lg hover:bg-interactive/40">
                {body}
              </Link>
            ) : (
              <div className="flex gap-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function AlertCard({ alert }: { alert: Alert }) {
  const data = useData();
  const href = entityHref(alert.ref, data) ?? (alert.kind === "cash_low" || alert.kind === "cash_forecast" ? "/finances/tresorerie" : "/operations");
  const Icon = alert.severity === "danger" ? CircleAlert : alert.severity === "warning" ? AlertTriangle : Info;
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-interactive/50",
        alert.severity === "danger" ? "border-danger/35 bg-danger/5" : alert.severity === "warning" ? "border-warning/30 bg-warning/5" : "border-border bg-bg-elevated",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", alert.severity === "danger" ? "text-danger" : alert.severity === "warning" ? "text-warning" : "text-action")}
        aria-label={alert.severity === "danger" ? "Critique" : alert.severity === "warning" ? "Attention" : "Information"}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-fg">{alert.title}</span>
        <span className="block truncate text-xs text-muted">{alert.body}</span>
      </span>
      <span className="hidden shrink-0 text-[10px] uppercase tracking-wide text-subtle sm:block">{ALERT_KIND_LABELS[alert.kind]}</span>
      <ArrowRight className="mt-0.5 size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export function QuickActions() {
  const openCreate = useUiStore((s) => s.openCreate);
  const actions: { label: string; icon: LucideIcon; onClick?: () => void; href?: string }[] = [
    { label: "Créer une facture", icon: FilePlus2, onClick: () => openCreate("invoice") },
    { label: "Ajouter un client", icon: Building2, onClick: () => openCreate("client") },
    { label: "Créer un projet", icon: FolderPlus, onClick: () => openCreate("project") },
    { label: "Enregistrer une dépense", icon: Wallet, onClick: () => openCreate("expense") },
    { label: "Créer une mission", icon: Swords, onClick: () => openCreate("mission") },
    { label: "Consulter la trésorerie", icon: Banknote, href: "/finances/tresorerie" },
    { label: "Voir les alertes", icon: AlertTriangle, href: "/operations?tab=risques" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {actions.map((a) => {
        const cls =
          "flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left text-xs font-medium text-fg transition-colors hover:border-border-strong hover:bg-interactive/60 cursor-pointer";
        const inner = (
          <>
            <a.icon className="size-4 text-accent" />
            {a.label}
          </>
        );
        return a.href ? (
          <Link key={a.label} href={a.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={a.label} type="button" onClick={a.onClick} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
