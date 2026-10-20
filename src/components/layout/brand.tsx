"use client";
import type * as React from "react";
import type { BrandingSettings } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Identité affichée : nom de l'entreprise et réglages d'identité visuelle de l'espace. */
export type Brand = Pick<BrandingSettings, "logo" | "color" | "bdoMark"> & { name: string };

/** Logotype « BDO » : lettres bleu BDO encadrées d'un filet rouge (gauche et dessous). */
export function BdoMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-end font-extrabold leading-none tracking-[-0.04em] text-bdo-blue", size === "sm" ? "pb-[3px] pl-[5px] text-lg" : "pb-1 pl-[7px] text-[28px]")}
    >
      BDO
      <span className={cn("absolute inset-y-0 left-0 bg-bdo-red", size === "sm" ? "w-[2px]" : "w-[3px]")} />
      <span className={cn("absolute inset-x-0 bottom-0 bg-bdo-red", size === "sm" ? "h-[2px]" : "h-[3px]")} />
    </span>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** Logo de l'espace : image téléversée, marque BDO, ou initiales sur la couleur principale. */
export function BrandMark({ brand, size = "md" }: { brand: Brand; size?: "sm" | "md" }) {
  if (brand.logo)
    // eslint-disable-next-line @next/next/no-img-element -- data URL locale, pas d'optimisation d'image possible
    return <img src={brand.logo} alt="" className={cn("shrink-0 object-contain", size === "sm" ? "h-7 max-w-[44px]" : "h-9 max-w-[120px]")} />;
  if (brand.bdoMark) return <BdoMark size={size} />;
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center rounded-md bg-bdo-red font-bold text-on-accent", size === "sm" ? "size-7 text-[11px]" : "size-9 text-sm")}>
      {initials(brand.name)}
    </span>
  );
}

/** Sous-titre à côté du logo. */
export function BrandTagline({ brand }: { brand: Brand }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-bdo-red">{brand.bdoMark && !brand.logo ? "Software & Services" : brand.name}</p>
      <p className="truncate text-[11px] text-muted">CRM · Command Center</p>
    </div>
  );
}

/** Texte lisible sur la couleur principale (blanc ou presque noir selon sa luminance). */
export function onColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.45 ? "#1a1a1a" : "#ffffff";
}

/** Variables CSS de la couleur principale de l'espace (et de la couleur d'action). */
export function brandStyle(color: string, accent = color): React.CSSProperties {
  return { "--bdo-red": color, "--accent": accent, "--on-accent": onColor(accent) } as React.CSSProperties;
}
