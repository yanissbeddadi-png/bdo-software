"use client";
import * as React from "react";
import { HQ_BUILDINGS } from "@/lib/gamification/rewards";
import { cn } from "@/lib/utils";

/**
 * Siège virtuel : un quartier SVG dont les bâtiments apparaissent avec le rang de
 * l'entreprise. Visualisation décorative — elle ne remplace aucune donnée de gestion.
 */
const LAYOUT = [
  { x: 40, w: 70, h: 50, windows: 2 },
  { x: 125, w: 80, h: 90, windows: 4 },
  { x: 220, w: 70, h: 120, windows: 6 },
  { x: 305, w: 60, h: 175, windows: 9 },
  { x: 380, w: 95, h: 80, windows: 3 },
  { x: 490, w: 110, h: 140, windows: 8 },
  { x: 615, w: 75, h: 210, windows: 11 },
];

export function Headquarters({ rank }: { rank: number }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const ground = 250;
  return (
    <div className="relative">
      <svg viewBox="0 0 730 280" role="img" aria-label={`Siège virtuel : ${Math.min(rank, 7)} bâtiment(s) débloqué(s) sur 7`} className="w-full">
        <defs>
          <linearGradient id="hq-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="730" height={ground} fill="url(#hq-sky)" rx="12" />
        <rect x="0" y={ground} width="730" height="30" fill="var(--interactive)" />
        <line x1="0" y1={ground} x2="730" y2={ground} stroke="var(--border-strong)" />
        {LAYOUT.map((b, i) => {
          const unlocked = i < rank;
          const def = HQ_BUILDINGS[i]!;
          const y = ground - b.h;
          return (
            <g
              key={def.id}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              role="img"
              aria-label={`${def.name} — ${unlocked ? "débloqué" : `rang ${i + 1} requis`}`}
              className={cn("cursor-default outline-none transition-opacity", unlocked ? "opacity-100" : "opacity-60")}
            >
              <rect x={b.x} y={y} width={b.w} height={b.h} rx="4" fill={unlocked ? "var(--card)" : "transparent"} stroke={unlocked ? (hover === i ? "var(--gold)" : "var(--border-strong)") : "var(--subtle)"} strokeDasharray={unlocked ? undefined : "4 4"} strokeWidth={hover === i ? 2 : 1} />
              {unlocked
                ? Array.from({ length: b.windows }).map((_, k) => {
                    const cols = Math.max(1, Math.floor(b.w / 22));
                    const cx = b.x + 8 + (k % cols) * ((b.w - 16) / cols);
                    const cy = y + 10 + Math.floor(k / cols) * 18;
                    if (cy > ground - 18) return null;
                    return <rect key={k} x={cx} y={cy} width={(b.w - 16) / cols - 6} height="9" rx="1.5" fill={(k + i) % 3 === 0 ? "var(--gold)" : "var(--accent)"} opacity={(k + i) % 3 === 0 ? 0.8 : 0.35} />;
                  })
                : <g transform={`translate(${b.x + b.w / 2 - 7} ${ground - b.h / 2 - 9})`} fill="none" stroke="var(--subtle)" strokeWidth="1.6">
                    <rect x="0" y="7" width="14" height="11" rx="2" />
                    <path d="M3 7V4.5a4 4 0 0 1 8 0V7" />
                  </g>}
              {unlocked ? <rect x={b.x + b.w / 2 - 8} y={ground - 16} width="16" height="16" fill="var(--interactive-hover)" /> : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 min-h-10 text-center text-xs" aria-live="polite">
        {hover !== null ? (
          <p>
            <span className="font-medium text-fg">{HQ_BUILDINGS[hover]!.name}</span> <span className="text-muted">— {HQ_BUILDINGS[hover]!.description} {hover < rank ? "(débloqué)" : `(rang ${hover + 1} requis)`}</span>
          </p>
        ) : (
          <p className="text-subtle">Survolez un bâtiment. Chaque rang d&apos;entreprise débloque un nouveau bâtiment.</p>
        )}
      </div>
    </div>
  );
}
