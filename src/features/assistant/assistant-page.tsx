"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarPlus, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useUiStore } from "@/lib/store/ui-store";
import { formatDate, formatDateLong, formatEUR } from "@/lib/formatters";
import type { Briefing } from "@/lib/assistant/briefing";
import { ActionRow } from "@/features/dashboard/crm-dashboard";
import { MissionLine, StageBadge } from "@/components/crm/crm-ui";
import { SectionTitle } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { RiskBadge } from "./risk-badge";
import { DraftCard } from "./draft-card";
import { useAiStatus } from "./use-ai-status";
import { useIgnoredDrafts } from "./ignored-drafts";
import { useBriefing, type BriefingScope } from "./use-briefing";

/**
 * Assistant commercial : rapport du matin calculé localement à partir du CRM (aucun envoi
 * automatique, aucune donnée transmise sans action explicite). Chaque élément explique la
 * règle qui l'a fait apparaître et propose l'action correspondante.
 */
export function AssistantPage() {
  const data = useData();
  const today = useToday();
  const [requested, setRequested] = React.useState<BriefingScope | null>(null);
  const { briefing, scope, canTeam } = useBriefing(requested);
  const ai = useAiStatus();
  const { ignored, ignore } = useIgnoredDrafts(today);
  const user = data.settings.user;
  const employee = user.employeeId ? data.employees.find((e) => e.id === user.employeeId) : undefined;
  const firstName = employee?.firstName ?? user.name.trim().split(/\s+/)[0] ?? "";
  const drafts = briefing.drafts.filter((d) => !ignored.has(d.key));
  const hidden = briefing.drafts.length - drafts.length;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-subtle">
            <Sparkles className="mr-1 inline size-3.5 text-accent" aria-hidden />
            Rapport du matin
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg md:text-[30px]">
            Bonjour{firstName ? ` ${firstName}` : ""}, nous sommes {formatDateLong(today)}.
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-fg" aria-live="polite">
            {briefing.headline}
          </p>
        </div>
        {canTeam ? (
          <Segmented
            label="Périmètre du rapport"
            value={scope}
            onChange={setRequested}
            options={[
              { value: "mine", label: "Mon portefeuille" },
              { value: "team", label: "Toute l'équipe" },
            ]}
          />
        ) : (
          <p className="text-xs text-muted">{scope === "mine" ? "Votre portefeuille" : "Toutes les données visibles"}</p>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-8">
          <Priorities briefing={briefing} today={today} />
          <section aria-label="Brouillons à valider">
            <SectionTitle
              title="Brouillons à valider"
              description="Préparés à partir de vos modèles d'e-mails. Rien n'est envoyé par l'application : ouvrez le brouillon dans votre messagerie, puis consignez l'envoi."
              actions={
                <Link href="/parametres?tab=assistant" className="shrink-0 text-xs text-accent hover:underline">
                  Modèles d&apos;e-mails →
                </Link>
              }
            />
            {drafts.length ? (
              <ol className="space-y-3">
                {drafts.map((d) => (
                  <DraftCard key={d.key} draft={d} today={today} ai={ai} onIgnore={() => ignore(d.key)} />
                ))}
              </ol>
            ) : (
              <Empty>{hidden ? `Aucun autre brouillon : ${hidden} ignoré${hidden > 1 ? "s" : ""} pour aujourd'hui.` : "Aucun brouillon à valider aujourd'hui."}</Empty>
            )}
          </section>
          <AtRisk briefing={briefing} />
        </div>
        <div className="min-w-0 space-y-6">
          <Since briefing={briefing} />
          <Agenda briefing={briefing} today={today} />
          <ForecastCard briefing={briefing} />
          <Hygiene briefing={briefing} />
          <p className="flex items-start gap-1.5 text-[11px] text-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Rapport calculé dans l&apos;application à partir des seules données que vous voyez ; les scores de risque reposent sur des règles affichées. Aucune donnée n&apos;est envoyée à un service
            d&apos;IA sans votre demande.
          </p>
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5 text-sm text-muted">
        <Sparkles className="size-5 shrink-0 text-success" aria-hidden /> {children}
      </CardContent>
    </Card>
  );
}

function Priorities({ briefing, today }: { briefing: Briefing; today: string }) {
  const more = briefing.priorityTotal - briefing.priorities.length;
  return (
    <section aria-label="Priorités">
      <SectionTitle title="Priorités" description="Mêmes règles que le centre d'action de la vue d'ensemble : urgence, échéance puis priorité, avec la raison de chaque élément." />
      {briefing.priorities.length ? (
        <ol className="space-y-2">
          {briefing.priorities.map((a) => (
            <ActionRow key={a.key} item={a} today={today} />
          ))}
        </ol>
      ) : (
        <Empty>Aucune action en attente : tous les suivis sont à jour.</Empty>
      )}
      {more > 0 ? (
        <Link href="/" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          Voir les {more} autres actions dans le centre d&apos;action <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </section>
  );
}

function AtRisk({ briefing }: { briefing: Briefing }) {
  const openCreate = useUiStore((s) => s.openCreate);
  const { high, medium, amountAtRisk } = briefing.riskCounts;
  return (
    <section aria-label="Affaires à risque">
      <SectionTitle
        title="Affaires à risque"
        description={
          high || medium
            ? `${high} à risque (${formatEUR(amountAtRisk, { round: true })}) et ${medium} à surveiller. Score de 0 à 100, calculé par des règles explicites.`
            : "Score de 0 à 100, calculé par des règles explicites (silence, retard, date dépassée…)."
        }
      />
      {briefing.atRisk.length ? (
        <ol className="space-y-2">
          {briefing.atRisk.map(({ deal, risk }) => {
            const o = deal.opportunity;
            const contactName = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : null;
            return (
              <li key={o.id} className={cn("rounded-xl border bg-card p-3", risk.level === "high" ? "border-danger/40" : "border-border")} data-risk={risk.level}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-fg">{o.name}</span>
                      <RiskBadge risk={risk} />
                      <StageBadge stage={o.stage} />
                    </div>
                    <p className="text-xs text-muted">
                      {[deal.company?.name, contactName].filter(Boolean).join(" · ") || "Sans entreprise ni interlocuteur"} · <span className="tabular text-fg">{formatEUR(o.amount, { round: true })}</span>
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
                      {risk.factors.map((f) => (
                        <li key={f.key}>{f.label}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/pipeline?focus=${o.id}`}>
                        <ExternalLink /> Ouvrir
                      </Link>
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openCreate("action", { contactId: o.contactId, clientId: o.clientId, opportunityId: o.id, type: "followup" })}>
                      <CalendarPlus /> Planifier une relance
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty>Aucune affaire à risque : chaque opportunité ouverte a un suivi récent.</Empty>
      )}
    </section>
  );
}

function Since({ briefing }: { briefing: Briefing }) {
  const s = briefing.since;
  const rows: [string, number][] = [
    ["Interactions consignées", s.interactions],
    ["Missions terminées", s.missionsDone],
    ["Changements d'étape", s.stageMoves],
    ["Nouveaux contacts", s.newContacts],
  ];
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <h2 className="text-sm font-semibold text-fg">Depuis {formatDate(s.from, "EEEE")}</h2>
        <p className="-mt-2 text-[11px] text-subtle">Activité depuis le dernier jour ouvré ({formatDate(s.from, "EEEE d MMMM")}).</p>
        <dl className="grid grid-cols-2 gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border px-3 py-2">
              <dt className="text-[11px] text-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <OppList title="Gagnées" tone="text-success" opps={s.won} />
        <OppList title="Perdues" tone="text-danger" opps={s.lost} />
      </CardContent>
    </Card>
  );
}

function OppList({ title, tone, opps }: { title: string; tone: string; opps: Briefing["since"]["won"] }) {
  if (!opps.length) return null;
  return (
    <div>
      <h3 className={cn("text-xs font-medium", tone)}>
        {title} ({opps.length})
      </h3>
      <ul className="mt-1 space-y-0.5 text-xs">
        {opps.map((o) => (
          <li key={o.id} className="flex justify-between gap-2">
            <Link href={`/pipeline?focus=${o.id}`} className="truncate text-fg hover:underline">
              {o.name}
            </Link>
            <span className="tabular text-muted">{formatEUR(o.amount, { round: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Agenda({ briefing, today }: { briefing: Briefing; today: string }) {
  const crm = useCrm();
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Agenda du jour</h2>
          <Link href="/missions?view=today" className="text-xs text-accent hover:underline">
            Missions du jour →
          </Link>
        </div>
        {briefing.agenda.length ? (
          <div className="space-y-2">
            {briefing.agenda.map((t) => (
              <MissionLine
                key={t.id}
                task={t}
                today={today}
                contactName={t.contactId ? crm.contactById.get(t.contactId)?.name : null}
                companyName={t.clientId ? crm.companyById.get(t.clientId)?.company.name : null}
              />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted">
            <CalendarCheck className="size-4 text-success" aria-hidden /> Aucune mission prévue aujourd&apos;hui.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastCard({ briefing }: { briefing: Briefing }) {
  const f = briefing.forecast;
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Prévision</h2>
          <Link href="/pipeline" className="text-xs text-accent hover:underline">
            Pipeline →
          </Link>
        </div>
        <p className="-mt-2 text-[11px] text-subtle">
          Par mois de signature prévue. Pondéré : montant × probabilité. Engagé : affaires en négociation. Pipeline ouvert : {briefing.pipeline.open} affaire{briefing.pipeline.open > 1 ? "s" : ""},{" "}
          {formatEUR(briefing.pipeline.weighted, { round: true })} pondérés.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Prévision des ventes sur trois mois</caption>
            <thead>
              <tr className="text-left text-[11px] text-subtle">
                <th scope="col" className="py-1 pr-2 font-normal">
                  Mois
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">
                  Signé
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">
                  Pondéré
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">
                  Engagé
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Potentiel
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {f.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal capitalize text-fg">
                    {formatDate(`${m.month}-01`, "MMMM yyyy")}
                    <span className="block text-[10px] normal-case text-subtle">
                      {m.openCount} ouverte{m.openCount > 1 ? "s" : ""}
                    </span>
                  </th>
                  <td className="py-1.5 pr-2 text-right tabular text-success">{formatEUR(m.won, { round: true, compact: true })}</td>
                  <td className="py-1.5 pr-2 text-right tabular text-fg">{formatEUR(m.weighted, { round: true, compact: true })}</td>
                  <td className="py-1.5 pr-2 text-right tabular text-muted">{formatEUR(m.committed, { round: true, compact: true })}</td>
                  <td className="py-1.5 text-right tabular text-muted">{formatEUR(m.bestCase, { round: true, compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 text-xs">
          {f.overdue.count ? (
            <Link href="/pipeline?view=late_close" className="flex justify-between gap-2 rounded-md px-1 py-0.5 text-warning hover:bg-interactive/50">
              <span>Dates de signature dépassées : {f.overdue.count}</span>
              <span className="tabular">{formatEUR(f.overdue.amount, { round: true })}</span>
            </Link>
          ) : null}
          {f.later.count ? (
            <Link href="/pipeline" className="flex justify-between gap-2 rounded-md px-1 py-0.5 text-muted hover:bg-interactive/50">
              <span>Plus tard ou sans date : {f.later.count}</span>
              <span className="tabular">{formatEUR(f.later.amount, { round: true })}</span>
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Hygiene({ briefing }: { briefing: Briefing }) {
  const h = briefing.hygiene;
  const rows: { label: string; value: number; href?: string }[] = [
    { label: "Fiches contact incomplètes", value: h.incompleteContacts },
    { label: "Contacts sans responsable", value: h.contactsWithoutOwner, href: "/contacts?owner=none" },
    { label: "Affaires sans prochaine action", value: h.dealsWithoutNextAction, href: "/pipeline?view=no_next" },
    { label: "Affaires sans interlocuteur", value: h.dealsWithoutContact },
    { label: "Dates de signature dépassées", value: h.overdueCloseDates, href: "/pipeline?view=late_close" },
  ];
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <h2 className="text-sm font-semibold text-fg">Qualité des données</h2>
        <ul className="divide-y divide-border text-xs">
          {rows.map((r) => {
            const body = (
              <>
                <span className={r.value ? "text-fg" : "text-muted"}>{r.label}</span>
                <span className={cn("tabular font-medium", r.value ? "text-warning" : "text-success")}>{r.value}</span>
              </>
            );
            return (
              <li key={r.label}>
                {r.href && r.value ? (
                  <Link href={r.href} className="flex justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-interactive/50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex justify-between gap-2 px-1 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-subtle">Des données complètes rendent les priorités et les scores de risque plus fiables.</p>
      </CardContent>
    </Card>
  );
}
