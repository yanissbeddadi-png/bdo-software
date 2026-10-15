"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatEUR, formatPercent } from "@/lib/formatters";
import { percentChange } from "@/lib/calculations/money";

export interface Trend {
  current: number;
  previous: number;
  /** `up` : une hausse est favorable ; `down` : une baisse est favorable. */
  good?: "up" | "down" | "neutral";
}

export function TrendIndicator({ trend, money = true, label = "vs période précédente" }: { trend: Trend; money?: boolean; label?: string }) {
  const diff = trend.current - trend.previous;
  const pct = percentChange(trend.current, trend.previous);
  const good = trend.good ?? "up";
  const positive = diff > 0;
  const favorable = good === "neutral" ? null : diff === 0 ? null : good === "up" ? positive : !positive;
  const Icon = diff === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] tabular", favorable === null ? "text-muted" : favorable ? "text-success" : "text-danger")}>
      <Icon className="size-3.5" aria-hidden />
      <span>{money ? formatEUR(diff, { sign: true, round: Math.abs(diff) >= 100_000 }) : `${diff > 0 ? "+" : ""}${diff}`}</span>
      <span>({pct === null ? "n.c." : formatPercent(pct, 1, true)})</span>
      <span className="text-subtle">{label}</span>
    </div>
  );
}

export function Sparkline({ data, color = "var(--accent)" }: { data: number[]; color?: string }) {
  const id = React.useId().replace(/:/g, "");
  if (data.length < 2) return null;
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#g${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  footer,
  href,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  href?: string;
  tone?: "default" | "danger" | "success" | "gold";
  className?: string;
}) {
  const body = (
    <div className={cn("group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors animate-rise", href && "hover:border-border-strong hover:bg-[color-mix(in_srgb,var(--card)_85%,var(--interactive))]", tone === "danger" && "border-danger/30", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {icon ? <span className="text-subtle [&_svg]:size-3.5">{icon}</span> : null}
          {label}
        </span>
        {hint ? (
          <Tooltip content={hint}>
            <button type="button" className="rounded p-0.5 text-subtle hover:text-fg" aria-label={`Définition : ${label}`} onClick={(e) => e.preventDefault()}>
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
      </div>
      <div className={cn("text-2xl font-semibold tracking-tight tabular", tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "gold" ? "text-gold" : "text-fg")}>{value}</div>
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Carte d'indicateur financier : valeur, comparaison, variation, tendance et définition. */
export function FinancialMetricCard({
  label,
  value,
  previous,
  good = "up",
  series,
  definition,
  href,
  icon,
  money = true,
  formatValue,
  missing,
  comparisonLabel,
}: {
  label: string;
  value: number | null;
  previous?: number | null;
  good?: Trend["good"];
  series?: number[];
  definition: string;
  href?: string;
  icon?: React.ReactNode;
  money?: boolean;
  formatValue?: (v: number) => string;
  missing?: string;
  comparisonLabel?: string;
}) {
  const fmt = formatValue ?? ((v: number) => (money ? formatEUR(v) : String(v)));
  const negative = value !== null && value < 0 && money;
  return (
    <MetricCard
      label={label}
      icon={icon}
      hint={definition}
      href={href}
      tone={negative ? "danger" : "default"}
      value={value === null ? <span className="text-base font-normal text-muted">{missing ?? "Donnée indisponible"}</span> : fmt(value)}
      footer={
        <div className="space-y-1.5">
          {value !== null && previous !== null && previous !== undefined ? <TrendIndicator trend={{ current: value, previous, good }} money={money} label={comparisonLabel} /> : null}
          {series && series.length > 1 ? <Sparkline data={series} color={negative ? "var(--danger)" : good === "down" ? "var(--warning)" : "var(--accent)"} /> : null}
        </div>
      }
    />
  );
}
