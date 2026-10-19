"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, Info } from "lucide-react";
import type { Alert } from "@/lib/calculations/alerts";
import { ALERT_KIND_LABELS } from "@/lib/calculations/alerts";
import { entityHref } from "@/lib/domain/routes";
import { useData } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";

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
