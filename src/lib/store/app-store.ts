"use client";
import { create } from "zustand";
import { toast } from "sonner";
import type { AppData, CurrentUser, ISODateTime } from "@/lib/domain/types";
import { clock } from "./clock";
import { createSeedData, SEED_VERSION } from "@/lib/database/seed";
import { clearWorkspace, demoInWorkspace } from "@/lib/database/empty";
import { applyCrmVocabulary } from "@/lib/crm/vocabulary";
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
import { loginPath, SESSION_EXPIRED } from "@/lib/cloud/navigation";

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
  /**
   * Une action a échoué sans que le serveur renvoie son état : l'affichage peut contenir une
   * modification non enregistrée, jusqu'à la resynchronisation complète suivante.
   */
  unsaved: boolean;
  init: () => void;
  run: <I, R>(command: Command<I, R>, input: I) => ExecuteResult<R>;
  replaceAll: (data: AppData) => void;
  /** Recharge le jeu de démonstration, ou vide l'espace en gardant réglages et équipe. */
  resetWorkspace: (kind: "demo" | "empty") => void;
  refresh: () => Promise<void>;
}

/** File d'envoi : les actions sont enregistrées dans l'ordre où elles ont été faites. */
let queue: Promise<void> = Promise.resolve();
let poller: ReturnType<typeof setInterval> | null = null;
/** Départ volontaire (session expirée) : pas d'avertissement de fermeture. */
let leaving = false;

/** Session expirée : retour à la connexion, puis à la page en cours. */
function signInAgain() {
  if (leaving) return;
  leaving = true;
  hardNavigate(loginPath(window.location.pathname + window.location.search));
}

/** Avertit avant de quitter la page tant que des actions sont en cours d'enregistrement. */
function warnBeforeUnload(hasPending: () => boolean) {
  window.addEventListener("beforeunload", (event) => {
    if (leaving || !hasPending()) return;
    event.preventDefault();
    // Navigateurs plus anciens : une valeur non vide déclenche la confirmation.
    event.returnValue = "";
  });
}

export const useAppStore = create<AppStore>((set, get) => {
  /** Remplace l'état local par celui du serveur, sauf si d'autres actions sont encore en route. */
  const adopt = (data: AppData, version: number) => {
    if (get().pending > 0) {
      set({ version });
      return;
    }
    set({ data, version, updatedAt: clock(data).now, unsaved: false });
  };

  /** Erreur d'une Server Action : session expirée → reconnexion, sinon message. */
  const fail = (message: string) => {
    if (message === SESSION_EXPIRED) signInAgain();
    else toast.error(message);
  };

  const initCloud = async () => {
    try {
      const s = await loadSession();
      if (s.status === "signed-out") {
        signInAgain();
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
      warnBeforeUnload(() => get().pending > 0);
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
    unsaved: false,


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
          else if (remote.error === SESSION_EXPIRED) {
            set({ unsaved: true });
            signInAgain();
          } else {
            toast.error(`Action non enregistrée : ${remote.error}`);
            if (remote.data && remote.version) adopt(remote.data, remote.version);
            else {
              // Sans état renvoyé, la modification optimiste reste affichée : resynchronisation
              // complète (indépendante de la version connue) pour l'annuler.
              set({ unsaved: true });
              await get().refresh();
            }
          }
        } catch (error) {
          console.error(error);
          set((s) => ({ pending: s.pending - 1, unsaved: true }));
          toast.error("Connexion au serveur perdue : la dernière action n'a pas été enregistrée.");
          await get().refresh();
        }
      });
      return res;
    },

    refresh: async () => {
      if (get().mode !== "cloud" || get().pending > 0 || leaving) return;
      try {
        // Après un échec non annulé, la version connue ne suffit pas : l'état complet est relu.
        const r = await pullRemote(get().unsaved ? -1 : get().version);
        if ("changed" in r && r.changed) adopt(r.data, r.version);
        else if ("error" in r) {
          if (r.error === SESSION_EXPIRED) signInAgain();
          // Un seul message à la fois pour une même erreur, malgré les relectures périodiques.
          else toast.error(r.error, { id: "pull-error" });
        }
      } catch {
        /* Réseau indisponible : nouvel essai au prochain intervalle. */
      }
    },

    replaceAll: (incoming) => {
      if (get().mode === "cloud") {
        void replaceRemote(incoming)
          .then((r) => (r.ok ? (adopt(r.data, r.version), toast.success(r.message)) : fail(r.error)))
          .catch((error) => {
            console.error(error);
            toast.error("Connexion au serveur perdue : les données n'ont pas été remplacées.");
          });
        return;
      }
      const migrated = migrateData(incoming, clock(incoming).today);
      const reconciled = finalize(migrated, clock(migrated)).data;
      repository.save(reconciled);
      set({ data: reconciled, status: "ready", updatedAt: clock(reconciled).now });
    },

    resetWorkspace: (kind) => {
      if (get().mode === "cloud") {
        const done = kind === "demo" ? "Données de démonstration chargées pour toute l'équipe." : "Espace vidé : réglages et équipe conservés.";
        void resetRemote(kind)
          .then((r) => (r.ok ? (adopt(r.data, r.version), toast.success(done)) : fail(r.error)))
          .catch((error) => {
            console.error(error);
            toast.error("Connexion au serveur perdue : l'espace n'a pas été modifié.");
          });
        return;
      }
      const current = get().data;
      repository.clear();
      const { today, now } = clock(null);
      const seed = () => createSeedData(today, now);
      const data = kind === "empty" && current ? clearWorkspace(current, today) : current ? demoInWorkspace(seed(), current) : seed();
      repository.save(data);
      set({ data, status: "ready", updatedAt: now });
    },
  };
});

// Libellés des étapes et sources de l'espace, appliqués avant le rendu suivant.
useAppStore.subscribe((s) => applyCrmVocabulary(s.data?.settings.crm));

export const repositoryKind = isCloudMode ? "supabase" : repository.kind;
