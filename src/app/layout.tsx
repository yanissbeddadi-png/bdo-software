import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Figtree } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

// Proxima Nova (police web de BDO) étant sous licence, Figtree en est l'équivalent libre le plus proche.
const brand = Figtree({ variable: "--font-brand", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "BDO Software CRM", template: "%s · BDO Software CRM" },
  description: "CRM gamifié de démonstration : pipeline, contacts, missions et relances.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${brand.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
          Aller au contenu
        </a>
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
