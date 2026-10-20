"use client";
import { create } from "zustand";
import { toast } from "sonner";
import type { AppData, CurrentUser, ISODateTime } from "@/lib/domain/types";
import { clock } from "./clock";
import { createSeedData, SEED_VERSION } from "@/lib/database/seed";
import { LocalDemoRepository, type DataRepository } from "@/lib/database/repository";
import { canMigrate, migrateData } from "@/lib/database/migrations";
import { execute, finalize, type ExecuteResult } from "@/lib/domain/runtime";
import type { Command, CommandContext } from "@/lib/domain/commands/core";
import { commandName } from "@/lib/domain/commands/registry";
import { newIdSeed, withIdSeed } from "@/lib/domain/ids";
import { isCloudMode } from "@/lib/cloud/config";
import { scopeViolation } from "@/lib/cloud/scope";
import { loadSession, pullRemote, replaceRemote, resetRemote, runRemote } from "@/lib/cloud/actions";
import { hardNavigate } from "@/lib/cloud/session";

const repository: DataRepository = new LocalDemoRepository();

export { clock };

/** Intervalle de récupération des modifications des autres utilisateurs (mode partagé). */
const PULL_INTERVAL_MS = 20_000;

interface AppStore {
  data: AppData | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  /** Horodatage de la dernière mise à jour des données. */
  updatedAt: ISODateTime | null;
  /** `demo` : données dans le navigateur ; `cloud` : comptes et données partagées (Supabase). */
  mode: "demo" | "cloud";
  /** Version du document partagé connue du navigateur (mode `cloud`). */
  version: number;
  /** Actions en cours d'enregistrement sur le serveur. */
  pending: number;
  init: () => void;
  run: <I, R>(command: Command<I, R>, input: I) => ExecuteResult<R>;
  replaceAll: (data: AppData) => void;
  resetDemo: () => void;
  refresh: () => Promise<void>;
}

/** File d'envoi : les actions sont enregistrées dans l'ordre où elles ont été faites. */
let queue: Promise<void> = Promise.resolve();
let poller: ReturnType<typeof setInterval> | null = null;

export const useAppStore = create<AppStore>((set, get) => {
  /** Remplace l'état local par celui du serveur, sauf si d'autres actions sont encore en route. */
  const adopt = (data: AppData, version: number) => {
    if (get().pending > 0) {
      set({ version });
      return;
    }
    set({ data, version, updatedAt: clock(data).now });
  };

  const initCloud = async () => {
    try {
      const s = await loadSession();
      if (s.status === "signed-out") {
        hardNavigate("/connexion");
        return;
      }
      if (s.status === "error") {
        set({ status: "error", error: s.error });
        return;
      }
      set({ data: s.data, version: s.version, status: "ready", error: null, updatedAt: clock(s.data).now });
      poller ??= setInterval(() => {
        if (document.visibilityState === "visible") void get().refresh();
      }, PULL_INTERVAL_MS);
      window.addEventListener("focus", () => void get().refresh());
    } catch (error) {
      console.error(error);
      set({ status: "error", error: "Serveur injoignable : vérifiez votre connexion puis rechargez la page." });
    }
  };

  return {
    data: null,
    status: "loading",
    error: null,
    updatedAt: null,
    mode: isCloudMode ? "cloud" : "demo",
    version: 0,
    pending: 0,

    init: () => {
      if (get().status === "ready") return;
      if (get().mode === "cloud") {
        void initCloud();
        return;
      }
      try {
        let data = repository.load();
        if (data && canMigrate(data)) data = migrateData(data, clock(data).today);
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
      const ctx: CommandContext = { today, now, user: data.settings.user as CurrentUser };
      if (get().mode === "demo") {
        const res = execute(data, command, input, ctx);
        if (res.ok) {
          repository.save(res.data);
          set({ data: res.data, updatedAt: now });
        }
        return res;
      }
      // Mode partagé : résultat immédiat dans le navigateur, puis la même commande est
      // rejouée et enregistrée par le serveur (rôle vérifié côté serveur, mêmes identifiants).
      const name = commandName(command as Command<never, unknown>);
      if (!name) return { ok: false, error: "Action non disponible en mode partagé.", fieldErrors: {} };
      const seed = newIdSeed();
      const res = withIdSeed(seed, () => execute(data, command, input, ctx));
      if (!res.ok) return res;
      // Même contrôle que le serveur, pour un refus immédiat plutôt qu'une annulation différée.
      const violation = scopeViolation(data, res.data, ctx.user);
      if (violation) return { ok: false, error: violation, fieldErrors: {} };
      set((s) => ({ data: res.data, updatedAt: now, pending: s.pending + 1 }));
      queue = queue.then(async () => {
        try {
          const remote = await runRemote({ name, input, now, seed });
          set((s) => ({ pending: s.pending - 1 }));
          if (remote.ok) adopt(remote.data, remote.version);
          else {
            toast.error(`Action non enregistrée : ${remote.error}`);
            if (remote.data && remote.version) adopt(remote.data, remote.version);
            else await get().refresh();
          }
        } catch (error) {
          console.error(error);
          set((s) => ({ pending: s.pending - 1 }));
          toast.error("Connexion au serveur perdue : la dernière action n'a pas été enregistrée.");
          await get().refresh();
        }
      });
      return res;
    },

    refresh: async () => {
      if (get().mode !== "cloud" || get().pending > 0) return;
      try {
        const r = await pullRemote(get().version);
        if ("changed" in r && r.changed) adopt(r.data, r.version);
        else if ("error" in r) toast.error(r.error);
      } catch {
        /* Réseau indisponible : nouvel essai au prochain intervalle. */
      }
    },

    replaceAll: (incoming) => {
      if (get().mode === "cloud") {
        void replaceRemote(incoming).then((r) => (r.ok ? (adopt(r.data, r.version), toast.success(r.message)) : toast.error(r.error)));
        return;
      }
      const migrated = migrateData(incoming, clock(incoming).today);
      const reconciled = finalize(migrated, clock(migrated)).data;
      repository.save(reconciled);
      set({ data: reconciled, status: "ready", updatedAt: clock(reconciled).now });
    },

    resetDemo: () => {
      if (get().mode === "cloud") {
        void resetRemote().then((r) => (r.ok ? (adopt(r.data, r.version), toast.success("Données de démonstration réinitialisées pour toute l'équipe.")) : toast.error(r.error)));
        return;
      }
      repository.clear();
      const { today, now } = clock(null);
      const data = createSeedData(today, now);
      repository.save(data);
      set({ data, status: "ready", updatedAt: now });
    },
  };
});

export const repositoryKind = isCloudMode ? "supabase" : repository.kind;
