"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck, Copy, EyeOff, Loader2, Mail, Sparkles, Undo2 } from "lucide-react";
import type { ISODate } from "@/lib/domain/types";
import * as C from "@/lib/domain/commands";
import { useCommand, useData } from "@/lib/store/hooks";
import { aiImproveDraft, type AiStatus } from "@/lib/ai/actions";
import { addWorkingDays } from "@/lib/assistant/briefing";
import type { Draft } from "@/lib/assistant/drafts";
import { SITUATION_LABEL, mailtoHref } from "@/lib/assistant/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/formatters";

/** Styles de réécriture proposés (mêmes clés que `REWRITE_STYLES`, côté serveur). */
export const AI_STYLES: { value: "improve" | "shorter" | "warmer" | "formal"; label: string }[] = [
  { value: "improve", label: "Améliorer la clarté" },
  { value: "shorter", label: "Raccourcir" },
  { value: "warmer", label: "Ton plus chaleureux" },
  { value: "formal", label: "Ton plus formel" },
];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Brouillon de relance à valider : rien ne part sans l'utilisateur. Il l'ouvre dans sa
 * messagerie (ou le copie), puis consigne l'envoi dans le CRM, ce qui termine la relance
 * planifiée et peut en programmer une nouvelle.
 */
export function DraftCard({ draft, today, ai, onIgnore }: { draft: Draft; today: ISODate; ai: AiStatus | null; onIgnore: () => void }) {
  const data = useData();
  const run = useCommand();
  const id = React.useId();
  const [to, setTo] = React.useState(draft.email);
  const [subject, setSubject] = React.useState(draft.subject);
  const [body, setBody] = React.useState(draft.body);
  const [previous, setPrevious] = React.useState<{ subject: string; body: string } | null>(null);
  const [style, setStyle] = React.useState<(typeof AI_STYLES)[number]["value"]>("improve");
  const [instruction, setInstruction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [logging, setLogging] = React.useState(false);
  const [planFollowUp, setPlanFollowUp] = React.useState(true);
  const [days, setDays] = React.useState(3);
  const followUpDate = addWorkingDays(today, days, data.settings.crm.workingDays);
  const validDays = Number.isInteger(days) && days >= 1 && days <= 60;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`);
      toast.success("Brouillon copié dans le presse-papiers.");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte et copiez-le manuellement.");
    }
  };

  const improve = async () => {
    setBusy(true);
    try {
      const r = await aiImproveDraft({ subject, body, style, instruction });
      if (r.ok) {
        setPrevious({ subject, body });
        setSubject(r.subject);
        setBody(r.body);
        toast.success("Brouillon réécrit par l'IA : relisez-le avant de l'envoyer.");
      } else toast.error(r.error);
    } catch {
      toast.error("L'IA n'a pas pu traiter la demande : vérifiez votre connexion.");
    } finally {
      setBusy(false);
    }
  };

  const logSend = () => {
    if (planFollowUp && !validDays) return;
    const res = run(C.logInteraction, {
      type: "email",
      direction: "out",
      date: today,
      subject: clip(subject.trim() || "E-mail envoyé", 200),
      notes: clip(body.trim(), 2000),
      outcome: "",
      nextStep: "",
      contactId: draft.contactId,
      clientId: null,
      opportunityId: draft.opportunityId,
      ownerId: null,
      taskId: draft.taskId,
      followUp: planFollowUp ? { title: clip(`Relancer ${draft.contactName}`, 200), type: "followup", dueDate: followUpDate, dueTime: null } : null,
    });
    if (res.ok) onIgnore();
  };

  return (
    <li className="rounded-xl border border-border bg-card p-4" data-draft={draft.key}>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/contacts/${draft.contactId}`} className="text-sm font-medium text-fg hover:underline">
          {draft.contactName}
        </Link>
        {draft.companyName ? <span className="text-xs text-muted">{draft.companyName}</span> : null}
        <Badge tone="violet">{SITUATION_LABEL[draft.situation]}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted">
        <span className="text-subtle">Pourquoi : </span>
        {draft.reason}
      </p>
      <div className="grid gap-3">
        <div>
          <Label htmlFor={`${id}-to`}>Destinataire</Label>
          <Input id={`${id}-to`} type="email" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor={`${id}-subject`}>Objet</Label>
          <Input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className="mt-1" />
        </div>
        <div>
          <Label htmlFor={`${id}-body`}>Message</Label>
          <Textarea id={`${id}-body`} value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="mt-1 font-[inherit]" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="primary">
          <a href={mailtoHref(to, subject, body)} title="Ouvre votre messagerie avec ce brouillon : l'application n'envoie rien elle-même.">
            <Mail /> Ouvrir dans ma messagerie
          </a>
        </Button>
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy /> Copier
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setLogging((v) => !v)} aria-expanded={logging} aria-controls={`${id}-log`}>
          <CalendarCheck /> Consigner l&apos;envoi
        </Button>
        <Button size="sm" variant="ghost" onClick={onIgnore}>
          <EyeOff /> Ignorer pour aujourd&apos;hui
        </Button>
      </div>

      {logging ? (
        <div id={`${id}-log`} className="mt-3 space-y-2 rounded-lg border border-border bg-bg-elevated p-3 text-sm">
          <p className="text-xs text-muted">
            Enregistre un e-mail sortant daté d&apos;aujourd&apos;hui dans l&apos;historique du contact
            {draft.taskId ? " et termine la relance planifiée correspondante" : ""}. À faire une fois le message réellement envoyé depuis votre messagerie.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={planFollowUp} onChange={(e) => setPlanFollowUp(e.target.checked)} />
              Planifier une relance dans
            </label>
            <Input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Math.round(Number(e.target.value)))}
              disabled={!planFollowUp}
              aria-label="Nombre de jours ouvrés avant la relance"
              aria-invalid={planFollowUp && !validDays}
              className="h-8 w-16 text-xs"
            />
            <span className="text-xs text-muted">jours ouvrés{planFollowUp && validDays ? ` (le ${formatDate(followUpDate, "EEEE d MMMM")})` : ""}</span>
          </div>
          {planFollowUp && !validDays ? <p className="text-xs text-danger">Indiquez un nombre de jours entre 1 et 60.</p> : null}
          <div className="flex gap-2">
            <Button size="sm" variant="success" onClick={logSend} disabled={planFollowUp && !validDays}>
              Confirmer l&apos;envoi
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLogging(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 border-t border-border pt-3">
        {ai?.available ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={`${id}-style`}>Réécriture</Label>
              <NativeSelect id={`${id}-style`} value={style} onChange={(e) => setStyle(e.target.value as typeof style)} className="mt-1 h-8 w-auto text-xs">
                {AI_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-48 flex-1">
              <Label htmlFor={`${id}-instruction`}>Consigne (facultatif)</Label>
              <Input id={`${id}-instruction`} value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={300} placeholder="Ex. : proposer un rendez-vous jeudi" className="mt-1 h-8 text-xs" />
            </div>
            <Button size="sm" variant="secondary" onClick={improve} disabled={busy || !body.trim()} aria-busy={busy}>
              {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />} Améliorer avec l&apos;IA
            </Button>
            {previous ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSubject(previous.subject);
                  setBody(previous.body);
                  setPrevious(null);
                }}
              >
                <Undo2 /> Revenir au texte précédent
              </Button>
            ) : null}
            <p className="w-full text-[11px] text-subtle">L&apos;objet et le message sont envoyés à Anthropic (Claude) pour la réécriture. Relisez toujours le résultat.</p>
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-[11px] text-subtle">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {ai ? ai.reason : "Vérification de la disponibilité de l'IA générative…"}
          </p>
        )}
      </div>
    </li>
  );
}
