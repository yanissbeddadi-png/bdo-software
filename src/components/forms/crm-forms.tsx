"use client";
import * as React from "react";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import type { CrmTaskType, Opportunity, OpportunityStage, Task } from "@/lib/domain/types";
import * as C from "@/lib/domain/commands";
import { EntityForm, type FieldConfig } from "./entity-form";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { addDays } from "@/lib/calculations/dates";
import { STAGES } from "@/lib/calculations/pipeline";
import { RELATION, SOURCES, TASK_TYPE, TASK_TYPE_LABEL, LOGGABLE_ACTIVITY_TYPES, ACTIVITY_TYPE } from "@/lib/crm/model";
import { options, PRIORITY } from "@/lib/formatters/labels";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field } from "./entity-form";

/**
 * Formulaires du CRM. Chaque formulaire valide localement (Zod) puis appelle la commande
 * métier, qui revalide l'entrée. Les dates/heures sont celles saisies : aucune
 * synchronisation avec un agenda externe n'est effectuée.
 */

type Defaults = Record<string, unknown> | undefined;
const pick = <T,>(d: Defaults, key: string, fallback: T): T => (d && key in d && d[key] !== undefined ? (d[key] as T) : fallback);

const TYPE_OPTIONS = Object.entries(TASK_TYPE).map(([value, v]) => ({ value, label: v.label }));
const SOURCE_OPTIONS = SOURCES.map((s) => ({ value: s, label: s }));
const time = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Heure invalide (HH:mm)")
  .optional()
  .transform((v) => v || "");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export function useCrmOptions() {
  const data = useData();
  return React.useMemo(() => {
    const companies = new Map(data.clients.map((c) => [c.id, c.name]));
    return {
      companies: data.clients
        .filter((c) => c.relation !== "archived")
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .map((c) => ({ value: c.id, label: c.name })),
      contacts: data.contacts
        .filter((c) => !c.archivedAt)
        .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
        .map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.clientId ? ` — ${companies.get(c.clientId) ?? ""}` : ""}` })),
      opportunities: data.opportunities.filter((o) => !o.archivedAt).map((o) => ({ value: o.id, label: `${o.name}${o.clientId ? ` — ${companies.get(o.clientId) ?? ""}` : ""}` })),
      employees: data.employees.filter((e) => e.status !== "left").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
    };
  }, [data]);
}

/** Bloc « prochaine action » commun (mission planifiée à la suite). */
const nextActionFields = {
  planNext: z.boolean(),
  nextTitle: z.string().trim().max(200),
  nextType: z.string(),
  nextDate: z.string(),
  nextTime: time,
};
const refineNext = (v: { planNext: boolean; nextTitle: string; nextDate: string }, ctx: z.RefinementCtx) => {
  if (!v.planNext) return;
  if (!v.nextTitle.trim()) ctx.addIssue({ code: "custom", path: ["nextTitle"], message: "Décrivez la prochaine action" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.nextDate)) ctx.addIssue({ code: "custom", path: ["nextDate"], message: "Date invalide" });
};
type NextValues = { planNext: boolean; nextTitle: string; nextType: string; nextDate: string; nextTime: string };
const toNext = (v: NextValues) => (v.planNext ? { title: v.nextTitle.trim(), type: v.nextType as CrmTaskType, dueDate: v.nextDate, dueTime: v.nextTime || null } : null);
function nextFieldConfig<T extends NextValues>(planNext: boolean, onToggle: (v: boolean) => void, label = "Planifier la prochaine action"): FieldConfig<T>[] {
  return [
    {
      name: "planNext" as never,
      label: "Suite",
      type: "custom",
      span: 2,
      help: "Crée une mission datée : elle apparaîtra dans le centre d'action et le calendrier.",
      render: ({ value, onChange }) => (
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={Boolean(value)}
            onChange={(e) => {
              onChange(e.target.checked);
              onToggle(e.target.checked);
            }}
          />
          {label}
        </label>
      ),
    },
    { name: "nextTitle" as never, label: "Prochaine action", type: "text", hidden: !planNext, placeholder: "Ex. Relancer après envoi de la proposition" },
    { name: "nextType" as never, label: "Type", type: "select", options: TYPE_OPTIONS, hidden: !planNext },
    { name: "nextDate" as never, label: "Échéance", type: "date", hidden: !planNext },
    { name: "nextTime" as never, label: "Heure (facultatif)", type: "text", placeholder: "HH:mm", hidden: !planNext },
  ];
}

function DuplicateWarning({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning sm:col-span-2">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Doublon probable</p>
        <p className="text-fg/80">{message}</p>
        <p className="mt-1 text-muted">Aucune fusion automatique n&apos;est effectuée. Activez « Créer malgré le doublon » pour confirmer.</p>
      </div>
    </div>
  );
}

/* ----------------------------- Prospect / contact (création rapide) ----------------------------- */

const prospectFormSchema = z
  .object({
    firstName: z.string().trim().min(1, "Le prénom est obligatoire").max(100),
    lastName: z.string().trim().min(1, "Le nom est obligatoire").max(100),
    jobTitle: z.string().trim().max(100),
    email: z.string().trim().email("Adresse e-mail invalide").or(z.literal("")),
    phone: z.string().trim().max(40),
    clientId: z.string().nullable(),
    newCompanyName: z.string().trim().max(200),
    source: z.string(),
    ownerId: z.string().nullable(),
    relation: z.enum(["prospect", "customer", "former", "partner", "archived"]),
    priority: z.enum(["low", "normal", "high", "critical"]),
    stage: z.string(),
    opportunityName: z.string().trim().max(200),
    amount: z.number({ invalid_type_error: "Montant invalide" }).int().min(0),
    notes: z.string().trim().max(2000),
    confirmDuplicate: z.boolean(),
    ...nextActionFields,
  })
  .superRefine(refineNext);
type ProspectFormValues = z.infer<typeof prospectFormSchema>;

export function ProspectForm({ defaults, onDone, onCancel }: { defaults?: Defaults; onDone: (contactId: string) => void; onCancel?: () => void }) {
  const run = useCommand();
  const o = useCrmOptions();
  const today = useToday();
  const data = useData();
  const [duplicate, setDuplicate] = React.useState<string | null>(null);
  const [planNext, setPlanNext] = React.useState(true);
  const [withDeal, setWithDeal] = React.useState(pick<string>(defaults, "stage", "new") !== "");
  const fields: FieldConfig<ProspectFormValues>[] = [
    { name: "firstName", label: "Prénom", type: "text" },
    { name: "lastName", label: "Nom", type: "text" },
    { name: "jobTitle", label: "Fonction", type: "text" },
    { name: "email", label: "E-mail", type: "email", placeholder: "prenom.nom@exemple.example" },
    { name: "phone", label: "Téléphone", type: "text" },
    { name: "clientId", label: "Entreprise existante", type: "select", nullable: true, options: o.companies },
    { name: "newCompanyName", label: "ou nouvelle entreprise", type: "text", placeholder: "Nom de l'entreprise à créer" },
    { name: "relation", label: "Statut de relation", type: "select", options: options(RELATION).filter((r) => r.value !== "archived") },
    { name: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
    { name: "ownerId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    {
      name: "stage",
      label: "Étape commerciale",
      type: "custom",
      render: ({ value, onChange }) => (
        <NativeSelect
          aria-label="Étape commerciale"
          value={(value as string) ?? ""}
          onChange={(e) => {
            onChange(e.target.value);
            setWithDeal(e.target.value !== "");
          }}
        >
          <option value="">Aucune opportunité pour l&apos;instant</option>
          {STAGES.filter((s) => s.id !== "won" && s.id !== "lost").map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      ),
    },
    { name: "opportunityName", label: "Nom de l'opportunité", type: "text", hidden: !withDeal, placeholder: "Par défaut : « Projet — entreprise »" },
    { name: "amount", label: "Valeur estimée HT", type: "money", hidden: !withDeal },
    { name: "notes", label: "Note initiale", type: "textarea" },
    ...nextFieldConfig<ProspectFormValues>(planNext, setPlanNext),
    { name: "confirmDuplicate", label: "Créer malgré le doublon", type: "switch", hidden: !duplicate, span: 2 },
  ];
  return (
    <EntityForm<ProspectFormValues>
      schema={prospectFormSchema}
      defaultValues={{
        firstName: "",
        lastName: "",
        jobTitle: "",
        email: "",
        phone: "",
        clientId: pick(defaults, "clientId", null),
        newCompanyName: "",
        source: "Site web",
        ownerId: data.settings.user.employeeId ?? null,
        relation: pick(defaults, "relation", "prospect"),
        priority: "normal",
        stage: pick(defaults, "stage", "new"),
        opportunityName: "",
        amount: 0,
        notes: "",
        confirmDuplicate: false,
        planNext: true,
        nextTitle: "Premier appel de découverte",
        nextType: "call",
        nextDate: addDays(today, 1),
        nextTime: "",
      }}
      fields={fields}
      notice={duplicate ? <DuplicateWarning message={duplicate} /> : null}
      onCancel={onCancel}
      submitLabel="Créer le contact"
      onSubmit={(v) => {
        const res = run(C.createProspect, {
          firstName: v.firstName,
          lastName: v.lastName,
          jobTitle: v.jobTitle,
          email: v.email,
          phone: v.phone,
          clientId: v.newCompanyName.trim() ? null : v.clientId,
          newCompanyName: v.newCompanyName,
          source: v.source,
          ownerId: v.ownerId,
          relation: v.relation,
          priority: v.priority,
          stage: (v.stage || null) as OpportunityStage | null,
          opportunityName: v.opportunityName,
          amount: v.amount,
          notes: v.notes,
          nextAction: toNext(v),
          confirmDuplicate: v.confirmDuplicate,
        });
        if (!res.ok && res.fieldErrors.duplicate) setDuplicate(res.error);
        if (res.ok) onDone(res.result.contact.id);
        return res;
      }}
    />
  );
}

/* ----------------------------- Interaction ----------------------------- */

const interactionFormSchema = z
  .object({
    type: z.enum(["call", "email", "meeting", "demo", "message", "followup", "note"]),
    direction: z.enum(["in", "out"]),
    date: isoDate,
    time,
    subject: z.string().trim().min(1, "Le résumé est obligatoire").max(200),
    outcome: z.string().trim().max(500),
    notes: z.string().trim().max(2000),
    contactId: z.string().nullable(),
    opportunityId: z.string().nullable(),
    ...nextActionFields,
  })
  .superRefine(refineNext);
type InteractionFormValues = z.infer<typeof interactionFormSchema>;

/**
 * Consigner une interaction passée. Ne déclenche aucun envoi : l'application enregistre
 * ce qui a eu lieu (appel passé, e-mail envoyé depuis votre messagerie…).
 */
export function InteractionForm({ defaults, onDone, onCancel }: { defaults?: Defaults; onDone: () => void; onCancel?: () => void }) {
  const run = useCommand();
  const o = useCrmOptions();
  const today = useToday();
  const [planNext, setPlanNext] = React.useState(false);
  const taskId = pick<string | null>(defaults, "taskId", null);
  const fields: FieldConfig<InteractionFormValues>[] = [
    { name: "type", label: "Type", type: "select", options: LOGGABLE_ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_TYPE[t] })) },
    {
      name: "direction",
      label: "Sens",
      type: "select",
      options: [
        { value: "out", label: "Sortant (à l'initiative de l'équipe)" },
        { value: "in", label: "Entrant (le contact nous a sollicités)" },
      ],
      help: "Utilisé pour les appels, e-mails et messages.",
    },
    { name: "date", label: "Date", type: "date", help: "Une interaction est un fait passé : pas de date future." },
    { name: "time", label: "Heure (facultatif)", type: "text", placeholder: "HH:mm" },
    { name: "subject", label: "Résumé", type: "text", span: 2, placeholder: "Ex. Point d'avancement sur la proposition" },
    { name: "outcome", label: "Résultat", type: "text", span: 2, placeholder: "Ex. Intéressé, attend le chiffrage définitif" },
    { name: "contactId", label: "Contact", type: "select", nullable: true, options: o.contacts },
    { name: "opportunityId", label: "Opportunité", type: "select", nullable: true, options: o.opportunities },
    { name: "notes", label: "Compte rendu / note", type: "textarea" },
    ...nextFieldConfig<InteractionFormValues>(planNext, setPlanNext),
  ];
  return (
    <EntityForm<InteractionFormValues>
      schema={interactionFormSchema}
      defaultValues={{
        type: pick(defaults, "type", "call"),
        direction: "out",
        date: today,
        time: "",
        subject: pick(defaults, "subject", ""),
        outcome: "",
        notes: "",
        contactId: pick(defaults, "contactId", null),
        opportunityId: pick(defaults, "opportunityId", null),
        planNext: false,
        nextTitle: "Relance",
        nextType: "followup",
        nextDate: addDays(today, 3),
        nextTime: "",
      }}
      fields={fields}
      onCancel={onCancel}
      submitLabel={taskId ? "Consigner et terminer la mission" : "Consigner l'interaction"}
      onSubmit={(v) => {
        const date = v.time ? new Date(`${v.date}T${v.time}:00`).toISOString() : v.date;
        const res = run(C.logInteraction, {
          type: v.type,
          direction: v.direction,
          date,
          subject: v.subject,
          notes: v.notes,
          outcome: v.outcome,
          nextStep: v.planNext ? v.nextTitle : "",
          contactId: v.contactId,
          clientId: pick(defaults, "clientId", null),
          opportunityId: v.opportunityId,
          ownerId: null,
          taskId,
          followUp: toNext(v),
        });
        if (res.ok) onDone();
        return res;
      }}
    />
  );
}

/* ----------------------------- Action planifiée (mission CRM) ----------------------------- */

const scheduleFormSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  type: z.string(),
  dueDate: isoDate,
  dueTime: time,
  priority: z.enum(["low", "normal", "high", "critical"]),
  contactId: z.string().nullable(),
  clientId: z.string().nullable(),
  opportunityId: z.string().nullable(),
  description: z.string().trim().max(2000),
});
type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

/** Planifier une mission (relance, appel, rendez-vous…) — rappel interne uniquement. */
export function ScheduleActionForm({ defaults, onDone, onCancel }: { defaults?: Defaults; onDone: (t: Task) => void; onCancel?: () => void }) {
  const run = useCommand();
  const o = useCrmOptions();
  const today = useToday();
  const fields: FieldConfig<ScheduleFormValues>[] = [
    { name: "title", label: "Intitulé", type: "text", span: 2, placeholder: "Ex. Relancer Sophie sur la proposition" },
    { name: "type", label: "Type de mission", type: "select", options: TYPE_OPTIONS },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    { name: "dueDate", label: "Échéance", type: "date" },
    { name: "dueTime", label: "Heure (facultatif)", type: "text", placeholder: "HH:mm", help: "Rappel interne : aucun agenda externe n'est modifié." },
    { name: "contactId", label: "Contact", type: "select", nullable: true, options: o.contacts },
    { name: "clientId", label: "Entreprise", type: "select", nullable: true, options: o.companies },
    { name: "opportunityId", label: "Opportunité", type: "select", nullable: true, options: o.opportunities, span: 2 },
    { name: "description", label: "Description", type: "textarea" },
  ];
  const type = pick<string>(defaults, "type", "followup");
  return (
    <EntityForm<ScheduleFormValues>
      schema={scheduleFormSchema}
      defaultValues={{
        title: pick(defaults, "title", type === "followup" ? "Relance" : TASK_TYPE_LABEL[type as CrmTaskType]),
        type,
        dueDate: pick(defaults, "dueDate", addDays(today, type === "followup" ? 3 : 1)),
        dueTime: pick(defaults, "dueTime", ""),
        priority: pick(defaults, "priority", "normal"),
        contactId: pick(defaults, "contactId", null),
        clientId: pick(defaults, "clientId", null),
        opportunityId: pick(defaults, "opportunityId", null),
        description: "",
      }}
      fields={fields}
      onCancel={onCancel}
      submitLabel="Planifier"
      onSubmit={(v) => {
        const res = run(C.scheduleAction, { ...v, type: v.type as CrmTaskType, dueTime: v.dueTime || null });
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Terminer une mission ----------------------------- */

const completeFormSchema = z.object({ result: z.string().trim().max(500), note: z.string().trim().max(2000), ...nextActionFields }).superRefine(refineNext);
type CompleteFormValues = z.infer<typeof completeFormSchema>;

/** Terminer une mission : résultat, compte rendu et prochaine action proposée. */
export function CompleteMissionForm({ task, onDone, onCancel }: { task: Task; onDone: () => void; onCancel?: () => void }) {
  const run = useCommand();
  const today = useToday();
  const [planNext, setPlanNext] = React.useState(task.type !== "internal" && task.type !== "retention");
  const resultRequired = task.type === "meeting" || task.type === "call";
  const fields: FieldConfig<CompleteFormValues>[] = [
    {
      name: "result",
      label: resultRequired ? "Résultat (obligatoire)" : "Résultat",
      type: "text",
      span: 2,
      placeholder: task.type === "meeting" ? "Ex. Besoin confirmé, proposition attendue sous 10 jours" : "Ex. Joint, rappel convenu",
    },
    { name: "note", label: task.type === "meeting" ? "Compte rendu" : "Note", type: "textarea", help: "Enregistrée comme note sur la fiche du contact." },
    ...nextFieldConfig<CompleteFormValues>(planNext, setPlanNext, "Planifier la suite"),
  ];
  const suggestion: Record<string, [string, CrmTaskType, number]> = {
    meeting: ["Envoyer le compte rendu et la proposition", "proposal_send", 3],
    proposal_send: ["Relancer sur la proposition", "followup", 7],
    proposal_prep: ["Envoyer la proposition", "proposal_send", 2],
    call: ["Relance", "followup", 5],
    qualification: ["Planifier un rendez-vous de découverte", "meeting", 5],
  };
  const [title, nextType, delay] = suggestion[task.type] ?? ["Relance", "followup" as CrmTaskType, 7];
  return (
    <EntityForm<CompleteFormValues>
      schema={completeFormSchema.superRefine((v, ctx) => {
        if (resultRequired && !v.result.trim()) ctx.addIssue({ code: "custom", path: ["result"], message: "Indiquez le résultat de l'échange" });
      })}
      defaultValues={{ result: "", note: "", planNext, nextTitle: title, nextType, nextDate: addDays(today, delay), nextTime: "" }}
      fields={fields}
      onCancel={onCancel}
      submitLabel="Terminer la mission"
      onSubmit={(v) => {
        const res = run(C.completeMission, { id: task.id, result: v.result, note: v.note, followUp: toNext(v) });
        if (res.ok) onDone();
        return res;
      }}
    />
  );
}

/* ----------------------------- Changement d'étape ----------------------------- */

/**
 * Changement d'étape accessible (alternative au glisser-déposer). Une affaire n'est
 * jamais marquée gagnée ou perdue automatiquement : c'est toujours ce choix explicite.
 */
export function StageChangeForm({ opportunity, initialStage, onDone, onCancel }: { opportunity: Opportunity; initialStage?: OpportunityStage; onDone: () => void; onCancel?: () => void }) {
  const run = useCommand();
  const [stage, setStage] = React.useState<OpportunityStage>(initialStage ?? opportunity.stage);
  const [reason, setReason] = React.useState("");
  const id = React.useId();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const res = run(C.moveOpportunity, { id: opportunity.id, stage, lostReason: stage === "lost" ? reason.trim() || undefined : undefined });
        if (res.ok) onDone();
      }}
    >
      <Field label="Nouvelle étape" htmlFor={`${id}-stage`}>
        <NativeSelect id={`${id}-stage`} value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {stage === "won" ? (
        <p className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          L&apos;entreprise et le contact passeront au statut « Client actif ». La conversion rapporte de l&apos;XP une seule fois par opportunité.
        </p>
      ) : null}
      {stage === "lost" ? (
        <Field label="Motif de perte" htmlFor={`${id}-reason`} help="Facultatif, mais utile pour les statistiques.">
          <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. Budget reporté à l'an prochain" />
        </Field>
      ) : null}
      <DialogFooter>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={stage === opportunity.stage}>
          Changer l&apos;étape
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ----------------------------- Replanifier ----------------------------- */

export function RescheduleForm({ task, onDone, onCancel }: { task: Task; onDone: () => void; onCancel?: () => void }) {
  const run = useCommand();
  const today = useToday();
  const [date, setDate] = React.useState(task.dueDate && task.dueDate >= today ? task.dueDate : addDays(today, 1));
  const [hour, setHour] = React.useState(task.dueTime ?? "");
  const id = React.useId();
  const invalid = !!hour && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hour);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        const res = run(C.rescheduleMission, { id: task.id, dueDate: date, dueTime: hour || null });
        if (res.ok) onDone();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-d`}>Nouvelle échéance</Label>
        <Input id={`${id}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-h`}>Heure (facultatif)</Label>
        <Input id={`${id}-h`} value={hour} onChange={(e) => setHour(e.target.value)} placeholder="HH:mm" aria-invalid={invalid} />
        {invalid ? <p className="text-xs text-danger">Heure invalide (HH:mm)</p> : null}
      </div>
      <DialogFooter className="sm:col-span-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" variant="primary">
          Replanifier
        </Button>
      </DialogFooter>
    </form>
  );
}
