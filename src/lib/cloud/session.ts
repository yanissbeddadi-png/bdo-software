"use client";
import { browserClient } from "./browser";

/**
 * Navigation avec rechargement complet : volontaire après une connexion, une déconnexion
 * ou une session expirée, pour repartir d'un état applicatif neuf (pas de données d'un
 * autre utilisateur en mémoire).
 */
export function hardNavigate(path: string) {
  window.location.assign(path);
}

/** Déconnexion : supprime la session (cookies) puis retourne à l'écran de connexion. */
export async function signOut() {
  await browserClient().auth.signOut();
  hardNavigate("/connexion");
}
