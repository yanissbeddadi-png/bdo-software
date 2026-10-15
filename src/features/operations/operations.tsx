"use client";
import * as React from "react";
import Link from "next/link";
import { NotebookPen, Settings2 } from "lucide-react";
import { useData, useSummaries, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import { computeAlerts, RISK_KINDS, ALERT_KIND_LABELS } from "@/lib/calculations/alerts";
import { addDays, addMonths } from "@/lib/calculations/dates";
import { billingDates } from "@/lib/calculations/recurring";
import { isTaskOpen } from "@/lib/calculations/projects";
import { isOpen } from "@/lib/calculations/pipeline";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { MonthCalendar, LegendDot, type CalendarEvent } from "@/components/shared/calendar";
import { AlertCard } from "@/components/dashboard/widgets";
import { NotesGrid } from "@/features/clients/clients";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDueIn, formatEUR } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Deadline {
  id: string;
  date: string;
  kind: string;
  title: string;
  href: string;
  tone: CalendarEvent["tone"];
  amount?: number;
}

function useDeadlines(): Deadline[] {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  return React.useMemo(() => {
    const clients = new Map(data.clients.map((c) => [c.id, c.name]));
    const out: Deadline[] = [];
    for (const s of summaries) {
      if (s.balance <= 0) continue;
      out.push({
        id: `inv-${s.invoice.id}`,
        date: s.invoice.dueDate,
        kind: s.status === "overdue" ? "Facture à relancer" : "Échéance facture",
        title: `${s.invoice.number} · ${clients.get(s.invoice.clientId)}`,
        href: `/finances/factures/${s.invoice.id}`,
        tone: s.status === "overdue" ? "danger" : "accent",
        amount: s.balance,
      });
    }
    for (const e of data.expenses)
      if (!e.paid)
        out.push({
          id: `exp-${e.id}`,
          date: e.dueDate,
          kind: "Dépense à payer",
          title: `${e.label}`,
          href: `/finances/depenses?focus=${e.id}`,
          tone: e.dueDate < today ? "danger" : "warning",
          amount: -e.amountHT,
        });
    for (const sub of data.subscriptions) {
      if (sub.status !== "active") continue;
      for (const d of billingDates(sub, addDays(today, -31), addMonths(today, 3)))
        out.push({
          id: `sub-${sub.id}-${d}`,
          date: d,
          kind: "Facturation récurrente",
          title: `${sub.offer} · ${clients.get(sub.clientId)}`,
          href: `/finances/abonnements?focus=${sub.id}`,
          tone: "success",
        });
      if (sub.endDate)
        out.push({
          id: `subend-${sub.id}`,
          date: sub.endDate,
          kind: "Contrat à renouveler",
          title: `${sub.offer} · ${clients.get(sub.clientId)}`,
          href: `/finances/abonnements?focus=${sub.id}`,
          tone: "warning",
        });
    }
    for (const p of data.projects) {
      if (p.status === "done" || p.status === "cancelled") continue;
      out.push({ id: `prj-${p.id}`, date: p.dueDate, kind: "Livraison projet", title: `${p.code} · ${p.name}`, href: `/projets/${p.id}`, tone: p.dueDate < today ? "danger" : "violet" });
      for (const m of p.milestones)
        if (!m.done) out.push({ id: `ms-${m.id}`, date: m.dueDate, kind: "Jalon", title: `${p.code} · ${m.title}`, href: `/projets/${p.id}`, tone: m.dueDate < today ? "danger" : "violet" });
    }
    for (const t of data.tasks)
      if (isTaskOpen(t) && t.dueDate && (t.priority === "critical" || t.priority === "high"))
        out.push({
          id: `tsk-${t.id}`,
          date: t.dueDate,
          kind: t.priority === "critical" ? "Tâche critique" : "Tâche prioritaire",
          title: t.title,
          href: `/taches?focus=${t.id}`,
          tone: t.dueDate < today ? "danger" : "warning",
        });
    for (const a of data.salesActivities) if (!a.done) out.push({ id: `sa-${a.id}`, date: a.date.slice(0, 10), kind: "Activité commerciale", title: a.subject, href: "/crm/activites", tone: "gold" });
    for (const l of data.leads)
      if (l.nextActionDate && l.status !== "converted" && l.status !== "unqualified")
        out.push({
          id: `lead-${l.id}`,
          date: l.nextActionDate,
          kind: "Relance prospect",
          title: `${l.company} · ${l.nextAction}`,
          href: `/crm/prospects?focus=${l.id}`,
          tone: l.nextActionDate < today ? "danger" : "gold",
        });
    for (const o of data.opportunities) if (isOpen(o)) out.push({ id: `opp-${o.id}`, date: o.expectedCloseDate, kind: "Clôture estimée", title: o.name, href: `/crm?focus=${o.id}`, tone: "neutral" });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, summaries, today]);
}

