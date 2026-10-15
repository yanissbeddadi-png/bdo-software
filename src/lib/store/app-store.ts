"use client";
import { create } from "zustand";
import type { AppData, ISODate, ISODateTime } from "@/lib/domain/types";
import { realTodayISO } from "@/lib/calculations/dates";
import { createSeedData, SEED_VERSION } from "@/lib/database/seed";
import { LocalDemoRepository, type DataRepository } from "@/lib/database/repository";
import { execute, finalize, type ExecuteResult } from "@/lib/domain/runtime";
import type { Command, CommandContext } from "@/lib/domain/commands/core";

const repository: DataRepository = new LocalDemoRepository();

export function clock(data: AppData | null): { today: ISODate; now: ISODateTime } {
  const ref = data?.settings.preferences.referenceDate ?? null;
  const real = new Date().toISOString();
  if (!ref) return { today: realTodayISO(data?.settings.company.timezone), now: real };
  return { today: ref, now: `${ref}${real.slice(10)}` };
}

interface AppStore {
  data: AppData | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  /** Horodatage de la dernière mise à jour des données. */
  updatedAt: ISODateTime | null;
  init: () => void;
  run: <I, R>(command: Command<I, R>, input: I) => ExecuteResult<R>;
  replaceAll: (data: AppData) => void;
  resetDemo: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: null,
  status: "loading",
  error: null,
  updatedAt: null,

  init: () => {
    if (get().status === "ready") return;
    try {
      let data = repository.load();
      if (!data || data.settings.demo.version !== SEED_VERSION) {
        const { today, now } = clock(null);
        data = createSeedData(today, now);
      } else {
        // Actualisation quotidienne (missions, alertes) — idempotente.
        data = finalize(data, clock(data)).data;
      }
      repository.save(data);
      set({ data, status: "ready", error: null, updatedAt: clock(data).now });
    } catch (error) {
      console.error(error);
      set({ status: "error", error: "Impossible de charger les données de démonstration." });
    }
  },

  run: (command, input) => {
    const data = get().data;
    if (!data) return { ok: false, error: "Données non chargées.", fieldErrors: {} };
    const { today, now } = clock(data);
    const ctx: CommandContext = { today, now, user: data.settings.user };
    const res = execute(data, command, input, ctx);
    if (res.ok) {
      repository.save(res.data);
      set({ data: res.data, updatedAt: now });
    }
    return res;
  },

  replaceAll: (incoming) => {
    const reconciled = finalize(incoming, clock(incoming)).data;
    repository.save(reconciled);
    set({ data: reconciled, status: "ready", updatedAt: clock(reconciled).now });
  },

  resetDemo: () => {
    repository.clear();
    const { today, now } = clock(null);
    const data = createSeedData(today, now);
    repository.save(data);
    set({ data, status: "ready", updatedAt: now });
  },
}));

export const repositoryKind = repository.kind;
