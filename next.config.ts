import type { NextConfig } from "next";

/**
 * L'application lit ses données de démonstration dans le navigateur (localStorage) :
 * le rendu métier est effectué côté client. Les Cache Components et le préchargement
 * partiel n'apportent rien dans ce mode et sont donc désactivés.
 */
const nextConfig: NextConfig = {
  cacheComponents: false,
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