export function OperationsPage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const tabParam = useParam("tab");
  const openCreate = useUiStore((s) => s.openCreate);
  const [tab, setTab] = useSyncedState(tabParam ?? "calendrier");
  const deadlines = useDeadlines();
  const alerts = React.useMemo(() => computeAlerts(data, today, summaries), [data, today, summaries]);
  const risks = alerts.filter((a) => RISK_KINDS.includes(a.kind));
  const upcoming = deadlines.filter((d) => d.date >= today && d.date <= addDays(today, 30));
  const pending = deadlines.filter((d) => d.date < today);
  const rules = data.settings.rules;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opérations"
        description="Vue centralisée des échéances, actions en attente et risques opérationnels. Chaque élément renvoie vers son entité d'origine."
        actions={
          <Button variant="secondary" onClick={() => openCreate("note")}>
            <NotebookPen /> Nouvelle note
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Échéances à 30 jours" value={upcoming.length} />
        <MetricCard label="Actions en attente (dépassées)" value={pending.length} tone={pending.length ? "danger" : "default"} />
        <MetricCard label="Risques opérationnels" value={risks.length} tone={risks.some((r) => r.severity === "danger") ? "danger" : "default"} />
        <MetricCard label="Contrats à renouveler" value={deadlines.filter((d) => d.kind === "Contrat à renouveler" && d.date >= today && d.date <= addDays(today, rules.contractNoticeDays)).length} />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="calendrier">Calendrier global</TabsTrigger>
          <TabsTrigger value="echeances">Échéances ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="attente">Actions en attente ({pending.length})</TabsTrigger>
          <TabsTrigger value="risques">Risques ({risks.length})</TabsTrigger>
          <TabsTrigger value="alertes">Toutes les alertes ({alerts.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({data.notes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="calendrier">
          <MonthCalendar
            today={today}
            events={deadlines.map((d) => ({ id: d.id, date: d.date, title: `${d.kind} · ${d.title}`, tone: d.tone, href: d.href }))}
            legend={
              <>
                <LegendDot tone="accent" label="Factures" />
                <LegendDot tone="success" label="Récurrent" />
                <LegendDot tone="violet" label="Projets" />
                <LegendDot tone="warning" label="Tâches / contrats / dépenses" />
                <LegendDot tone="gold" label="Commercial" />
                <LegendDot tone="danger" label="En retard" />
              </>
            }
          />
        </TabsContent>
        <TabsContent value="echeances">
          <DeadlineList items={upcoming} today={today} empty="Aucune échéance dans les 30 prochains jours." />
        </TabsContent>
        <TabsContent value="attente">
          <DeadlineList items={[...pending].reverse()} today={today} empty="Aucune action en attente." />
        </TabsContent>
        <TabsContent value="risques" className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-xs text-muted">
              <span className="font-medium text-fg">Règles actives :</span>
              <span>Facture importante ≥ {formatEUR(rules.bigInvoiceThreshold, { round: true })}</span>
              <span>Charge excessive &gt; {rules.workloadHoursThreshold} h à 14 j</span>
              <span>Préavis contrat {rules.contractNoticeDays} j</span>
              <span>Tâches critiques à {rules.criticalTaskDays} j</span>
              <Link href="/parametres?tab=gamification" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
                <Settings2 className="size-3.5" /> Configurer
              </Link>
            </CardContent>
          </Card>
          <p className="text-[11px] text-subtle">Les risques sont déterminés par des règles simples et explicites ; ce n&apos;est pas un système prédictif.</p>
          {risks.length ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {risks.map((r) => (
                <AlertCard key={r.key} alert={r} />
              ))}
            </div>
          ) : (
            <EmptyState title="Aucun risque détecté" />
          )}
          <div className="flex flex-wrap gap-2 text-[11px] text-muted">
            {RISK_KINDS.map((k) => (
              <Badge key={k}>
                {ALERT_KIND_LABELS[k]} : {risks.filter((r) => r.kind === k).length}
              </Badge>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="alertes">
          {alerts.length ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {alerts.map((r) => (
                <AlertCard key={r.key} alert={r} />
              ))}
            </div>
          ) : (
            <EmptyState title="Aucune alerte" />
          )}
        </TabsContent>
        <TabsContent value="notes">
          <NotesGrid notes={[...data.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeadlineList({ items, today, empty }: { items: Deadline[]; today: string; empty: string }) {
  if (!items.length) return <EmptyState title={empty} />;
  return (
    <Card>
      <ul className="divide-y divide-border/60">
        {items.slice(0, 80).map((d) => (
          <li key={d.id}>
            <Link href={d.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-interactive/40">
              <span className={cn("w-24 shrink-0 text-xs tabular", d.date < today ? "text-danger" : "text-muted")}>{formatDate(d.date)}</span>
              <Badge className="hidden w-40 justify-center sm:inline-flex">{d.kind}</Badge>
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              {d.amount ? <span className="tabular text-xs text-muted">{formatEUR(Math.abs(d.amount))}</span> : null}
              <span className="w-20 shrink-0 text-right text-[11px] text-subtle">{formatDueIn(d.date, today)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
