"use client";
import * as React from "react";
import { Download, MessageSquarePlus, Search } from "lucide-react";
import type { SalesActivity } from "@/lib/domain/types";
import { useData, useToday } from "@/lib/store/hooks";
import { useParam } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import { addDays } from "@/lib/calculations/dates";
import { activityLabel } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { Timeline } from "@/components/crm/timeline";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { downloadCSV } from "@/lib/export/csv";
import { formatDateLong, formatDateTime } from "@/lib/formatters";

/**
 * Filtres de type. Chaque entrée est un prédicat : le journal est extensible (un futur
 * connecteur de messagerie ajouterait simplement des interactions de type « email »).
 */
const TYPE_FILTERS: Record<string, { label: string; test: (a: SalesActivity) => boolean }> = {
  call_out: { label: "Appel sortant", test: (a) => a.type === "call" && a.direction !== "in" },
  call_in: { label: "Appel entrant", test: (a) => a.type === "call" && a.direction === "in" },
  email_out: { label: "E-mail envoyé", test: (a) => a.type === "email" && a.direction !== "in" },
  email_in: { label: "E-mail reçu", test: (a) => a.type === "email" && a.direction === "in" },
  meeting: { label: "Rendez-vous", test: (a) => a.type === "meeting" },
  demo: { label: "Réunion / démonstration", test: (a) => a.type === "demo" },
  message: { label: "Message", test: (a) => a.type === "message" },
  note: { label: "Note", test: (a) => a.type === "note" },
  followup: { label: "Relance", test: (a) => a.type === "followup" },
  stage_change: { label: "Changement d'étape", test: (a) => a.type === "stage_change" },
  task_done: { label: "Mission terminée", test: (a) => a.type === "task_done" },
};

export function ActivitiesPage() {
  const data = useData();
  const today = useToday();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const [type, setType] = React.useState("all");
  const [owner, setOwner] = React.useState("all");
  // Un lien vers une activité précise (notification, recherche) ouvre tout l'historique.
  const [period, setPeriod] = React.useState(focus ? "all" : "30");
  const [q, setQ] = React.useState("");
  const contacts = new Map(data.contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  const companies = new Map(data.clients.map((c) => [c.id, c.name]));

  const list = data.salesActivities
    .filter((a) => a.done)
    .filter((a) => type === "all" || TYPE_FILTERS[type]!.test(a))
    .filter((a) => owner === "all" || a.ownerId === owner)
    .filter((a) => period === "all" || a.date.slice(0, 10) >= addDays(today, -Number(period)))
    .filter((a) => {
      if (!q.trim()) return true;
      const hay = [a.subject, a.notes, a.outcome, a.contactId ? contacts.get(a.contactId) : "", a.clientId ? companies.get(a.clientId) : ""].join(" ").toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const days = new Map<string, SalesActivity[]>();
  for (const a of list) days.set(a.date.slice(0, 10), [...(days.get(a.date.slice(0, 10)) ?? []), a]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activités"
        description="Journal des interactions consignées : appels, e-mails, rendez-vous, messages, notes, relances, changements d'étape et missions terminées. L'application n'envoie aucun e-mail : elle enregistre ce qui a eu lieu."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!list.length}
              onClick={() =>
                downloadCSV(
                  "activites",
                  ["Date", "Type", "Résumé", "Résultat", "Contact", "Entreprise", "Note"],
                  list.map((a) => [
                    formatDateTime(a.date),
                    activityLabel(a),
                    a.subject,
                    a.outcome,
                    a.contactId ? (contacts.get(a.contactId) ?? "") : "",
                    a.clientId ? (companies.get(a.clientId) ?? "") : "",
                    a.notes,
                  ]),
                )
              }
            >
              <Download /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => openCreate("interaction")}>
              <MessageSquarePlus /> Consigner une interaction
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Résumé, contact, entreprise…" aria-label="Rechercher une activité" className="h-8 pl-8 text-xs" />
        </div>
        <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type d'activité" className="h-8 w-auto text-xs">
          <option value="all">Tous les types</option>
          {Object.entries(TYPE_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Auteur" className="h-8 w-auto text-xs">
          <option value="all">Tous les auteurs</option>
          {data.employees
            .filter((e) => e.status !== "left")
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Période" className="h-8 w-auto text-xs">
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="90">90 derniers jours</option>
          <option value="all">Tout l&apos;historique</option>
        </NativeSelect>
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {list.length} activité{list.length > 1 ? "s" : ""}
        </span>
      </div>
      {list.length ? (
        <div className="space-y-5">
          {[...days.entries()].map(([d, acts]) => (
            <section key={d} aria-label={formatDateLong(d)}>
              <h2 className="mb-2 text-sm font-medium capitalize text-muted">{d === today ? "Aujourd'hui" : formatDateLong(d)}</h2>
              <Card>
                <CardContent className="pt-4">
                  <Timeline activities={acts} allowDelete />
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Aucune activité pour ces critères.</p>
      )}
    </div>
  );
}
