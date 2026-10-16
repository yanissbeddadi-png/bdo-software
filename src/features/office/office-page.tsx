"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { Crosshair, FastForward, List, Pause, Play, Sparkles, X } from "lucide-react";
import { useData, useSummaries, useToday } from "@/lib/store/hooks";
import { useProgression } from "@/lib/store/progression";
import { computeAlerts } from "@/lib/calculations/alerts";
import {
  ACTIVITY_LABELS,
  activityFeed,
  daySchedule,
  DIRECTOR_ID,
  directorPresence,
  formatMinute,
  localDateMinute,
  officePresence,
  WORKDAY,
  zoneById,
  zoneStates,
  type EmployeePresence,
  type ZoneState,
} from "@/lib/calculations/office";
import { formatDateLong } from "@/lib/formatters";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RING } from "./office-character";
import { formatKpi, PersonPanel, ZonePanel } from "./office-panels";
import type { OfficeTarget } from "./office-world";
import type { Quality } from "./office-scene";

const OfficeScene = dynamic(() => import("./office-scene").then((m) => m.OfficeScene), {
  ssr: false,
  loading: () => <SceneMessage text="Construction des bureaux…" />,
});

type Speed = "live" | "fast" | "pause";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function defaultQuality(): Quality {
  try {
    const saved = window.localStorage.getItem("bdo-office-quality");
    if (saved === "high" || saved === "low") return saved;
  } catch {
    // stockage indisponible : valeur par défaut
  }
  return window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high";
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

const glass = "rounded-xl border border-white/15 bg-slate-950/70 text-slate-100 shadow-2xl backdrop-blur-md";

export function OfficePage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const { rank } = useProgression();
  const clock = useOfficeClock(data.settings.company.timezone);
  const [hovered, setHovered] = React.useState<OfficeTarget>(null);
  const [selected, setSelected] = React.useState<OfficeTarget>(null);
  const [quality, setQualityState] = React.useState<Quality>(defaultQuality);
  const [homeTick, setHomeTick] = React.useState(0);
  const [listOpen, setListOpen] = React.useState(false);
  const [webgl] = React.useState(supportsWebGL);
  const prefersReduced = React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const reducedMotion = prefersReduced || data.settings.gamification.animations === false;
  const wrapper = React.useRef<HTMLDivElement>(null);
  const tip = React.useRef<HTMLDivElement>(null);

  const schedule = React.useMemo(() => daySchedule(data, today), [data, today]);
  const presence = React.useMemo(() => officePresence(data, today, clock.minute, schedule), [data, today, clock.minute, schedule]);
  const alerts = React.useMemo(() => computeAlerts(data, today, summaries), [data, today, summaries]);
  const zones = React.useMemo(() => zoneStates(data, today, summaries, alerts, rank.rank, presence), [data, today, summaries, alerts, rank.rank, presence]);
  const directionCount = presence.filter((p) => p.zone === "direction").length;
  const director = React.useMemo(() => directorPresence(data, clock.minute, directionCount), [data, clock.minute, directionCount]);
  const scenePresence = React.useMemo(() => [...presence, director], [presence, director]);
  const feed = activityFeed(data, schedule, clock.minute, 4);
  const open = clock.minute >= WORKDAY.start && clock.minute < WORKDAY.end;

  const setQuality = (q: Quality) => {
    setQualityState(q);
    try {
      window.localStorage.setItem("bdo-office-quality", q);
    } catch {
      // préférence non mémorisée
    }
  };
  // L'avatar du dirigeant renvoie vers la zone Direction.
  const select = React.useCallback((t: OfficeTarget) => setSelected(t && (t.type === "employee" || t.type === "desk") && t.id === DIRECTOR_ID ? { type: "zone", id: "direction" } : t), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const moveTip = (e: React.PointerEvent) => {
    const el = tip.current;
    const box = wrapper.current?.getBoundingClientRect();
    if (!el || !box) return;
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const left = x + 18 + el.offsetWidth > box.width ? x - el.offsetWidth - 14 : x + 18;
    const top = y + 18 + el.offsetHeight > box.height ? y - el.offsetHeight - 14 : y + 18;
    el.style.transform = `translate(${left}px, ${top}px)`;
  };

  // Un personnage qui quitte les bureaux ne déclenche pas de « pointerout » : on ignore son survol.
  const hover: OfficeTarget = hovered?.type === "employee" && !scenePresence.some((p) => p.employee.id === hovered.id && p.location !== "away") ? null : hovered;
  const tooltip = hover && !(selected && hover.type === selected.type && hover.id === selected.id) ? describe(hover, zones, scenePresence) : null;
  const card = selected ? renderCard(selected, zones, scenePresence, rank.rank, schedule, data.settings.rules.workloadHoursThreshold, select) : null;

  return (
    <div ref={wrapper} className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#0b1533]" onPointerMove={moveTip} data-testid="office-canvas">
      {webgl ? (
        <OfficeScene
          zones={zones}
          presence={scenePresence}
          minute={clock.minute}
          quality={quality}
          hovered={hover}
          selected={selected}
          onHover={setHovered}
          onSelect={select}
          homeTick={homeTick}
          onDecline={() => setQualityState("low")}
          paused={listOpen}
          reducedMotion={reducedMotion}
        />
      ) : (
        <SceneMessage text="La 3D (WebGL) n'est pas disponible sur cet appareil : ouvrez la liste pour consulter les zones et les collaborateurs." />
      )}

      {/* HUD : titre, horloge, vitesse */}
      <div className={cn(glass, "absolute left-3 top-3 w-[min(330px,calc(100%-1.5rem))] p-3")}>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-base font-black tracking-tight">Bureaux</h1>
          <span className="text-xs tabular text-slate-300" aria-live="polite">
            <span className="hidden sm:inline">{formatDateLong(today)} · </span>
            <span className="font-bold text-white">{formatMinute(clock.minute)}</span>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1" role="group" aria-label="Vitesse de la simulation">
          {(
            [
              ["live", "Direct", Play],
              ["fast", "×60", FastForward],
              ["pause", "Pause", Pause],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              aria-pressed={clock.speed === k}
              onClick={() => clock.setSpeed(k)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition",
                clock.speed === k ? "bg-white text-slate-900" : "bg-white/10 hover:bg-white/20",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="office-time" className="text-[11px] text-slate-300">
            Heure
          </label>
          <input
            id="office-time"
            type="range"
            min={6 * 60}
            max={21 * 60}
            step={5}
            value={Math.min(Math.max(clock.minute, 6 * 60), 21 * 60)}
            onChange={(e) => {
              clock.setSpeed("pause");
              clock.setMinute(Number(e.target.value));
            }}
            aria-label="Heure simulée"
            className="flex-1 accent-yellow-400"
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-300">
          {open ? `${presence.filter((p) => p.location !== "away").length} présent(s) sur ${presence.length}` : "Bureaux fermés"} · rang {rank.rank}
        </p>
      </div>

      {/* Boutons */}
      <div className={cn("absolute bottom-3 right-3 z-10 flex gap-1.5 sm:bottom-auto sm:top-3", card && "max-sm:hidden")}>
        <HudButton label="Recentrer la vue" onClick={() => setHomeTick((t) => t + 1)}>
          <Crosshair className="size-4" />
        </HudButton>
        <HudButton label={quality === "high" ? "Qualité : haute (cliquer pour basse)" : "Qualité : basse (cliquer pour haute)"} onClick={() => setQuality(quality === "high" ? "low" : "high")}>
          <Sparkles className={cn("size-4", quality === "high" && "text-yellow-300")} />
        </HudButton>
        <HudButton label="Liste des zones et collaborateurs" onClick={() => setListOpen(true)}>
          <List className="size-4" />
        </HudButton>
      </div>

      {/* Infobulle au survol */}
      <div ref={tip} className={cn("pointer-events-none absolute left-0 top-0 z-20 max-w-[260px] transition-opacity duration-100", tooltip ? "opacity-100" : "opacity-0")} aria-hidden>
        {tooltip ? (
          <div className={cn(glass, "px-3 py-2")}>
            <p className="flex items-center gap-1.5 text-sm font-black">
              <span className="size-2.5 rounded-full" style={{ background: tooltip.color }} />
              {tooltip.title}
            </p>
            {tooltip.lines.map((l, i) => (
              <p key={i} className="mt-0.5 text-[11px] leading-snug text-slate-300">
                {l}
              </p>
            ))}
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-yellow-300">Cliquer pour le détail</p>
          </div>
        ) : null}
      </div>

      {/* Fiche au clic */}
      {card ? (
        <div
          className="absolute inset-x-2 bottom-2 z-30 max-h-[58%] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-16 sm:max-h-[calc(100%-5rem)] sm:w-[350px]"
          role="dialog"
          aria-label="Détail"
        >
          <button type="button" onClick={() => setSelected(null)} aria-label="Fermer" className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-bg-elevated hover:text-fg">
            <X className="size-4" />
          </button>
          {card}
        </div>
      ) : null}

      {/* Fil d'activité façon « chat » */}
      <div className="pointer-events-none absolute bottom-3 left-3 hidden max-w-[360px] space-y-1 sm:block">
        {[...feed].reverse().map((f, i) => (
          <p key={`${f.minute}-${i}`} className="w-fit rounded-md bg-black/45 px-2 py-0.5 text-[11px] text-white" style={{ textShadow: "0 1px 1px #000" }}>
            <span className="font-bold text-yellow-300">[{formatMinute(f.minute)}]</span> {f.text}
          </p>
        ))}
      </div>

      {/* Légende */}
      <div className={cn(glass, "pointer-events-none absolute bottom-3 right-3 hidden gap-2 px-2.5 py-1.5 text-[10px] font-semibold md:flex", card && "md:hidden")}>
        {(
          [
            ["working", "Travail"],
            ["meeting", "Réunion / appel"],
            ["coffee", "Pause"],
            ["available", "Disponible"],
          ] as const
        ).map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: RING[k] }} /> {l}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" /> Surcharge
        </span>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent title="Zones et collaborateurs" side="right" className="w-[320px] overflow-y-auto p-4">
          <ListContent
            zones={zones}
            presence={presence}
            onPick={(t) => {
              select(t);
              setListOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cn(glass, "grid size-9 place-items-center transition hover:bg-slate-800/90")}>
      {children}
    </button>
  );
}

function SceneMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center bg-[#0b1533] p-6 text-center text-sm text-slate-300">{text}</div>;
}

function ListContent({ zones, presence, onPick }: { zones: ZoneState[]; presence: EmployeePresence[]; onPick: (t: OfficeTarget) => void }) {
  return (
    <div className="space-y-5" data-testid="office-list">
      <section>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Zones</h2>
        <ul className="space-y-0.5">
          {zones.map((z) => (
            <li key={z.zone.id}>
              <button type="button" onClick={() => onPick({ type: "zone", id: z.zone.id })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-elevated">
                <span className="size-2.5 rounded-full" style={{ background: z.unlocked ? z.zone.color : "#64748b" }} />
                <span className="flex-1 text-fg">{z.zone.label}</span>
                {!z.unlocked ? <span className="text-[11px] text-subtle">rang {z.zone.minRank}</span> : null}
                {z.unlocked && z.alerts.length ? <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{z.alerts.length}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Collaborateurs</h2>
        <ul className="space-y-0.5">
          {presence.map((p) => (
            <li key={p.employee.id}>
              <button
                type="button"
                onClick={() => onPick({ type: "employee", id: p.employee.id })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-elevated"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.overloaded && p.activity === "working" ? "#ef4444" : RING[p.activity] }} />
                <span className="w-20 shrink-0 text-fg">{p.employee.firstName}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{ACTIVITY_LABELS[p.activity]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Contenu de l'infobulle au survol. */
function describe(t: NonNullable<OfficeTarget>, zones: ZoneState[], presence: EmployeePresence[]): { title: string; lines: string[]; color: string } | null {
  if (t.type === "zone") {
    const z = zones.find((x) => x.zone.id === t.id);
    if (!z) return null;
    if (!z.unlocked) return { title: z.zone.label, lines: [`🔒 Débloquée au rang ${z.zone.minRank} de l'entreprise`], color: "#64748b" };
    const lines = z.kpis.slice(0, 3).map((k) => `${k.label} : ${formatKpi(k)}`);
    if (z.alerts.length) lines.push(`⚠️ ${z.alerts.length} alerte(s)`);
    if (z.occupants) lines.push(`👤 ${z.occupants} personne(s) ici`);
    return { title: z.zone.label, lines, color: z.zone.color };
  }
  const p = presence.find((x) => x.employee.id === t.id);
  if (!p) {
    const [zoneId] = t.id.split(":");
    return { title: "Poste libre", lines: [zoneId ? zoneById(zoneId as never).label : ""], color: "#94a3b8" };
  }
  if (p.employee.id === DIRECTOR_ID) return { title: "Vous", lines: [p.employee.jobTitle, "Pilotage de l'entreprise"], color: "#fbbf24" };
  const color = p.overloaded && p.activity === "working" ? "#ef4444" : RING[p.activity];
  if (t.type === "desk")
    return {
      title: `Poste de ${p.employee.firstName}`,
      lines: [
        p.currentTask ? `💻 ${p.currentTask.title}` : "Aucune tâche ouverte",
        `${p.openTasks} tâche(s) ouverte(s) · ${p.lateTasks} en retard`,
        `Actuellement : ${ACTIVITY_LABELS[p.activity].toLowerCase()}`,
      ],
      color,
    };
  return {
    title: `${p.employee.firstName} ${p.employee.lastName}`,
    lines: [p.employee.jobTitle, `${ACTIVITY_LABELS[p.activity]} · ${p.detail}`, ...(p.overloaded ? ["🔥 En surcharge"] : [])],
    color,
  };
}

function renderCard(
  t: NonNullable<OfficeTarget>,
  zones: ZoneState[],
  presence: EmployeePresence[],
  rank: number,
  schedule: ReturnType<typeof daySchedule>,
  threshold: number,
  onSelect: (t: OfficeTarget) => void,
) {
  if (t.type === "zone") {
    const z = zones.find((x) => x.zone.id === t.id);
    return z ? <ZonePanel state={z} rank={rank} presence={presence.filter((p) => p.employee.id !== DIRECTOR_ID)} onSelect={onSelect} /> : null;
  }
  const p = presence.find((x) => x.employee.id === t.id);
  if (!p) {
    const [zoneId] = t.id.split(":");
    return (
      <div className="space-y-2 pr-6">
        <p className="text-base font-semibold text-fg">Poste libre</p>
        <p className="text-sm text-muted">Un bureau disponible dans la zone {zoneId ? zoneById(zoneId as never).label : ""}. Recrutez un collaborateur depuis la page Équipe pour l&apos;occuper.</p>
      </div>
    );
  }
  return <PersonPanel p={p} schedule={schedule.filter((e) => e.employeeId === p.employee.id)} threshold={threshold} />;
}
