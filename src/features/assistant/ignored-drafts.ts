"use client";
import * as React from "react";
import type { ISODate } from "@/lib/domain/types";
import { useData } from "@/lib/store/hooks";

/**
 * Brouillons « ignorés pour aujourd'hui » : préférence locale au navigateur, par utilisateur
 * et par jour (rien n'est enregistré dans les données partagées). Le stockage peut être
 * indisponible (navigation privée, quota) : on se contente alors de l'état en mémoire.
 */

const PREFIX = "bdo.assistant.ignored";

export function ignoredStorageKey(userId: string, today: ISODate): string {
  return `${PREFIX}:${userId}:${today}`;
}

export function parseIgnored(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}

function read(key: string): string[] {
  try {
    return parseIgnored(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function write(key: string, userId: string, keys: string[]) {
  try {
    const storage = window.localStorage;
    // Les listes des jours précédents ne servent plus : on les retire.
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k && k.startsWith(`${PREFIX}:${userId}:`) && k !== key) storage.removeItem(k);
    }
    storage.setItem(key, JSON.stringify(keys));
  } catch {
    // Stockage indisponible : la préférence ne dure que le temps de la page.
  }
}

export function useIgnoredDrafts(today: ISODate): { ignored: Set<string>; ignore: (draftKey: string) => void } {
  const user = useData().settings.user;
  const userId = user.id || user.email || "local";
  const key = ignoredStorageKey(userId, today);
  const [state, setState] = React.useState<{ key: string; keys: string[] }>(() => ({ key, keys: typeof window === "undefined" ? [] : read(key) }));
  // Changement de jour ou d'utilisateur : relecture de la liste correspondante.
  if (state.key !== key) setState({ key, keys: read(key) });
  const ignore = React.useCallback(
    (draftKey: string) =>
      setState((s) => {
        const keys = s.keys.includes(draftKey) ? s.keys : [...s.keys, draftKey];
        write(s.key, userId, keys);
        return { key: s.key, keys };
      }),
    [userId],
  );
  const ignored = React.useMemo(() => new Set(state.keys), [state.keys]);
  return { ignored, ignore };
}
