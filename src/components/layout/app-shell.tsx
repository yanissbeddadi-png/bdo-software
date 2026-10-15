"use client";
import * as React from "react";
import { Toaster } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store/app-store";
import { useUiStore } from "@/lib/store/ui-store";
import { themeColor } from "@/lib/gamification/rewards";
import { Sidebar, Logo, NavLinks, ProfileCard } from "./sidebar";
import { Topbar } from "./topbar";
import { SearchCommand } from "./search-command";
import { QuickCreateHost } from "@/components/forms/quick-create";
import { DemoBanner } from "./demo-banner";
import { usePathname } from "next/navigation";

function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}

const noopSubscribe = () => () => {};

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Chargement de l'application">
      <div className="hidden w-64 border-r border-border bg-bg-elevated p-4 lg:block">
        <Skeleton className="h-9 w-40" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-8 w-72" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileNav() {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent title="Navigation" side="left">
        <div className="border-b border-border px-3 py-3">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <div className="border-t border-border p-3" onClick={() => setOpen(false)}>
          <ProfileCard />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Enveloppe de l'application : les données de démonstration sont stockées dans le
 * navigateur, l'interface est donc rendue côté client après chargement.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const init = useAppStore((s) => s.init);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const g = useAppStore((s) => s.data?.settings.gamification);
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  React.useEffect(() => {
    init();
  }, [init]);

  if (!mounted || status === "loading") return <ShellSkeleton />;
  if (status === "error")
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <ErrorState description={error ?? undefined} action={<Button onClick={resetDemo}>Réinitialiser les données de démonstration</Button>} />
      </div>
    );

  const style = { "--accent": themeColor(g?.equippedTheme ?? "theme-default") } as React.CSSProperties;
  return (
    <TooltipProvider>
      <div className="flex min-h-screen" style={style} data-motion={g?.animations === false ? "off" : "on"}>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <DemoBanner />
          <main id="contenu" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-6 lg:px-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
      <MobileNav />
      <SearchCommand />
      <QuickCreateHost />
      <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ className: "!bg-card !border-border !text-fg" }} />
    </TooltipProvider>
  );
}
