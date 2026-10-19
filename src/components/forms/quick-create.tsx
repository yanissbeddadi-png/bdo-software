"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUiStore, type QuickCreateKind } from "@/lib/store/ui-store";
import { useAppStore } from "@/lib/store/app-store";
import * as F from "./entity-forms";
import * as CRM from "./crm-forms";

const TITLES: Record<QuickCreateKind, { title: string; description?: string; wide?: boolean }> = {
  prospect: { title: "Nouveau contact / prospect", description: "Les doublons probables (même e-mail, ou même nom dans la même entreprise) sont signalés avant création.", wide: true },
  client: { title: "Nouvelle entreprise", wide: true },
  contact: { title: "Modifier le contact", wide: true },
  opportunity: { title: "Nouvelle opportunité", description: "Une opportunité n'est jamais comptée comme du chiffre d'affaires.", wide: true },
  interaction: { title: "Consigner une interaction", description: "Enregistre un échange qui a eu lieu. Aucun e-mail ni appel n'est émis par l'application.", wide: true },
  action: { title: "Planifier une action", description: "Rappel interne : la mission apparaît dans le centre d'action et le calendrier du CRM.", wide: true },
  complete: { title: "Terminer la mission", description: "Le résultat est ajouté à l'historique du contact. L'étape commerciale n'est pas modifiée.", wide: true },
  stage: { title: "Changer l'étape commerciale" },
  reschedule: { title: "Replanifier la mission" },
  note: { title: "Nouvelle note" },
  project: { title: "Nouveau projet", wide: true },
  task: { title: "Nouvelle tâche interne", wide: true },
  invoice: { title: "Nouvelle facture", description: "Les lignes issues du catalogue figent le prix au moment de la saisie.", wide: true },
  expense: { title: "Nouvelle dépense", wide: true },
  quote: { title: "Nouvelle proposition commerciale", wide: true },
  goal: { title: "Nouvel objectif", wide: true },
  challenge: { title: "Nouveau défi personnalisé" },
  payment: { title: "Enregistrer un paiement", description: "Aucun paiement réel n'est traité : il s'agit d'une saisie de gestion." },
  subscription: { title: "Nouvel abonnement / contrat récurrent" },
  product: { title: "Nouveau produit ou service" },
  employee: { title: "Nouveau collaborateur" },
};

/** Hôte unique des formulaires de création rapide et des dialogues d'action CRM. */
export function QuickCreateHost() {
  const create = useUiStore((s) => s.create);
  const close = useUiStore((s) => s.closeCreate);
  const data = useAppStore((s) => s.data);
  const router = useRouter();
  if (!create || !data) return null;
  const meta = TITLES[create.kind];
  const props = { defaults: create.defaults, onCancel: close };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const ref = (key: string) => (create.defaults?.[key] as string | undefined) ?? null;
  const task = data.tasks.find((t) => t.id === ref("taskId"));
  const opportunity = data.opportunities.find((o) => o.id === ref("opportunityId"));
  const contact = data.contacts.find((c) => c.id === ref("contactId"));
  const form = (() => {
    switch (create.kind) {
      case "prospect":
        return <CRM.ProspectForm {...props} onDone={(id) => go(`/contacts/${id}`)} />;
      case "client":
        return <F.ClientForm {...props} onDone={(c) => go(`/entreprises/${c.id}`)} />;
      case "contact":
        return contact ? <F.ContactForm {...props} entity={contact} onDone={close} /> : <CRM.ProspectForm {...props} onDone={(id) => go(`/contacts/${id}`)} />;
      case "opportunity":
        return <F.OpportunityForm {...props} onDone={(o) => go(`/pipeline?focus=${o.id}`)} />;
      case "interaction":
        return <CRM.InteractionForm {...props} onDone={close} />;
      case "action":
        return <CRM.ScheduleActionForm {...props} onDone={close} />;
      case "complete":
        return task ? <CRM.CompleteMissionForm task={task} onCancel={close} onDone={close} /> : <Missing />;
      case "reschedule":
        return task ? <CRM.RescheduleForm task={task} onCancel={close} onDone={close} /> : <Missing />;
      case "stage":
        return opportunity ? <CRM.StageChangeForm opportunity={opportunity} initialStage={create.defaults?.stage as never} onCancel={close} onDone={close} /> : <Missing />;
      case "project":
        return <F.ProjectForm {...props} onDone={(p) => go(`/projets/${p.id}`)} />;
      case "task":
        return <F.TaskForm {...props} onDone={close} />;
      case "invoice":
        return <F.InvoiceForm {...props} onDone={(i) => go(`/finances/factures/${i.id}`)} />;
      case "expense":
        return <F.ExpenseForm {...props} onDone={close} />;
      case "quote":
        return <F.QuoteForm {...props} onDone={(q) => go(`/crm/devis/${q.id}`)} />;
      case "note":
        return <F.NoteForm {...props} onDone={close} />;
      case "goal":
        return <F.GoalForm {...props} onDone={close} />;
      case "challenge":
        return <F.MissionForm {...props} onDone={close} />;
      case "payment":
        return <F.PaymentForm {...props} onDone={close} />;
      case "subscription":
        return <F.SubscriptionForm {...props} onDone={close} />;
      case "product":
        return <F.ProductForm {...props} onDone={close} />;
      case "employee":
        return <F.EmployeeForm {...props} onDone={close} />;
    }
  })();
  const title = create.kind === "complete" && task ? `Terminer : ${task.title}` : meta.title;
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent title={title} description={meta.description} wide={meta.wide}>
        {form}
      </DialogContent>
    </Dialog>
  );
}

function Missing() {
  return <p className="text-sm text-muted">Cet élément n&apos;existe plus (il a peut-être été supprimé).</p>;
}

/** Dialogue d'édition contrôlé, utilisé par les pages de module. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent title={title} description={description} wide={wide}>
          {children}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
