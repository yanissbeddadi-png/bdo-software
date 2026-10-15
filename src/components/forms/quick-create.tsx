"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUiStore, type QuickCreateKind } from "@/lib/store/ui-store";
import * as F from "./entity-forms";

const TITLES: Record<QuickCreateKind, { title: string; description?: string; wide?: boolean }> = {
  client: { title: "Nouveau client" },
  contact: { title: "Nouveau contact" },
  lead: { title: "Nouveau prospect", description: "Les doublons évidents (même entreprise ou e-mail) sont refusés." },
  opportunity: { title: "Nouvelle opportunité", description: "Une opportunité n'est jamais comptée comme du chiffre d'affaires." },
  project: { title: "Nouveau projet", wide: true },
  task: { title: "Nouvelle tâche", wide: true },
  invoice: { title: "Nouvelle facture", description: "Les lignes issues du catalogue figent le prix au moment de la saisie.", wide: true },
  expense: { title: "Nouvelle dépense", wide: true },
  quote: { title: "Nouveau devis", wide: true },
  note: { title: "Nouvelle note" },
  goal: { title: "Nouvel objectif", wide: true },
  mission: { title: "Nouvelle mission personnalisée" },
  payment: { title: "Enregistrer un paiement", description: "Aucun paiement réel n'est traité : il s'agit d'une saisie de gestion." },
  activity: { title: "Nouvelle activité commerciale" },
  subscription: { title: "Nouvel abonnement / contrat récurrent" },
  product: { title: "Nouveau produit ou service" },
  employee: { title: "Nouveau collaborateur" },
};

/** Hôte unique des formulaires de création rapide (bouton « + Créer », actions rapides…). */
export function QuickCreateHost() {
  const create = useUiStore((s) => s.create);
  const close = useUiStore((s) => s.closeCreate);
  const router = useRouter();
  if (!create) return null;
  const meta = TITLES[create.kind];
  const props = { defaults: create.defaults, onCancel: close };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const form = (() => {
    switch (create.kind) {
      case "client":
        return <F.ClientForm {...props} onDone={(c) => go(`/clients/${c.id}`)} />;
      case "contact":
        return <F.ContactForm {...props} onDone={close} />;
      case "lead":
        return <F.LeadForm {...props} onDone={close} />;
      case "opportunity":
        return <F.OpportunityForm {...props} onDone={(o) => go(`/crm?focus=${o.id}`)} />;
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
      case "mission":
        return <F.MissionForm {...props} onDone={close} />;
      case "payment":
        return <F.PaymentForm {...props} onDone={close} />;
      case "activity":
        return <F.ActivityForm {...props} onDone={close} />;
      case "subscription":
        return <F.SubscriptionForm {...props} onDone={close} />;
      case "product":
        return <F.ProductForm {...props} onDone={close} />;
      case "employee":
        return <F.EmployeeForm {...props} onDone={close} />;
    }
  })();
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent title={meta.title} description={meta.description} wide={meta.wide}>
        {form}
      </DialogContent>
    </Dialog>
  );
}

/** Dialogue d'édition contrôlé, utilisé par les pages de module. */
export function FormDialog({ open, onOpenChange, title, description, wide, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; wide?: boolean; children: React.ReactNode }) {
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
