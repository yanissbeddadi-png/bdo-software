"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, BellRing, Columns3, ExternalLink, Link2, ListPlus, Mail, NotebookPen, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import type { Opportunity } from "@/lib/domain/types";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { STAGE_LABELS, isOpen } from "@/lib/calculations/pipeline";
import { FOLLOW_UP, isContactComplete } from "@/lib/crm/views";
import { Avatar, FollowUpBadge, MissionLine, PriorityBadge, RelationBadge, StageBadge } from "@/components/crm/crm-ui";
import { Timeline } from "@/components/crm/timeline";
import { NotesGrid } from "@/components/crm/notes-grid";
import { ErrorState } from "@/components/shared/empty-state";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/forms/quick-create";
import { ContactForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime, formatDueIn, formatEUR } from "@/lib/formatters";
import { OpportunityDialog } from "./opportunity-dialog";

export function ContactDetail({ id }: { id: string }) {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const run = useCommand();
  const router = useRouter();
  const openCreate = useUiStore((s) => s.openCreate);
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useSyncedState(useParam("tab") ?? "apercu");
  const [editing, setEditing] = React.useState(false);
  const [deal, setDeal] = React.useState<string | null>(null);
  const view = crm.contactById.get(id);
  if (!view) return <ErrorState title="Contact introuvable" description="Il a peut-être été supprimé." action={<Link href="/contacts">Retour aux contacts</Link>} />;
  const c = view.contact;
  const refs = { contactId: id, clientId: c.clientId, opportunityId: view.mainOpportunity && isOpen(view.mainOpportunity) ? view.mainOpportunity.id : null };
  const missions = data.tasks.filter((t) => t.contactId === id && t.type !== "internal");
  const doneMissions = missions.filter((t) => t.status === "done" || t.status === "cancelled").sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const notes = data.notes
    .filter((n) => n.contactId === id || (!n.contactId && n.opportunityId && view.opportunities.some((o) => o.id === n.opportunityId)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const ownOpps = view.opportunities.filter((o) => o.contactId === id);
  const companyOpps = view.opportunities.filter((o) => o.contactId !== id);
  const realInteractions = view.interactions.filter((a) => a.type !== "stage_change" && a.type !== "task_done");
  const won = ownOpps.filter((o) => o.stage === "won");
  const audit = data.auditLogs.filter((l) => l.ref?.type === "contact" && l.ref.id === id).sort((a, b) => b.at.localeCompare(a.at));
  const quotes = data.quotes.filter((q) => ownOpps.some((o) => o.id === q.opportunityId));

  const summary: [string, React.ReactNode][] = [
    ["Premier contact", formatDate(c.createdAt)],
    ["Dernière interaction", view.lastInteraction ? `${formatDueIn(view.lastInteraction.date, today)} · ${view.lastInteraction.subject}` : "Aucune"],
    [
      "Prochaine action",
      view.nextMission ? `${view.nextMission.title} · ${formatDate(view.nextMission.dueDate)}${view.nextMission.dueTime ? ` ${view.nextMission.dueTime}` : ""}` : "Aucune — à planifier",
    ],
    ["Interactions consignées", String(realInteractions.length)],
    ["Missions ouvertes", `${view.openMissions.length}${view.overdueMissions.length ? ` (dont ${view.overdueMissions.length} en retard)` : ""}`],
    ["Pipeline ouvert", formatEUR(view.pipelineValue, { round: true })],
    [
      "Affaires gagnées",
      won.length
        ? `${won.length} · ${formatEUR(
            won.reduce((s, o) => s + o.amount, 0),
            { round: true },
          )}`
        : "Aucune",
    ],
    ["Source", c.source || "—"],
    ["Responsable", view.owner ? `${view.owner.firstName} ${view.owner.lastName}` : "Non attribué"],
  ];

  return (
    <div className="space-y-6">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Contacts
      </Link>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={view.name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{view.name}</h1>
            <p className="text-sm text-muted">
              {c.jobTitle || "Fonction non renseignée"}
              {view.company ? (
                <>
                  {" · "}
                  <Link href={`/entreprises/${view.company.id}`} className="text-fg hover:underline">
                    {view.company.name}
                  </Link>
                </>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RelationBadge relation={c.relation} />
              <StageBadge stage={view.stage} />
              {!view.archived ? <FollowUpBadge state={view.followUp} /> : null}
              <PriorityBadge priority={c.priority} />
              {c.isPrimary ? <Badge tone="gold">Contact principal</Badge> : null}
              {!isContactComplete(c) ? <Badge tone="warning">Fiche incomplète</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {c.email ? (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-fg" title="Ouvre votre messagerie (aucun envoi depuis l'application)">
                  <Mail className="size-3.5" /> {c.email}
                </a>
              ) : null}
              {c.phone ? (
                <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-fg">
                  <Phone className="size-3.5" /> {c.phone}
                </a>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> Modifier
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("interaction", { ...refs, type: "call" })}>
            <Phone /> Appel
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("interaction", { ...refs, type: "email" })} title="Consigner un e-mail envoyé ou reçu depuis votre messagerie">
            <Mail /> E-mail
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("action", { ...refs, type: "followup" })}>
            <BellRing /> Relance
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("action", { ...refs, type: "call" })}>
            <ListPlus /> Mission
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openCreate("note", refs)}>
            <NotebookPen /> Note
          </Button>
          {refs.opportunityId ? (
            <Button size="sm" variant="secondary" onClick={() => openCreate("stage", { opportunityId: refs.opportunityId })}>
              <Columns3 /> Changer l&apos;étape
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => openCreate("opportunity", { clientId: c.clientId, contactId: id })}>
              <Plus /> Opportunité
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => run(C.archiveContact, { id, archived: !view.archived })}>
            {view.archived ? <ArchiveRestore /> : <Archive />} {view.archived ? "Restaurer" : "Archiver"}
          </Button>
        </div>
      </header>

      {view.overdueMissions.length ? (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {view.overdueMissions.length} mission(s) en retard : {view.overdueMissions.map((t) => t.title).join(", ")}.
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="apercu">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="activites">Activités ({realInteractions.length})</TabsTrigger>
          <TabsTrigger value="missions">Missions ({view.openMissions.length})</TabsTrigger>
          <TabsTrigger value="opportunites">Opportunités ({view.opportunities.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({c.links.length + quotes.length})</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="apercu">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Résumé de la relation</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {summary.map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <dt className="text-[11px] uppercase tracking-wide text-subtle">{k}</dt>
                      <dd className="text-fg">{v}</dd>
                    </div>
                  ))}
                  <div className="flex flex-col">
                    <dt className="text-[11px] uppercase tracking-wide text-subtle">État de suivi</dt>
                    <dd className="text-xs text-muted">{view.archived ? "Contact archivé." : FOLLOW_UP[view.followUp].explain}</dd>
                  </div>
                </dl>
                {c.notes ? <p className="mt-4 whitespace-pre-line rounded-lg bg-interactive/50 p-3 text-xs text-muted">{c.notes}</p> : null}
              </CardContent>
            </Card>
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Prochaines actions</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => openCreate("action", { ...refs, type: "followup" })}>
                    <Plus /> Planifier
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {view.openMissions.slice(0, 4).map((t) => (
                    <MissionLine key={t.id} task={t} today={today} showLinks={false} />
                  ))}
                  {!view.openMissions.length ? <p className="text-sm text-muted">Aucune action planifiée. Planifiez une relance pour garder le suivi à jour.</p> : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Dernières interactions</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setTab("activites")}>
                    Tout voir
                  </Button>
                </CardHeader>
                <CardContent>
                  <Timeline activities={view.interactions} limit={5} showContact={false} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="activites">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => openCreate("interaction", refs)}>
              <Plus /> Consigner une interaction
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              <Timeline activities={view.interactions} showContact={false} allowDelete />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missions">
          <div className="mb-3">
            <Button size="sm" variant="primary" onClick={() => openCreate("action", { ...refs, type: "call" })}>
              <Plus /> Nouvelle mission
            </Button>
          </div>
          <div className="space-y-2">
            {view.openMissions.map((t) => (
              <MissionLine key={t.id} task={t} today={today} showLinks={false} />
            ))}
            {!view.openMissions.length ? <p className="text-sm text-muted">Aucune mission ouverte.</p> : null}
          </div>
          {doneMissions.length ? (
            <>
              <h3 className="mb-2 mt-6 text-sm font-medium text-muted">Terminées et annulées ({doneMissions.length})</h3>
              <div className="space-y-2">
                {doneMissions.map((t) => (
                  <MissionLine key={t.id} task={t} today={today} showLinks={false} />
                ))}
              </div>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="opportunites">
          <div className="mb-3">
            <Button size="sm" variant="primary" onClick={() => openCreate("opportunity", { clientId: c.clientId, contactId: id })}>
              <Plus /> Nouvelle opportunité
            </Button>
          </div>
          <OppList title="Opportunités de ce contact" opps={ownOpps} onOpen={setDeal} />
          {companyOpps.length ? <OppList title={`Autres opportunités de ${view.company?.name ?? "l'entreprise"}`} opps={companyOpps} onOpen={setDeal} /> : null}
        </TabsContent>

        <TabsContent value="notes">
          <div className="mb-3">
            <Button size="sm" variant="primary" onClick={() => openCreate("note", refs)}>
              <Plus /> Ajouter une note
            </Button>
          </div>
          <NotesGrid notes={notes} />
        </TabsContent>

        <TabsContent value="documents">
          <Documents contactId={id} />
          {quotes.length ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium">Propositions commerciales</h3>
              <ul className="space-y-1 text-sm">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/crm/devis/${q.id}`} className="hover:underline">
                      Proposition {q.number}
                    </Link>{" "}
                    <span className="text-xs text-muted">du {formatDate(q.issueDate)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="historique">
          <Card>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                {audit.map((l) => (
                  <li key={l.id} className="flex flex-wrap gap-x-2">
                    <span className="text-xs text-muted">{formatDateTime(l.at)}</span>
                    <span className="text-xs text-subtle">{l.actor}</span>
                    <span className="text-fg">{AUDIT_LABELS[l.action] ?? l.action}</span>
                    {l.details ? <span className="text-xs text-muted">{l.details}</span> : null}
                  </li>
                ))}
                {view.interactions
                  .filter((a) => a.type === "stage_change")
                  .map((a) => (
                    <li key={a.id} className="flex flex-wrap gap-x-2">
                      <span className="text-xs text-muted">{formatDateTime(a.date)}</span>
                      <span className="text-fg">{a.subject}</span>
                    </li>
                  ))}
                <li className="flex gap-2">
                  <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                  <span className="text-fg">Fiche créée</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Button
            size="sm"
            variant="ghost"
            className="mt-4 text-danger"
            onClick={() =>
              confirm({
                title: `Supprimer définitivement ${view.name} ?`,
                description: "Préférez l'archivage. La suppression détache les opportunités, missions et interactions liées (elles sont conservées).",
                confirmLabel: "Supprimer",
                tone: "danger",
                action: () => {
                  const r = run(C.deleteContact, { id });
                  if (r.ok) router.push("/contacts");
                },
              })
            }
          >
            <Trash2 /> Supprimer le contact
          </Button>
        </TabsContent>
      </Tabs>

      <FormDialog open={editing} onOpenChange={setEditing} title={`Modifier ${view.name}`} wide>
        <ContactForm entity={c} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </FormDialog>
      {deal ? <OpportunityDialog id={deal} onClose={() => setDeal(null)} /> : null}
      {dialog}
    </div>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  "contact.create": "Contact créé",
  "contact.update": "Fiche modifiée",
  "contact.archive": "Contact archivé",
  "contact.restore": "Contact restauré",
  "contact.bulk": "Action groupée",
};

function OppList({ title, opps, onOpen }: { title: string; opps: Opportunity[]; onOpen: (id: string) => void }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {opps.length ? (
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          {opps.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onOpen(o.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-interactive/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{o.name}</p>
                  <p className="text-[11px] text-muted">
                    {STAGE_LABELS[o.stage]}
                    {o.closedAt ? ` · clôturée le ${formatDate(o.closedAt)}` : ` · clôture estimée ${formatDate(o.expectedCloseDate)}`}
                    {o.archivedAt ? " · archivée" : ""}
                  </p>
                </div>
                <StageBadge stage={o.stage} />
                <span className="shrink-0 text-sm tabular">{formatEUR(o.amount, { round: true })}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune opportunité.</p>
      )}
    </section>
  );
}

/** Liens documentaires (URL externes saisies par l'utilisateur ; aucun fichier n'est téléversé). */
function Documents({ contactId }: { contactId: string }) {
  const data = useData();
  const run = useCommand();
  const contact = data.contacts.find((c) => c.id === contactId)!;
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const r = run(C.addContactLink, { contactId, name, url });
          if (r.ok) {
            setName("");
            setUrl("");
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-name">Nom du document</Label>
          <Input id="doc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cahier des charges" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-url">Lien (https://…)</Label>
          <Input id="doc-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.exemple.example/…" required />
        </div>
        <Button type="submit" variant="secondary">
          <Link2 /> Ajouter le lien
        </Button>
      </form>
      <p className="text-[11px] text-subtle">Les documents sont référencés par lien : aucun fichier n&apos;est stocké par l&apos;application.</p>
      {contact.links.length ? (
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          {contact.links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <ExternalLink className="size-3.5 shrink-0 text-muted" /> <span className="truncate">{l.name}</span>
              </a>
              <span className="text-[11px] text-subtle">{formatDate(l.addedAt)}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Retirer ${l.name}`} onClick={() => run(C.removeContactLink, { contactId, linkId: l.id })}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucun document référencé.</p>
      )}
    </div>
  );
}
