import type { NextConfig } from "next";

/**
 * L'application lit ses données de démonstration dans le navigateur (localStorage) :
 * le rendu métier est effectué côté client. Les Cache Components et le préchargement
 * partiel n'apportent rien dans ce mode et sont donc désactivés.
 */
const nextConfig: NextConfig = {
  cacheComponents: false,
  /** Anciennes routes CRM réorientées vers les nouveaux modules (liens et favoris existants). */
  async redirects() {
    return [
      { source: "/crm", destination: "/pipeline", permanent: false },
      { source: "/crm/prospects", destination: "/contacts?relation=prospect", permanent: false },
      { source: "/crm/activites", destination: "/activites", permanent: false },
      { source: "/clients", destination: "/entreprises", permanent: false },
      { source: "/clients/:id", destination: "/entreprises/:id", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
