/**
 * Navigation liée à la session (mode multi-utilisateur), partagée par le navigateur et le
 * serveur : retour après connexion et détection d'une session expirée.
 */

/** Message renvoyé par les Server Actions quand la session Supabase n'est plus valide. */
export const SESSION_EXPIRED = "Session expirée : reconnectez-vous.";

/**
 * Chemin de retour après connexion (`?suite=`) : seuls les chemins internes sont acceptés,
 * c'est-à-dire commençant par un seul « / » suivi d'un caractère autre que « / » ou « \ »
 * (`//site.example` ou `/\site.example` mèneraient hors de l'application). Les caractères
 * de contrôle et les espaces sont refusés (le navigateur retire tabulations et retours à
 * la ligne d'une URL, ce qui pourrait reformer « // »).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || [...next].some((ch) => ch.charCodeAt(0) <= 0x20 || ch.charCodeAt(0) === 0x7f)) return fallback;
  return /^\/[^/\\]/.test(next) ? next : fallback;
}

/** Page de connexion qui ramène ensuite à `current` (chemin + paramètres). */
export function loginPath(current: string): string {
  const next = safeNextPath(current, "");
  return next ? `/connexion?suite=${encodeURIComponent(next)}` : "/connexion";
}
