/**
 * Mode multi-utilisateur (comptes et données partagées) : actif dès que les variables
 * publiques Supabase sont définies au build. Sinon, l'application reste en mode
 * démonstration (données dans le navigateur). La clé de service n'est JAMAIS lue ici :
 * elle n'existe que côté serveur (`server.ts`).
 */
export const CLOUD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const CLOUD_PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const isCloudMode = Boolean(CLOUD_URL && CLOUD_PUBLIC_KEY);

/** Organisation unique de l'installation (une entreprise par déploiement). */
export const ORGANIZATION_ID = "org_bdo";

/** Pages accessibles sans être connecté. */
export const PUBLIC_PATHS = ["/connexion", "/installation"];
