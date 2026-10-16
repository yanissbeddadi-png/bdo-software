"use client";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { AppData } from "@/lib/domain/types";
import type { Command } from "@/lib/domain/commands/core";
import { summarizeData, type InvoiceSummary } from "@/lib/calculations/invoices";
import { clock, useAppStore } from "./app-store";
import { useUiStore } from "./ui-store";
import { presetPeriod, previousPeriod, PERIOD_PRESET_LABELS } from "@/lib/calculations/dates";
import { announceRewards } from "@/components/gamification/reward-toasts";

/** Données de l'application (le composant doit être rendu sous `<DataGate>`). */
export function useData(): AppData {
  const data = useAppStore((s) => s.data);
  if (!data) throw new Error("useData() appelé avant le chargement des données");
  return data;
}

export function useClock() {
  const data = useAppStore((s) => s.data);
  const ref = data?.settings.preferences.referenceDate;
  const tz = data?.settings.company.timezone;
  // Recalculé lorsque la date de référence change ; sinon stable pendant le rendu.
  return useMemo(() => clock(data), [ref, tz]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useToday() {
  return useClock().today;
}

const summaryCache = new WeakMap<AppData, Map<string, InvoiceSummary[]>>();

export function getSummaries(data: AppData, today: string): InvoiceSummary[] {
  let byDay = summaryCache.get(data);
  if (!byDay) {
    byDay = new Map();
    summaryCache.set(data, byDay);
  }
  let res = byDay.get(today);
  if (!res) {
    res = summarizeData(data, today);
    byDay.set(today, res);
  }
  return res;
}

export function useSummaries(): InvoiceSummary[] {
  const data = useData();
  const today = useToday();
  return getSummaries(data, today);
}

export function useLookups() {
  const data = useData();
  return useMemo(
    () => ({
      clients: new Map(data.clients.map((c) => [c.id, c])),
      employees: new Map(data.employees.map((e) => [e.id, e])),
      projects: new Map(data.projects.map((p) => [p.id, p])),
      products: new Map(data.products.map((p) => [p.id, p])),
      contacts: new Map(data.contacts.map((c) => [c.id, c])),
      leads: new Map(data.leads.map((l) => [l.id, l])),
      opportunities: new Map(data.opportunities.map((o) => [o.id, o])),
      invoices: new Map(data.invoices.map((i) => [i.id, i])),
      tasks: new Map(data.tasks.map((t) => [t.id, t])),
      goals: new Map(data.goals.map((g) => [g.id, g])),
    }),
    [data],
  );
}

export type RunResult<R> = { ok: true; result: R } | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * Exécute une commande métier et affiche le retour utilisateur (toast de succès ou
 * d'erreur, récompenses obtenues).
 */
export function useCommand() {
  const run = useAppStore((s) => s.run);
  return useCallback(
    <I, R>(command: Command<I, R>, input: I, opts: { silent?: boolean; successMessage?: string } = {}): RunResult<R> => {
      const res = run(command, input);
      if (!res.ok) {
        toast.error(res.error);
        return res;
      }
      if (!opts.silent) toast.success(opts.successMessage ?? res.message);
      announceRewards(res, res.data.settings.gamification);
      return { ok: true, result: res.result };
    },
    [run],
  );
}

/** Période analytique sélectionnée dans la barre supérieure. */
export function usePeriod() {
  const preset = useUiStore((s) => s.period);
  const today = useToday();
  return useMemo(() => {
    const period = presetPeriod(preset, today);
    return { preset, period, previous: previousPeriod(period), label: PERIOD_PRESET_LABELS[preset] };
  }, [preset, today]);
}
