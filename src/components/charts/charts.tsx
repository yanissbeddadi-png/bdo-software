"use client";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR, formatMonth, formatNumber } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

/**
 * Palette catégorielle validée (fond sombre #151D28) : ordre fixe, jamais cyclé.
 * Validation : adjacent CVD ΔE ≥ 8,4, vision normale ≥ 19,3, contraste ≥ 3:1.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] as const;
export const OTHER_COLOR = "#64748b";

const AXIS = { stroke: "var(--subtle)", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = { stroke: "var(--border)", strokeDasharray: "0", vertical: false } as const;

export const euroTick = (v: number) => formatEUR(v, { compact: true });

export function ChartCard({ title, description, actions, children, className, height = 260 }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; height?: number }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-0.5">{description}</CardDescription> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="flex-1">
        <div style={{ height }} className="w-full">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({ active, payload, label, money = true, labelFormatter }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; money?: boolean; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs shadow-xl">
      {label !== undefined ? <p className="mb-1 font-medium capitalize text-fg">{labelFormatter ? labelFormatter(String(label)) : String(label)}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
            <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto pl-3 font-medium tabular text-fg">{money ? formatEUR(Number(p.value)) : formatNumber(Number(p.value), 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const legendStyle = { fontSize: 11, color: "var(--muted)", paddingTop: 8 };

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  /** Série prévisionnelle : rendu hachuré / pointillé. */
  forecast?: boolean;
}

/** Barres groupées par mois (montants en centimes). */
export function MonthlyBarChart({ data, series, money = true, stacked }: { data: object[]; series: SeriesDef[]; money?: boolean; stacked?: boolean }) {
  if (!data.length) return <EmptyState title="Aucune donnée sur la période" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid {...GRID} />
        <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m)} {...AXIS} />
        <YAxis tickFormatter={money ? euroTick : (v: number) => formatNumber(v)} width={64} {...AXIS} />
        <Tooltip cursor={{ fill: "var(--interactive)", opacity: 0.5 }} content={<ChartTooltip money={money} labelFormatter={(m) => formatMonth(m, false)} />} />
        {series.length > 1 ? <Legend wrapperStyle={legendStyle} iconType="square" iconSize={8} /> : null}
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={28} stroke="var(--card)" strokeWidth={stacked ? 1 : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyLineChart({ data, series, money = true, area }: { data: object[]; series: SeriesDef[]; money?: boolean; area?: boolean }) {
  const id = React.useId().replace(/:/g, "");
  if (!data.length) return <EmptyState title="Aucune donnée sur la période" />;
  if (area) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m)} {...AXIS} />
          <YAxis tickFormatter={money ? euroTick : (v: number) => formatNumber(v)} width={64} {...AXIS} />
          <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<ChartTooltip money={money} labelFormatter={(m) => formatMonth(m, false)} />} />
          {series.length > 1 ? <Legend wrapperStyle={legendStyle} iconType="plainline" iconSize={12} /> : null}
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.forecast ? "5 4" : undefined} fill={s.forecast ? "transparent" : `url(#${id}-${s.key})`} connectNulls dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m)} {...AXIS} />
        <YAxis tickFormatter={money ? euroTick : (v: number) => formatNumber(v)} width={64} allowDecimals={false} {...AXIS} />
        <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<ChartTooltip money={money} labelFormatter={(m) => formatMonth(m, false)} />} />
        {series.length > 1 ? <Legend wrapperStyle={legendStyle} iconType="plainline" iconSize={12} /> : null}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.forecast ? "5 4" : undefined} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Répartition (anneau) avec légende listée et valeurs. Au-delà de 7 parts, les plus
 * petites sont regroupées dans « Autres ».
 */
export function BreakdownDonut({ items, money = true }: { items: { key: string; label: string; value: number }[]; money?: boolean }) {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (!positive.length) return <EmptyState title="Aucune donnée sur la période" />;
  const top = positive.slice(0, 7);
  const rest = positive.slice(7).reduce((s, i) => s + i.value, 0);
  const slices = [...top.map((t, i) => ({ ...t, color: SERIES[i] })), ...(rest > 0 ? [{ key: "other", label: "Autres", value: rest, color: OTHER_COLOR }] : [])];
  const total = slices.reduce((s, i) => s + i.value, 0);
  return (
    <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-40 w-full sm:h-full sm:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip money={money} />} />
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="88%" paddingAngle={1.5} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="truncate text-muted">{s.label}</span>
            <span className="ml-auto pl-2 tabular text-fg">{money ? formatEUR(s.value, { round: true }) : formatNumber(s.value)}</span>
            <span className="w-10 text-right tabular text-subtle">{Math.round((s.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barres horizontales simples (classements, progression). */
export function HorizontalBars({ items, money = true, max, suffix = "", color = SERIES[0] }: { items: { key: string; label: string; value: number; hint?: string; color?: string }[]; money?: boolean; max?: number; suffix?: string; color?: string }) {
  if (!items.length) return <EmptyState title="Aucune donnée" />;
  const top = max ?? Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key} className="text-xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-muted">{i.label}</span>
            <span className="shrink-0 tabular text-fg">
              {money ? formatEUR(i.value, { round: true }) : `${formatNumber(i.value, 1)}${suffix}`}
              {i.hint ? <span className="ml-1.5 text-subtle">{i.hint}</span> : null}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-interactive">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, (Math.abs(i.value) / top) * 100))}%`, background: i.value < 0 ? "var(--danger)" : (i.color ?? color) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Revenus facturés vs encaissés par mois. */
export function RevenueChart({ data }: { data: { month: string; billed: number; collected: number }[] }) {
  return (
    <MonthlyBarChart
      data={data}
      series={[
        { key: "billed", label: "CA facturé HT", color: SERIES[0] },
        { key: "collected", label: "Encaissements TTC", color: SERIES[2] },
      ]}
    />
  );
}

/** Encaissements vs décaissements par mois. */
export function CashFlowChart({ data }: { data: { month: string; collected: number; disbursed: number }[] }) {
  return (
    <MonthlyBarChart
      data={data}
      series={[
        { key: "collected", label: "Encaissements", color: SERIES[0] },
        { key: "disbursed", label: "Décaissements", color: SERIES[1] },
      ]}
    />
  );
}
