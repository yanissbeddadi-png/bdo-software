import type { AppData, CurrentUser, Invoice, LineItem, Role } from "@/lib/domain/types";
import { defaultSettings } from "@/lib/database/seed";
import type { CommandContext } from "@/lib/domain/commands/core";

export const TODAY = "2026-10-15";
export const NOW = `${TODAY}T10:00:00.000Z`;

/** Jeu de données vide (paramètres par défaut) pour les tests unitaires. */
export function emptyData(): AppData {
  const settings = defaultSettings(TODAY, NOW);
  settings.gamification.progressionStart = "2000-01-01";
  return {
    settings,
    clients: [],
    contacts: [],
    leads: [],
    opportunities: [],
    salesActivities: [],
    products: [],
    quotes: [],
    invoices: [],
    payments: [],
    creditNotes: [],
    refunds: [],
    vatReturns: [],
    expenses: [],
    subscriptions: [],
    projects: [],
    tasks: [],
    employees: [],
    goals: [],
    missions: [],
    achievements: [],
    xpTransactions: [],
    retiredXpKeys: [],
    progression: [],
    notifications: [],
    activity: [],
    auditLogs: [],
    notes: [],
    sequences: { invoice: 0, quote: 0, project: 0, creditNote: 0 },
  };
}

export function ctx(role: Role = "dirigeant", today = TODAY): CommandContext {
  const user: CurrentUser = { id: "u1", name: "Test", email: "test@example.com", role };
  return { today, now: `${today}T10:00:00.000Z`, user };
}

export function line(quantity: number, unitPriceEuros: number, vatRate = 2000): LineItem {
  return { id: `li_${Math.random().toString(36).slice(2)}`, productId: null, description: "Ligne", quantity, unitPrice: Math.round(unitPriceEuros * 100), vatRate };
}

export function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv_1",
    number: "FAC-2026-0001",
    clientId: "cli_1",
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    items: [line(1, 1000)],
    baseStatus: "issued",
    projectId: null,
    quoteId: null,
    subscriptionId: null,
    notes: "",
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}
