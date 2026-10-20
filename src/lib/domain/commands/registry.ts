import type { Command } from "./core";
import * as crm from "./crm";
import * as finance from "./finance";
import * as operations from "./operations";
import * as settings from "./settings";
import * as importing from "./import";

/** Fonctions exportées par les modules de commandes qui ne sont pas des commandes. */
const HELPERS = new Set(["buildMission", "isVatPeriodClosed"]);

type AnyCommand = Command<unknown, unknown>;

function collect(...modules: Record<string, unknown>[]): Record<string, AnyCommand> {
  const out: Record<string, AnyCommand> = {};
  for (const mod of modules) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function" && !HELPERS.has(name)) out[name] = value as AnyCommand;
    }
  }
  return out;
}

/**
 * Registre des commandes métier, adressées par leur nom (stable même après
 * minification). Utilisé pour rejouer côté serveur une commande lancée dans le navigateur.
 */
export const COMMANDS: Readonly<Record<string, AnyCommand>> = collect(crm, finance, operations, settings, importing);

const NAMES = new Map<AnyCommand, string>(Object.entries(COMMANDS).map(([name, fn]) => [fn, name]));

export function commandName(command: Command<never, unknown>): string | null {
  return NAMES.get(command as unknown as AnyCommand) ?? null;
}

/**
 * Règles propres au mode multi-utilisateur : le rôle vient du compte (jamais d'un choix
 * dans l'interface) et les réglages partagés par toute l'organisation sont réservés aux
 * rôles autorisés à modifier les paramètres.
 */
export const SHARED_MODE_FORBIDDEN = new Set(["switchDemoRole"]);
export const SHARED_MODE_SETTINGS_ONLY = new Set(["updatePreferences", "updateNotificationSettings"]);
