"use client";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { useData } from "@/lib/store/hooks";
import { ROLE } from "@/lib/formatters/labels";

/** Rappel permanent et discret : données fictives, stockage local, pas de sécurité de production. */
export function DemoBanner() {
  const data = useData();
  return (
    <div className="no-print flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gold/20 bg-gold/5 px-4 py-1.5 text-[11px] text-gold/90 md:px-6">
      <FlaskConical className="size-3.5" />
      <span>Mode démonstration : données fictives stockées dans ce navigateur, sans authentification ni sécurité de production.</span>
      <span className="text-gold/70">Rôle simulé : {ROLE[data.settings.user.role]}.</span>
      <Link href="/parametres?tab=donnees" className="underline-offset-2 hover:underline">
        En savoir plus
      </Link>
    </div>
  );
}
