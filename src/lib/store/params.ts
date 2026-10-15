"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";

/** Paramètres d'URL de navigation interne (`focus`, `tab`, `view`, `status`). */
export function useParam(name: string): string | null {
  return useSearchParams().get(name);
}

/**
 * État local initialisé depuis une source externe (paramètre d'URL…) et
 * resynchronisé lorsque la source change — motif React « ajuster l'état
 * pendant le rendu », sans effet.
 */
export function useSyncedState<T>(source: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState(source);
  const [prev, setPrev] = React.useState(source);
  if (!Object.is(source, prev)) {
    setPrev(source);
    setState(source);
  }
  return [state, setState];
}
