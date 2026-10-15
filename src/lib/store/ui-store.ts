"use client";
import { create } from "zustand";
import type { PeriodPreset } from "@/lib/calculations/dates";

export type QuickCreateKind = "client" | "lead" | "opportunity" | "project" | "task" | "invoice" | "expense" | "quote" | "note" | "goal" | "mission" | "contact" | "payment" | "activity" | "subscription" | "product" | "employee";

interface UiStore {
  period: PeriodPreset;
  setPeriod: (p: PeriodPreset) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** Création rapide : type d'entité + valeurs pré-remplies éventuelles. */
  create: { kind: QuickCreateKind; defaults?: Record<string, unknown> } | null;
  openCreate: (kind: QuickCreateKind, defaults?: Record<string, unknown>) => void;
  closeCreate: () => void;
}

function readCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("bdo:sidebar-collapsed") === "1";
  } catch {
    return false;
  }
}

export const useUiStore = create<UiStore>((set) => ({
  period: "month",
  setPeriod: (period) => set({ period }),
  sidebarCollapsed: readCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      try {
        window.localStorage.setItem("bdo:sidebar-collapsed", s.sidebarCollapsed ? "0" : "1");
      } catch {
        /* préférence non persistée */
      }
      return { sidebarCollapsed: !s.sidebarCollapsed };
    }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  create: null,
  openCreate: (kind, defaults) => set({ create: { kind, defaults } }),
  closeCreate: () => set({ create: null }),
}));
