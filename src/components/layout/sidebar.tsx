"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { NAV, isActive, type NavCounter } from "./nav";
import { useNavCounters } from "@/lib/store/crm";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store/ui-store";
import { useData } from "@/lib/store/hooks";
import { useProgression } from "@/lib/store/progression";
import { LevelBadge, XPProgressBar } from "@/components/gamification/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { ROLE } from "@/lib/formatters/labels";
import { BrandMark, BrandTagline, type Brand } from "./brand";

export function Logo({ collapsed }: { collapsed?: boolean }) {
  const data = useData();
  const brand: Brand = { ...data.settings.branding, name: data.settings.company.name };
  return (
    <Link href="/" className="flex items-center gap-3 rounded-lg px-1 py-1" aria-label={`${brand.name} — accueil`}>
      <BrandMark brand={brand} size={collapsed ? "sm" : "md"} />
      {!collapsed ? <BrandTagline brand={brand} /> : null}
    </Link>
  );
}

export function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const counters = useNavCounters();
  const gamification = useData().settings.gamification.enabled;
  const badge = (counter: NavCounter | undefined): { value: number; danger: boolean; label: string } | null => {
    if (counter === "newProspects" && counters.newProspects) return { value: counters.newProspects, danger: false, label: "nouveaux prospects" };
    if (counter === "missions" && counters.overdue) return { value: counters.overdue, danger: true, label: "missions en retard" };
    if (counter === "missions" && counters.missionsToday) return { value: counters.missionsToday, danger: false, label: "missions du jour" };
    if (counter === "meetings" && counters.upcomingMeetings) return { value: counters.upcomingMeetings, danger: false, label: "rendez-vous à venir" };
    return null;
  };
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
      {NAV.filter((item) => gamification || item.href !== "/progression").map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active && pathname === item.href ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active ? "bg-interactive text-fg" : "text-muted hover:bg-interactive/60 hover:text-fg",
              collapsed && "justify-center px-0",
            )}
          >
            {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden /> : null}
            <Icon className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-subtle group-hover:text-muted")} />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
            {(() => {
              const b = badge(item.counter);
              return b ? (
                <span
                  title={`${b.value} ${b.label}`}
                  aria-label={`${b.value} ${b.label}`}
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold tabular",
                    b.danger ? "bg-danger text-on-accent" : "bg-accent/20 text-accent",
                    collapsed ? "absolute right-1 top-1" : "ml-auto",
                  )}
                >
                  {b.value > 99 ? "99+" : b.value}
                </span>
              ) : null;
            })()}
          </Link>
        );
        return (
          <div key={item.href}>
            {collapsed ? (
              <Tooltip content={item.label} side="right">
                {link}
              </Tooltip>
            ) : (
              link
            )}
            {!collapsed && active && item.children ? (
              <div className="mb-1 ml-[30px] mt-0.5 flex flex-col border-l border-border pl-2">
                {item.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={onNavigate}
                    aria-current={pathname === c.href ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      pathname === c.href || (c.href !== item.href && pathname.startsWith(c.href)) ? "text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function ProfileCard({ collapsed }: { collapsed?: boolean }) {
  const data = useData();
  const p = useProgression();
  if (collapsed) {
    return (
      <Link href="/progression" className="flex justify-center" aria-label={`Niveau ${p.level.level} — voir la progression`}>
        <LevelBadge level={p.level.level} size="sm" frameColor={p.frameColor} />
      </Link>
    );
  }
  return (
    <Link href="/progression" className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-3">
        <LevelBadge level={p.level.level} size="sm" frameColor={p.frameColor} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{data.settings.user.name}</p>
          <p className="truncate text-[11px] text-muted">
            {p.title} · {ROLE[data.settings.user.role]}
          </p>
        </div>
      </div>
      {data.settings.gamification.enabled ? <XPProgressBar into={p.level.xpIntoLevel} needed={p.level.xpForNext} className="mt-3" /> : null}
    </Link>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside className={cn("no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-bg-elevated transition-[width] duration-200 lg:flex", collapsed ? "w-[72px]" : "w-64")}>
      <div className={cn("flex items-center gap-2 border-b border-border px-3 py-3", collapsed && "justify-center")}>
        <Logo collapsed={collapsed} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <NavLinks collapsed={collapsed} />
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <ProfileCard collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-subtle hover:bg-interactive hover:text-fg cursor-pointer", collapsed && "justify-center")}
          aria-label={collapsed ? "Déplier la navigation" : "Réduire la navigation"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed ? "Réduire" : null}
        </button>
      </div>
    </aside>
  );
}
