"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Lock } from "lucide-react";
import { useData } from "@/lib/store/hooks";
import { ACTIVITY_LABELS, formatMinute, type EmployeePresence, type ZoneKpi, type ZoneState } from "@/lib/calculations/office";
import { entityHref } from "@/lib/domain/routes";
import { DEPARTMENT } from "@/lib/formatters/labels";
import { formatEUR, formatNumber, initials } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfficeTarget } from "./office-world";

/** Fiches détaillées affichées au clic sur la carte (zone, collaborateur ou poste). */

export function formatKpi(k: ZoneKpi) {
  if (k.unit === "eur") return formatEUR(k.value, { round: true });
  if (k.unit === "hours") return `${formatNumber(k.value, 1)} h`;
  return formatNumber(k.value);
}

export function ZonePanel({ state, rank, presence, onSelect }: { state: ZoneState; rank: number; presence: EmployeePresence[]; onSelect: (s: OfficeTarget) => void }) {
  const data = useData();
  const { zone, unlocked } = state;
  const members = presence.filter((p) => p.zone === zone.id);
  return (
    <div className="space-y-4" data-testid="zone-panel">
      <div>
        <p className="flex items-center gap-2 text-base font-semibold text-fg">
          <span className="size-3 rounded-full" style={{ background: zone.color }} /> {zone.label}
        </p>
        <p className="text-xs text-muted">{unlocked ? `${state.occupants} personne(s) dans la zone` : `Zone verrouillée — débloquée au rang ${zone.minRank} (rang actuel : ${rank}).`}</p>
      </div>
      {!unlocked ? (
        <Button variant="secondary" asChild>
          <Link href="/progression">
            <Lock /> Voir la progression
          </Link>
        </Button>
      ) : (
        <>
          {state.kpis.length ? (
            <dl className="grid grid-cols-2 gap-2">
              {state.kpis.map((k) => (
                <div key={k.label} className="rounded-lg border border-border bg-bg-elevated p-2.5">
                  <dt className="text-[11px] text-muted">{k.label}</dt>
                  <dd className={cn("text-sm font-semibold tabular", k.tone === "danger" && k.value > 0 ? "text-danger" : "text-fg")}>{formatKpi(k)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {state.alerts.length ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg">Alertes ({state.alerts.length})</p>
              <ul className="space-y-1.5">
                {state.alerts.slice(0, 5).map((a) => {
                  const href = entityHref(a.ref, data);
                  return (
                    <li key={a.key} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", a.severity === "danger" ? "text-danger" : "text-warning")} />
                      {href ? (
                        <Link href={href} className="text-muted hover:text-fg hover:underline">
                          {a.title}
                        </Link>
                      ) : (
                        <span className="text-muted">{a.title}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {members.length ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg">Équipe</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <button
                    key={m.employee.id}
                    type="button"
                    onClick={() => onSelect({ type: "employee", id: m.employee.id })}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:text-fg"
                  >
                    {m.employee.firstName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {zone.href ? (
            <Button variant="primary" asChild className="w-full">
              <Link href={zone.href}>
                Ouvrir le module <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function PersonPanel({ p, schedule, threshold }: { p: EmployeePresence; schedule: { start: number; end: number; label: string; activity: string }[]; threshold: number }) {
  const e = p.employee;
  return (
    <div className="space-y-4" data-testid="person-panel">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">{initials(`${e.firstName} ${e.lastName}`)}</span>
        <div>
          <p className="text-base font-semibold text-fg">
            {e.firstName} {e.lastName}
          </p>
          <p className="text-xs text-muted">
            {e.jobTitle} · {DEPARTMENT[e.department]}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={p.activity === "working" ? "success" : p.activity === "meeting" || p.activity === "call" ? "info" : p.activity === "lunch" || p.activity === "coffee" ? "warning" : "neutral"}>
          {ACTIVITY_LABELS[p.activity]}
        </Badge>
        {p.overloaded ? <Badge tone="danger">Surcharge</Badge> : null}
      </div>
      <p className="text-sm text-fg">{p.detail}</p>
      {p.currentTask ? (
        <Link href={`/taches?focus=${p.currentTask.id}`} className="block rounded-lg border border-border bg-bg-elevated p-2.5 text-xs hover:border-accent">
          <span className="text-muted">Tâche prioritaire</span>
          <span className="block text-fg">{p.currentTask.title}</span>
        </Link>
      ) : null}
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Ouvertes", p.openTasks, false],
            ["En retard", p.lateTasks, p.lateTasks > 0],
            ["Charge 14 j", `${formatNumber(p.remainingHours, 0)} h`, p.overloaded],
          ] as const
        ).map(([k, v, bad]) => (
          <div key={k} className="rounded-lg border border-border bg-bg-elevated p-2">
            <dt className="text-[10px] text-muted">{k}</dt>
            <dd className={cn("text-sm font-semibold tabular", bad ? "text-danger" : "text-fg")}>{v}</dd>
          </div>
        ))}
      </dl>
      {p.overloaded ? <p className="text-xs text-danger">Charge supérieure au seuil de {threshold} h sur 14 jours : envisagez de réaffecter des tâches.</p> : null}
      <div>
        <p className="mb-1.5 text-xs font-medium text-fg">Agenda du jour</p>
        <ul className="space-y-1 text-xs">
          {schedule.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-24 shrink-0 tabular text-subtle">
                {formatMinute(s.start)}–{formatMinute(s.end)}
              </span>
              <span className="text-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <Button variant="secondary" asChild className="w-full">
        <Link href={`/equipe?focus=${e.id}`}>
          Fiche collaborateur <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
