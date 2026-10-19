"use client";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { useData } from "@/lib/store/hooks";
import { useAppStore } from "@/lib/store/app-store";
import { ROLE } from "@/lib/formatters/labels";

/** Rappel permanent et discret : nature des données et mode de stockage. */
export function DemoBanner() {
  const data = useData();
  const mode = useAppStore((s) => s.mode);
  const user = data.settings.user;
  return (
    <div className="no-print flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gold/20 bg-gold/5 px-4 py-1.5 text-[11px] text-gold/90 md:px-6">
      <FlaskConical className="size-3.5" />
      {mode === "cloud" ? (
        <>
          <span>Version de test : données fictives partagées par toute l&apos;équipe.</span>
          <span className="text-gold/70">
            Connecté : {user.name} ({ROLE[user.role]}).
          </span>
          <Link href="/parametres?tab=roles" className="underline-offset-2 hover:underline">
            Mon compte
          </Link>
        </>
      ) : (
        <>
          <span>Mode démonstration : données fictives stockées dans ce navigateur, sans authentification ni sécurité de production.</span>
          <span className="text-gold/70">Rôle simulé : {ROLE[user.role]}.</span>
          <Link href="/parametres?tab=donnees" className="underline-offset-2 hover:underline">
            En savoir plus
          </Link>
        </>
      )}
    </div>
  );
}
