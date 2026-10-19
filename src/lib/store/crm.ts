"use client";
import { useMemo } from "react";
import { useData, useToday } from "./hooks";
import { buildCrmIndex, isMissionOpen } from "@/lib/crm/views";
import { addDays } from "@/lib/calculations/dates";

/** Index CRM (contacts, affaires, entreprises) recalculé à chaque changement de données. */
export function useCrm() {
  const data = useData();
  const today = useToday();
  return useMemo(() => buildCrmIndex(data, today), [data, today]);
}

/** Compteurs de la navigation, calculés à partir des données réelles du CRM. */
export function useNavCounters() {
  const data = useData();
  const today = useToday();
  return useMemo(() => {
    const crm = data.tasks.filter((t) => t.type !== "internal" && isMissionOpen(t));
    const newSince = addDays(today, -data.settings.crm.newProspectDays);
    return {
      newProspects: data.contacts.filter((c) => c.relation === "prospect" && c.createdAt.slice(0, 10) >= newSince).length,
      overdue: crm.filter((t) => t.dueDate && t.dueDate < today).length,
      missionsToday: crm.filter((t) => t.dueDate === today).length,
      upcomingMeetings: crm.filter((t) => t.type === "meeting" && t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)).length,
      unread: data.notifications.filter((n) => !n.read).length,
    };
  }, [data, today]);
}
