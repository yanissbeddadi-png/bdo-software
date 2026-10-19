"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, endOfMonthISO, startOfMonthISO } from "@/lib/calculations/dates";
import { formatMonth } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  tone?: "accent" | "success" | "warning" | "danger" | "violet" | "gold" | "neutral";
  href?: string;
  onClick?: () => void;
}

const TONES = {
  accent: "border-l-accent bg-accent/10",
  success: "border-l-success bg-success/10",
  warning: "border-l-warning bg-warning/10",
  danger: "border-l-danger bg-danger/10",
  violet: "border-l-violet bg-violet/10",
  gold: "border-l-gold bg-gold/10",
  neutral: "border-l-border-strong bg-interactive",
};

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

/** Calendrier mensuel ; chaque événement renvoie vers son entité d'origine. */
export function MonthCalendar({ events, today, legend }: { events: CalendarEvent[]; today: string; legend?: React.ReactNode }) {
  const [month, setMonth] = React.useState(startOfMonthISO(today));
  const first = new Date(`${month}T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const gridStart = addDays(month, -offset);
  const end = endOfMonthISO(month);
  const days: string[] = [];
  for (let d = gridStart; d <= end || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = e.date.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">
          <ChevronLeft />
        </Button>
        <p className="min-w-36 text-center text-sm font-medium capitalize">{formatMonth(month.slice(0, 7), false)}</p>
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant">
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonthISO(today))}>
          Aujourd&apos;hui
        </Button>
        <div className="ml-auto flex flex-wrap gap-3 text-[11px] text-muted">{legend}</div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="grid min-w-[720px] grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div key={d} className="border-b border-border px-2 py-1.5 text-[11px] uppercase tracking-wide text-subtle">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            return (
              <div key={d} className={cn("min-h-28 border-b border-r border-border/60 p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-bg-elevated/50")}>
                <p
                  className={cn(
                    "mb-1 text-[11px] tabular",
                    d === today ? "inline-grid size-5 place-items-center rounded-full bg-accent font-semibold text-on-accent" : inMonth ? "text-muted" : "text-subtle/60",
                  )}
                >
                  {Number(d.slice(8))}
                </p>
                <ul className="space-y-1">
                  {list.slice(0, 4).map((e) => {
                    const cls = cn("block truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] text-fg", TONES[e.tone ?? "accent"]);
                    return (
                      <li key={e.id} title={e.title}>
                        {e.href ? (
                          <Link href={e.href} className={cn(cls, "hover:brightness-125")}>
                            {e.title}
                          </Link>
                        ) : (
                          <button type="button" onClick={e.onClick} className={cn(cls, "w-full text-left hover:brightness-125")}>
                            {e.title}
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {list.length > 4 ? <li className="px-1 text-[10px] text-subtle">+{list.length - 4} autre(s)</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LegendDot({ tone, label }: { tone: keyof typeof TONES; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-1 rounded-sm border-l-2", TONES[tone])} />
      {label}
    </span>
  );
}
