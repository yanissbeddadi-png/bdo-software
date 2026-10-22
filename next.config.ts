import type { NextConfig } from "next";

/**
 * L'application lit ses données de démonstration dans le navigateur (localStorage) :
 * le rendu métier est effectué côté client. Les Cache Components et le préchargement
 * partiel n'apportent rien dans ce mode et sont donc désactivés.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: false,
  experimental: {
    serverActions: {
      // Import de fichiers (contacts, logo) et sauvegardes : 4 Mo, sous la limite des fonctions Vercel (4,5 Mo).
      bodySizeLimit: "4mb",
    },
  },
  /**
   * En-têtes de sécurité appliqués à toutes les réponses : pas d'affichage dans un cadre
   * (anti-clickjacking), pas de détection de type, référent limité, capteurs désactivés.
   * La politique de contenu reste volontairement minimale (pas de restriction des scripts,
   * que Next.js injecte en ligne) : elle bloque les cadres, les plugins et les formulaires
   * vers d'autres sites.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        ],
      },
    ];
  },
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
