"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, Lock, Pause, Play, FastForward, Users } from "lucide-react";
import { useData, useSummaries, useToday } from "@/lib/store/hooks";
import { useProgression } from "@/lib/store/progression";
import { computeAlerts } from "@/lib/calculations/alerts";
import {
  ACTIVITY_LABELS,
  DIRECTOR_ID,
  directorPresence,
  activityFeed,
  daySchedule,
  formatMinute,
  localDateMinute,
  officePresence,
  WORKDAY,
  zoneStates,
  type EmployeePresence,
  type ZoneKpi,
  type ZoneState,
} from "@/lib/calculations/office";
import { entityHref } from "@/lib/domain/routes";
import { DEPARTMENT } from "@/lib/formatters/labels";
import { formatDateLong, formatEUR, formatNumber, initials } from "@/lib/formatters";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACTIVITY_COLORS, type OfficeSelection } from "./office-scene";

const OfficeScene = dynamic(() => import("./office-scene").then((m) => m.OfficeScene), {
  ssr: false,
  loading: () => <SceneMessage text="Chargement de la vue 3D…" />,
});

type Speed = "live" | "fast" | "pause";

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Horloge des bureaux : temps réel (fuseau de l'entreprise), accélérée ×60 ou figée. */
function useOfficeClock(timeZone: string) {
  const realMinute = React.useCallback(() => localDateMinute(new Date().toISOString(), timeZone).minute, [timeZone]);
  const [speed, setSpeed] = React.useState<Speed>("live");
  const [minute, setMinute] = React.useState(realMinute);
  React.useEffect(() => {
    if (speed === "pause") return;
    const id = window.setInterval(() => setMinute((m) => (speed === "live" ? realMinute() : (m + 1) % 1440)), speed === "live" ? 5_000 : 1_000);
    return () => window.clearInterval(id);
  }, [speed, realMinute]);
  const changeSpeed = (s: Speed) => {
    if (s === "live") setMinute(realMinute());
    setSpeed(s);
  };
  return { minute, setMinute, speed, setSpeed: changeSpeed };
}

export function OfficePage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const { rank } = useProgression();
  const clock = useOfficeClock(data.settings.company.timezone);
  const [selection, setSelection] = React.useState<OfficeSelection>(null);
  const [webgl] = React.useState(supportsWebGL);

  const schedule = React.useMemo(() => daySchedule(data, today), [data, today]);
  const presence = React.useMemo(() => officePresence(data, today, clock.minute, schedule), [data, today, clock.minute, schedule]);
  const alerts = React.useMemo(() => computeAlerts(data, today, summaries), [data, today, summaries]);
  const zones = React.useMemo(() => zoneStates(data, today, summaries, alerts, rank.rank, presence), [data, today, summaries, alerts, rank.rank, presence]);
  const feed = activityFeed(data, schedule, clock.minute, 8);

  const selectedZone = selection?.type === "zone" ? zones.find((z) => z.zone.id === selection.id) : undefined;
  const selectedPerson = selection?.type === "employee" ? presence.find((p) => p.employee.id === selection.id) : undefined;
  const onSite = presence.filter((p) => p.location !== "away");
  const directionCount = presence.filter((p) => p.zone === "direction").length;
  const scenePresence = React.useMemo(() => [...presence, directorPresence(data, clock.minute, directionCount)], [presence, data, clock.minute, directionCount]);
  const select = (s: OfficeSelection) => setSelection(s?.type === "employee" && s.id === DIRECTOR_ID ? { type: "zone", id: "direction" } : s);
  const open = clock.minute >= WORKDAY.start && clock.minute < WORKDAY.end;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bureaux"
        description="Les locaux de BDO Software en 3D. Chaque zone reflète les indicateurs et les alertes de son service ; la présence des collaborateurs est simulée à partir de leurs tâches, de leurs rendez-vous et des pauses de la journée. Glissez pour tourner, molette pour zoomer."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-2.5 py-1.5 text-xs tabular text-fg" aria-live="polite">
              <Clock className="size-3.5 text-muted" /> {formatDateLong(today)} · {formatMinute(clock.minute)}
            </span>
            <Segmented
              label="Vitesse de la simulation"
              value={clock.speed}
              onChange={clock.setSpeed}
              options={[
                { value: "live", label: "Direct", icon: <Play className="size-3.5" /> },
                { value: "fast", label: "×60", icon: <FastForward className="size-3.5" /> },
                { value: "pause", label: "Pause", icon: <Pause className="size-3.5" /> },
              ]}
            />
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="relative h-[380px] sm:h-[520px]" data-testid="office-canvas">
            {webgl ? (
              <OfficeScene zones={zones} presence={scenePresence} selection={selection} onSelect={select} />
            ) : (
              <SceneMessage text="La 3D (WebGL) n'est pas disponible sur cet appareil : utilisez les listes ci-dessous." />
            )}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 text-[11px] text-slate-200">
              {(
                [
                  ["working", "Au travail"],
                  ["meeting", "Réunion / appel"],
                  ["coffee", "Pause"],
                  ["available", "Disponible"],
                ] as const
              ).map(([k, l]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5">
                  <span className="size-2 rounded-full" style={{ background: ACTIVITY_COLORS[k] }} /> {l}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5">
                <span className="size-2 rounded-full bg-red-500" /> Surcharge / alerte
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
            <label htmlFor="office-time" className="text-xs text-muted">
              Heure simulée
            </label>
            <input
              id="office-time"
              type="range"
              min={7 * 60}
              max={20 * 60}
              step={5}
              value={Math.min(Math.max(clock.minute, 7 * 60), 20 * 60)}
              onChange={(e) => {
                clock.setSpeed("pause");
                clock.setMinute(Number(e.target.value));
              }}
              className="min-w-40 flex-1 accent-[var(--accent)]"
            />
            <span className="text-xs tabular text-muted">{open ? `${onSite.length} présent(s) sur ${presence.length}` : "Bureaux fermés"}</span>
          </div>
        </Card>

        <Card>
          <CardContent className="pt-5">
            {selectedZone ? (
              <ZonePanel state={selectedZone} rank={rank.rank} presence={presence} onSelect={setSelection} />
            ) : selectedPerson ? (
              <PersonPanel p={selectedPerson} schedule={schedule.filter((e) => e.employeeId === selectedPerson.employee.id)} threshold={data.settings.rules.workloadHoursThreshold} />
            ) : (
              <Overview presence={presence} zones={zones} open={open} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Zones</CardTitle>
              <CardDescription>Débloquées selon le rang de l&apos;entreprise (rang actuel : {rank.rank})</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {zones.map((z) => (
                <li key={z.zone.id}>
                  <button
                    type="button"
                    onClick={() => setSelection({ type: "zone", id: z.zone.id })}
                    aria-pressed={selection?.type === "zone" && selection.id === z.zone.id}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-elevated",
                      selection?.type === "zone" && selection.id === z.zone.id && "bg-bg-elevated",
                    )}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: z.unlocked ? z.zone.color : "#64748b" }} />
                    <span className="flex-1 text-fg">{z.zone.label}</span>
                    {!z.unlocked ? <Lock className="size-3.5 text-subtle" aria-label={`Verrouillée jusqu'au rang ${z.zone.minRank}`} /> : null}
                    {z.unlocked && z.occupants ? <span className="text-xs tabular text-muted">{z.occupants} 👤</span> : null}
                    {z.unlocked && z.alerts.length ? <Badge tone="danger">{z.alerts.length}</Badge> : null}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Collaborateurs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {presence.map((p) => (
                <li key={p.employee.id}>
                  <button
                    type="button"
                    onClick={() => setSelection({ type: "employee", id: p.employee.id })}
                    aria-pressed={selection?.type === "employee" && selection.id === p.employee.id}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-elevated",
                      selection?.type === "employee" && selection.id === p.employee.id && "bg-bg-elevated",
                    )}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.overloaded && p.activity === "working" ? "#ef4444" : ACTIVITY_COLORS[p.activity] }} />
                    <span className="w-20 shrink-0 text-fg">{p.employee.firstName}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {ACTIVITY_LABELS[p.activity]} · {p.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fil d&apos;activité</CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length ? (
              <ol className="space-y-1.5 text-xs">
                {feed.map((f, i) => (
                  <li key={`${f.minute}-${i}`} className="flex gap-2">
                    <span className="w-10 shrink-0 tabular text-subtle">{formatMinute(f.minute)}</span>
                    <span className="text-muted">{f.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted">La journée n&apos;a pas encore commencé.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-[11px] text-subtle">
        Simulation : la présence est déduite des données (tâches, activités commerciales, pauses types) et non d&apos;un suivi réel des personnes. Le direct multi-utilisateurs nécessitera le mode
        Supabase.
      </p>
    </div>
  );
}

function SceneMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center bg-[#0b1120] p-6 text-center text-sm text-slate-300">{text}</div>;
}

function formatKpi(k: ZoneKpi) {
  if (k.unit === "eur") return formatEUR(k.value, { round: true });
  if (k.unit === "hours") return `${formatNumber(k.value, 1)} h`;
  return formatNumber(k.value);
}

function Overview({ presence, zones, open }: { presence: EmployeePresence[]; zones: ZoneState[]; open: boolean }) {
  const count = (f: (p: EmployeePresence) => boolean) => presence.filter(f).length;
  const totalAlerts = zones.filter((z) => z.unlocked).reduce((s, z) => s + z.alerts.length, 0);
  const rows: [string, number][] = [
    ["Présents", count((p) => p.location !== "away")],
    ["Au travail", count((p) => p.activity === "working")],
    ["En réunion ou en appel", count((p) => p.activity === "meeting" || p.activity === "call")],
    ["En pause", count((p) => p.activity === "lunch" || p.activity === "coffee")],
    ["En surcharge", count((p) => p.overloaded)],
    ["Alertes dans les zones", totalAlerts],
  ];
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium text-fg">
        <Users className="size-4 text-accent" /> {open ? "Les bureaux sont ouverts" : "Les bureaux sont fermés"}
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-subtle">Cliquez sur une zone ou un collaborateur, dans la vue 3D ou dans les listes, pour afficher le détail.</p>
    </div>
  );
}

function ZonePanel({ state, rank, presence, onSelect }: { state: ZoneState; rank: number; presence: EmployeePresence[]; onSelect: (s: OfficeSelection) => void }) {
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

function PersonPanel({ p, schedule, threshold }: { p: EmployeePresence; schedule: { start: number; end: number; label: string; activity: string }[]; threshold: number }) {
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
