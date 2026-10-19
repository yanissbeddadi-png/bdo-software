"use client";
import * as React from "react";
import type { Client, Contact, Employee, Expense, Goal, Invoice, Note, Opportunity, Product, Project, Quote, Subscription, Task } from "@/lib/domain/types";
import * as C from "@/lib/domain/commands";
import * as S from "@/lib/validation/schemas";
import { EntityForm, type FieldConfig } from "./entity-form";
import { useCommand, useData, useSummaries, useToday } from "@/lib/store/hooks";
import { addDays } from "@/lib/calculations/dates";
import { STAGES } from "@/lib/calculations/pipeline";
import { EXPENSE_CATEGORY_LABELS, PRODUCT_TYPE_LABELS } from "@/lib/calculations/finance";
import { creditableAmount } from "@/lib/calculations/invoices";
import { GOAL_METRICS } from "@/lib/calculations/goals";
import { MISSION_CATEGORY_LABELS, MISSION_DIFFICULTY_LABELS, MISSION_TYPE_LABELS } from "@/lib/gamification/missions";
import { BILLING_MODE, CLIENT_STATUS, COMPLEXITY, DEPARTMENT, GOAL_TYPE, options, PAYMENT_METHOD, PRIORITY, PROJECT_STATUS, SKILL, SUBSCRIPTION_STATUS, TASK_STATUS } from "@/lib/formatters/labels";
import { formatEUR } from "@/lib/formatters";
import { newId } from "@/lib/domain/ids";
import { Input, NativeSelect } from "@/components/ui/input";
import { z } from "zod";
import { COMPANY_SIZES, RELATION, SOURCES, TASK_TYPE_LABEL } from "@/lib/crm/model";

type Done<T> = (result: T) => void;
interface FormProps<E, R = E> {
  entity?: E;
  defaults?: Record<string, unknown>;
  onDone: Done<R>;
  onCancel?: () => void;
}

function useOptions() {
  const data = useData();
  return React.useMemo(
    () => ({
      clients: [...data.clients].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((c) => ({ value: c.id, label: c.name })),
      activeClients: data.clients
        .filter((c) => c.status !== "churned")
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .map((c) => ({ value: c.id, label: c.name })),
      employees: data.employees.filter((e) => e.status !== "left").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
      projects: data.projects.filter((p) => p.status !== "cancelled").map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
      contacts: data.contacts.filter((c) => !c.archivedAt).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
      opportunities: data.opportunities.map((o) => ({ value: o.id, label: o.name })),
      products: data.products.filter((p) => p.status === "active").map((p) => ({ value: p.id, label: p.name })),
      goals: data.goals.filter((g) => !g.archived).map((g) => ({ value: g.id, label: g.title })),
      vat: data.settings.company.vatRates.map((r) => ({ value: String(r.rate), label: `${r.label} (${r.rate / 100} %)` })),
    }),
    [data],
  );
}

function pick<T>(defaults: Record<string, unknown> | undefined, key: string, fallback: T): T {
  return (defaults && key in defaults ? (defaults[key] as T) : fallback) as T;
}

/* ----------------------------- Client ----------------------------- */

export function ClientForm({ entity, defaults, onDone, onCancel }: FormProps<Client>) {
  const run = useCommand();
  const o = useOptions();
  const fields: FieldConfig<S.ClientInput>[] = [
    { name: "name", label: "Raison sociale", type: "text", span: 2 },
    { name: "relation", label: "Relation", type: "select", options: options(RELATION) },
    { name: "status", label: "Statut du compte", type: "select", options: options(CLIENT_STATUS) },
    { name: "sector", label: "Secteur", type: "text" },
    { name: "size", label: "Taille", type: "select", nullable: true, options: COMPANY_SIZES.map((v) => ({ value: v, label: `${v} salariés` })) },
    { name: "city", label: "Ville", type: "text" },
    { name: "country", label: "Pays", type: "text" },
    { name: "website", label: "Site web", type: "text", placeholder: "https://…" },
    { name: "source", label: "Source", type: "select", options: SOURCES.map((v) => ({ value: v, label: v })) },
    { name: "ownerId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    { name: "satisfaction", label: "Satisfaction (1–5)", type: "rating" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <EntityForm<S.ClientInput>
      schema={S.clientSchema.extend({ size: S.clientSchema.shape.size.nullable().transform((v) => v ?? "") })}
      defaultValues={
        entity
          ? {
              name: entity.name,
              sector: entity.sector,
              status: entity.status,
              relation: entity.relation,
              size: entity.size,
              city: entity.city,
              country: entity.country,
              website: entity.website,
              ownerId: entity.ownerId,
              source: entity.source,
              satisfaction: entity.satisfaction,
              notes: entity.notes,
            }
          : {
              name: "",
              sector: "",
              status: "active",
              relation: pick(defaults, "relation", "prospect"),
              size: "",
              city: "",
              country: "France",
              website: "",
              ownerId: null,
              source: "Site web",
              satisfaction: null,
              notes: "",
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Créer l'entreprise"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateClient, { id: entity.id, values }) : run(C.createClient, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Contact ----------------------------- */

/** Modification d'un contact (la création passe par `ProspectForm`, avec détection des doublons). */
export function ContactForm({ entity, defaults, onDone, onCancel }: FormProps<Contact>) {
  const run = useCommand();
  const o = useOptions();
  const [duplicate, setDuplicate] = React.useState<string | null>(null);
  const fields: FieldConfig<S.ContactInput & { confirmDuplicate: boolean }>[] = [
    { name: "firstName", label: "Prénom", type: "text" },
    { name: "lastName", label: "Nom", type: "text" },
    { name: "jobTitle", label: "Fonction", type: "text" },
    { name: "clientId", label: "Entreprise", type: "select", nullable: true, options: o.clients },
    { name: "email", label: "E-mail", type: "email", placeholder: "prenom.nom@exemple.example" },
    { name: "phone", label: "Téléphone", type: "text" },
    { name: "relation", label: "Statut de relation", type: "select", options: options(RELATION) },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    { name: "source", label: "Source", type: "select", options: SOURCES.map((v) => ({ value: v, label: v })) },
    { name: "ownerId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    { name: "isPrimary", label: "Contact principal de l'entreprise", type: "switch" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "confirmDuplicate", label: "Enregistrer malgré le doublon", type: "switch", hidden: !duplicate, span: 2 },
  ];
  return (
    <EntityForm<S.ContactInput & { confirmDuplicate: boolean }>
      schema={S.contactSchema.extend({ confirmDuplicate: z.boolean() })}
      defaultValues={
        entity
          ? {
              clientId: entity.clientId,
              firstName: entity.firstName,
              lastName: entity.lastName,
              jobTitle: entity.jobTitle,
              email: entity.email,
              phone: entity.phone,
              relation: entity.relation,
              priority: entity.priority,
              source: entity.source,
              ownerId: entity.ownerId,
              isPrimary: entity.isPrimary,
              notes: entity.notes,
              confirmDuplicate: false,
            }
          : {
              clientId: pick(defaults, "clientId", null),
              firstName: "",
              lastName: "",
              jobTitle: "",
              email: "",
              phone: "",
              relation: pick(defaults, "relation", "prospect"),
              priority: "normal",
              source: "Site web",
              ownerId: null,
              isPrimary: false,
              notes: "",
              confirmDuplicate: false,
            }
      }
      fields={fields}
      notice={
        duplicate ? (
          <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning sm:col-span-2">
            Doublon probable : {duplicate} Aucune fusion automatique n&apos;est effectuée.
          </p>
        ) : null
      }
      onCancel={onCancel}
      onSubmit={({ confirmDuplicate, ...values }) => {
        const res = entity ? run(C.updateContact, { id: entity.id, values, confirmDuplicate }) : run(C.createContact, { ...values, confirmDuplicate });
        if (!res.ok && res.fieldErrors.duplicate) setDuplicate(res.error);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Opportunité ----------------------------- */

export function OpportunityForm({ entity, defaults, onDone, onCancel }: FormProps<Opportunity>) {
  const run = useCommand();
  const o = useOptions();
  const data = useData();
  const today = useToday();
  const fields: FieldConfig<S.OpportunityInput>[] = [
    { name: "name", label: "Nom de l'opportunité", type: "text", span: 2 },
    { name: "clientId", label: "Entreprise", type: "select", nullable: true, options: o.clients },
    { name: "contactId", label: "Contact principal", type: "select", nullable: true, options: o.contacts },
    { name: "amount", label: "Valeur estimée HT", type: "money" },
    { name: "probability", label: "Probabilité (%)", type: "number", min: 0, max: 100 },
    { name: "stage", label: "Étape", type: "select", options: STAGES.map((s) => ({ value: s.id, label: s.label })) },
    { name: "expectedCloseDate", label: "Clôture estimée", type: "date" },
    {
      name: "source",
      label: "Source",
      type: "select",
      options: SOURCES.map((v) => ({ value: v, label: v })),
    },
    { name: "ownerId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <EntityForm<S.OpportunityInput>
      schema={S.opportunitySchema}
      defaultValues={
        entity
          ? {
              name: entity.name,
              clientId: entity.clientId,
              leadId: entity.leadId,
              contactId: entity.contactId,
              amount: entity.amount,
              probability: entity.probability,
              stage: entity.stage,
              expectedCloseDate: entity.expectedCloseDate,
              source: entity.source,
              ownerId: entity.ownerId,
              priority: entity.priority,
              nextAction: entity.nextAction,
              notes: entity.notes,
            }
          : {
              name: "",
              clientId: pick(defaults, "clientId", null),
              leadId: null,
              contactId: pick(defaults, "contactId", null),
              amount: 0,
              probability: 5,
              stage: pick(defaults, "stage", "new"),
              expectedCloseDate: addDays(today, 45),
              source: "Site web",
              ownerId: data.settings.user.employeeId ?? null,
              priority: "normal",
              nextAction: "",
              notes: "",
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Créer l'opportunité"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateOpportunity, { id: entity.id, values }) : run(C.createOpportunity, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Produit ----------------------------- */

export function ProductForm({ entity, onDone, onCancel }: FormProps<Product>) {
  const run = useCommand();
  const o = useOptions();
  const fields: FieldConfig<S.ProductInput>[] = [
    { name: "name", label: "Nom", type: "text" },
    { name: "sku", label: "Référence", type: "text" },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: Object.entries(PRODUCT_TYPE_LABELS)
        .filter(([k]) => k !== "other")
        .map(([value, label]) => ({ value, label })),
    },
    { name: "category", label: "Catégorie", type: "text" },
    { name: "unitPrice", label: "Prix de vente HT", type: "money" },
    { name: "unitCost", label: "Coût estimé", type: "money" },
    { name: "billingMode", label: "Mode de facturation", type: "select", options: options(BILLING_MODE) },
    {
      name: "vatRate",
      label: "TVA par défaut",
      type: "custom",
      render: ({ value, onChange }) => (
        <NativeSelect value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {o.vat.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      ),
    },
    {
      name: "status",
      label: "Statut",
      type: "select",
      options: [
        { value: "active", label: "Actif" },
        { value: "archived", label: "Archivé" },
      ],
    },
    { name: "description", label: "Description", type: "textarea" },
  ];
  return (
    <EntityForm<S.ProductInput>
      schema={S.productSchema}
      defaultValues={
        entity
          ? {
              name: entity.name,
              sku: entity.sku,
              description: entity.description,
              type: entity.type,
              category: entity.category,
              unitPrice: entity.unitPrice,
              unitCost: entity.unitCost,
              billingMode: entity.billingMode,
              vatRate: entity.vatRate,
              status: entity.status,
            }
          : { name: "", sku: "", description: "", type: "saas", category: "", unitPrice: 0, unitCost: 0, billingMode: "monthly", vatRate: 2000, status: "active" }
      }
      fields={fields}
      onCancel={onCancel}
      onSubmit={(values) => {
        const res = entity ? run(C.updateProduct, { id: entity.id, values }) : run(C.createProduct, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Devis ----------------------------- */

export function QuoteForm({ entity, defaults, onDone, onCancel }: FormProps<Quote>) {
  const run = useCommand();
  const o = useOptions();
  const today = useToday();
  const fields: FieldConfig<S.QuoteInput>[] = [
    { name: "clientId", label: "Client", type: "select", options: o.activeClients },
    { name: "opportunityId", label: "Opportunité liée", type: "select", nullable: true, options: o.opportunities },
    { name: "issueDate", label: "Date du devis", type: "date" },
    { name: "expiryDate", label: "Date d'expiration", type: "date" },
    { name: "items", label: "Lignes", type: "lines" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <EntityForm<S.QuoteInput>
      schema={S.quoteSchema}
      defaultValues={
        entity
          ? { clientId: entity.clientId, opportunityId: entity.opportunityId, issueDate: entity.issueDate, expiryDate: entity.expiryDate, items: entity.items, notes: entity.notes }
          : {
              clientId: pick(defaults, "clientId", ""),
              opportunityId: pick(defaults, "opportunityId", null),
              issueDate: today,
              expiryDate: addDays(today, 30),
              items: [{ id: newId("li"), productId: null, description: "", quantity: 1, unitPrice: 0, vatRate: 2000 }],
              notes: "",
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Créer le devis"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateQuote, { id: entity.id, values }) : run(C.createQuote, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Facture ----------------------------- */

export function InvoiceForm({ entity, defaults, onDone, onCancel }: FormProps<Invoice>) {
  const run = useCommand();
  const o = useOptions();
  const today = useToday();
  const locked = entity && entity.baseStatus !== "draft";
  const fields: FieldConfig<S.InvoiceInput>[] = [
    { name: "clientId", label: "Client", type: "select", options: o.activeClients, hidden: locked },
    { name: "projectId", label: "Projet associé", type: "select", nullable: true, options: o.projects },
    { name: "issueDate", label: "Date d'émission", type: "date", hidden: locked },
    { name: "dueDate", label: "Date d'échéance", type: "date" },
    { name: "items", label: "Lignes de facturation", type: "lines", hidden: locked },
    { name: "issue", label: "Émettre immédiatement", type: "switch", hidden: Boolean(entity), help: "Sinon, la facture est enregistrée en brouillon (numéro attribué à l'émission)." },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <EntityForm<S.InvoiceInput>
      schema={S.invoiceSchema}
      defaultValues={
        entity
          ? { clientId: entity.clientId, issueDate: entity.issueDate, dueDate: entity.dueDate, items: entity.items, projectId: entity.projectId, notes: entity.notes, issue: false }
          : {
              clientId: pick(defaults, "clientId", ""),
              issueDate: today,
              dueDate: addDays(today, 30),
              items: [{ id: newId("li"), productId: null, description: "", quantity: 1, unitPrice: 0, vatRate: 2000 }],
              projectId: pick(defaults, "projectId", null),
              notes: "",
              issue: true,
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Créer la facture"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateInvoice, { id: entity.id, values }) : run(C.createInvoice, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Paiement ----------------------------- */

export function PaymentForm({ defaults, onDone, onCancel }: FormProps<unknown>) {
  const run = useCommand();
  const today = useToday();
  const summaries = useSummaries();
  const data = useData();
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const open = summaries.filter((s) => s.balance > 0);
  const invoiceId = pick<string>(defaults, "invoiceId", open[0]?.invoice.id ?? "");
  const balance = summaries.find((s) => s.invoice.id === invoiceId)?.balance ?? 0;
  const fields: FieldConfig<S.PaymentInput>[] = [
    {
      name: "invoiceId",
      label: "Facture",
      type: "select",
      span: 2,
      options: open.map((s) => ({ value: s.invoice.id, label: `${s.invoice.number} · ${clients.get(s.invoice.clientId)} · reste ${formatEUR(s.balance)}` })),
    },
    { name: "date", label: "Date de paiement", type: "date" },
    { name: "amount", label: "Montant reçu", type: "money", help: "Ne peut pas dépasser le solde restant." },
    { name: "method", label: "Moyen de paiement", type: "select", options: options(PAYMENT_METHOD) },
    { name: "reference", label: "Référence", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  if (!open.length) return <p className="text-sm text-muted">Aucune facture émise ne présente de solde à encaisser.</p>;
  return (
    <EntityForm<S.PaymentInput>
      schema={S.paymentSchema}
      defaultValues={{ invoiceId, date: today, amount: balance, method: "transfer", reference: "", notes: "" }}
      fields={fields}
      onCancel={onCancel}
      submitLabel="Enregistrer le paiement"
      onSubmit={(values) => {
        const res = run(C.recordPayment, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Dépense ----------------------------- */

export function ExpenseForm({ entity, defaults, onDone, onCancel }: FormProps<Expense>) {
  const run = useCommand();
  const o = useOptions();
  const today = useToday();
  const fields: FieldConfig<S.ExpenseInput>[] = [
    { name: "label", label: "Libellé", type: "text", span: 2 },
    { name: "supplier", label: "Fournisseur", type: "text" },
    { name: "category", label: "Catégorie", type: "select", options: Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "date", label: "Date", type: "date" },
    { name: "dueDate", label: "Échéance", type: "date" },
    { name: "amountHT", label: "Montant HT", type: "money" },
    {
      name: "vatRate",
      label: "TVA",
      type: "custom",
      render: ({ value, onChange }) => (
        <NativeSelect value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {o.vat.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      ),
    },
    { name: "paid", label: "Déjà payée", type: "switch" },
    { name: "paidDate", label: "Date de paiement", type: "date", nullable: true },
    { name: "projectId", label: "Projet associé", type: "select", nullable: true, options: o.projects },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <EntityForm<S.ExpenseInput>
      schema={S.expenseSchema}
      defaultValues={
        entity
          ? {
              label: entity.label,
              supplier: entity.supplier,
              category: entity.category,
              date: entity.date,
              amountHT: entity.amountHT,
              vatRate: entity.vatRate,
              paid: entity.paid,
              paidDate: entity.paidDate,
              dueDate: entity.dueDate,
              projectId: entity.projectId,
              notes: entity.notes,
            }
          : {
              label: "",
              supplier: "",
              category: "misc",
              date: today,
              amountHT: 0,
              vatRate: 2000,
              paid: false,
              paidDate: null,
              dueDate: addDays(today, 30),
              projectId: pick(defaults, "projectId", null),
              notes: "",
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Enregistrer la dépense"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateExpense, { id: entity.id, values }) : run(C.createExpense, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Abonnement ----------------------------- */

export function SubscriptionForm({ entity, defaults, onDone, onCancel }: FormProps<Subscription>) {
  const run = useCommand();
  const o = useOptions();
  const today = useToday();
  const fields: FieldConfig<S.SubscriptionInput>[] = [
    { name: "clientId", label: "Client", type: "select", options: o.activeClients },
    { name: "productId", label: "Offre du catalogue", type: "select", nullable: true, options: o.products },
    { name: "offer", label: "Libellé de l'offre", type: "text", span: 2 },
    { name: "amount", label: "Montant HT par période", type: "money" },
    {
      name: "periodicity",
      label: "Périodicité",
      type: "select",
      options: [
        { value: "monthly", label: "Mensuelle" },
        { value: "quarterly", label: "Trimestrielle" },
        { value: "yearly", label: "Annuelle" },
      ],
    },
    { name: "startDate", label: "Date de début", type: "date" },
    { name: "endDate", label: "Date de fin (optionnelle)", type: "date", nullable: true },
    { name: "status", label: "Statut", type: "select", options: options(SUBSCRIPTION_STATUS) },
    { name: "renewalTerms", label: "Conditions de renouvellement", type: "text" },
  ];
  return (
    <EntityForm<S.SubscriptionInput>
      schema={S.subscriptionSchema}
      defaultValues={
        entity
          ? {
              clientId: entity.clientId,
              productId: entity.productId,
              offer: entity.offer,
              amount: entity.amount,
              periodicity: entity.periodicity,
              startDate: entity.startDate,
              endDate: entity.endDate,
              status: entity.status,
              renewalTerms: entity.renewalTerms,
            }
          : {
              clientId: pick(defaults, "clientId", ""),
              productId: null,
              offer: "",
              amount: 0,
              periodicity: "monthly",
              startDate: today,
              endDate: null,
              status: "active",
              renewalTerms: "Tacite reconduction annuelle, préavis 2 mois",
            }
      }
      fields={fields}
      onCancel={onCancel}
      onSubmit={(values) => {
        const res = entity ? run(C.updateSubscription, { id: entity.id, values }) : run(C.createSubscription, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Projet ----------------------------- */

export function ProjectForm({ entity, defaults, onDone, onCancel }: FormProps<Project>) {
  const run = useCommand();
  const o = useOptions();
  const today = useToday();
  const fields: FieldConfig<S.ProjectInput>[] = [
    { name: "name", label: "Nom du projet", type: "text", span: 2 },
    { name: "clientId", label: "Client", type: "select", options: o.activeClients },
    { name: "opportunityId", label: "Opportunité gagnée", type: "select", nullable: true, options: o.opportunities },
    { name: "managerId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    { name: "startDate", label: "Début", type: "date" },
    { name: "dueDate", label: "Échéance", type: "date" },
    { name: "salePrice", label: "Prix de vente HT", type: "money" },
    { name: "budget", label: "Budget (enveloppe de coûts)", type: "money" },
    { name: "estimatedCost", label: "Coût estimé", type: "money" },
    { name: "status", label: "Statut", type: "select", options: options(PROJECT_STATUS) },
    { name: "memberIds", label: "Membres", type: "multiselect", options: o.employees },
    { name: "description", label: "Description", type: "textarea" },
    { name: "risks", label: "Risques identifiés", type: "textarea" },
  ];
  return (
    <EntityForm<S.ProjectInput>
      schema={S.projectSchema}
      defaultValues={
        entity
          ? {
              name: entity.name,
              clientId: entity.clientId,
              opportunityId: entity.opportunityId,
              description: entity.description,
              managerId: entity.managerId,
              memberIds: entity.memberIds,
              startDate: entity.startDate,
              dueDate: entity.dueDate,
              budget: entity.budget,
              salePrice: entity.salePrice,
              estimatedCost: entity.estimatedCost,
              priority: entity.priority,
              status: entity.status,
              risks: entity.risks,
            }
          : {
              name: "",
              clientId: pick(defaults, "clientId", ""),
              opportunityId: pick(defaults, "opportunityId", null),
              description: "",
              managerId: "emp_thomas",
              memberIds: [],
              startDate: today,
              dueDate: addDays(today, 60),
              budget: 0,
              salePrice: 0,
              estimatedCost: 0,
              priority: "normal",
              status: "planned",
              risks: "",
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Créer le projet"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateProject, { id: entity.id, values }) : run(C.createProject, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Tâche ----------------------------- */

export function TaskForm({ entity, defaults, onDone, onCancel }: FormProps<Task>) {
  const run = useCommand();
  const o = useOptions();
  const data = useData();
  const today = useToday();
  const dependencyOptions = data.tasks
    .filter((t) => t.id !== entity?.id && t.status !== "cancelled" && (!entity?.projectId || t.projectId === entity.projectId))
    .map((t) => ({ value: t.id, label: t.title }));
  const crm = (entity?.type ?? pick(defaults, "type", "internal")) !== "internal";
  const fields: FieldConfig<S.TaskInput>[] = [
    { name: "title", label: "Titre", type: "text", span: 2 },
    { name: "type", label: "Type", type: "select", options: Object.entries(TASK_TYPE_LABEL).map(([value, label]) => ({ value, label })), hidden: !crm },
    {
      name: "dueTime",
      label: "Heure (HH:mm)",
      type: "custom",
      hidden: !crm,
      render: ({ value, onChange }) => <Input value={(value as string) ?? ""} placeholder="HH:mm" onChange={(e) => onChange(e.target.value || null)} aria-label="Heure" />,
    },
    { name: "contactId", label: "Contact", type: "select", nullable: true, options: o.contacts, hidden: !crm },
    { name: "opportunityId", label: "Opportunité", type: "select", nullable: true, options: o.opportunities, hidden: !crm },
    { name: "assigneeId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    { name: "dueDate", label: "Échéance", type: "date", nullable: true },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    { name: "status", label: "Statut", type: "select", options: options(TASK_STATUS) },
    { name: "complexity", label: "Complexité", type: "select", options: options(COMPLEXITY), help: "Détermine la récompense XP à la clôture." },
    { name: "estimateHours", label: "Estimation (heures)", type: "number", step: 0.5, min: 0 },
    { name: "projectId", label: "Projet", type: "select", nullable: true, options: o.projects },
    { name: "clientId", label: "Client", type: "select", nullable: true, options: o.clients },
    { name: "goalId", label: "Objectif", type: "select", nullable: true, options: o.goals },
    {
      name: "recurrence",
      label: "Récurrence",
      type: "select",
      options: [
        { value: "none", label: "Aucune" },
        { value: "weekly", label: "Hebdomadaire" },
        { value: "monthly", label: "Mensuelle" },
      ],
    },
    { name: "dependsOn", label: "Dépend de", type: "multiselect", options: dependencyOptions.slice(0, 60) },
    { name: "description", label: "Description", type: "textarea" },
  ];
  return (
    <EntityForm<S.TaskInput>
      schema={S.taskSchema}
      defaultValues={
        entity
          ? {
              title: entity.title,
              description: entity.description,
              assigneeId: entity.assigneeId,
              priority: entity.priority,
              status: entity.status,
              complexity: entity.complexity,
              dueDate: entity.dueDate,
              estimateHours: entity.estimateHours,
              projectId: entity.projectId,
              clientId: entity.clientId,
              goalId: entity.goalId,
              dependsOn: entity.dependsOn,
              recurrence: entity.recurrence,
              type: entity.type,
              contactId: entity.contactId,
              opportunityId: entity.opportunityId,
              dueTime: entity.dueTime,
            }
          : {
              title: "",
              description: "",
              assigneeId: pick(defaults, "assigneeId", null),
              priority: "normal",
              status: "todo",
              complexity: "standard",
              dueDate: pick(defaults, "dueDate", addDays(today, 7)),
              estimateHours: 2,
              projectId: pick(defaults, "projectId", null),
              clientId: pick(defaults, "clientId", null),
              goalId: null,
              dependsOn: [],
              recurrence: "none",
              type: pick(defaults, "type", "internal"),
              contactId: pick(defaults, "contactId", null),
              opportunityId: pick(defaults, "opportunityId", null),
              dueTime: null,
            }
      }
      fields={fields}
      onCancel={onCancel}
      submitLabel={entity ? "Enregistrer" : "Créer la tâche"}
      onSubmit={(values) => {
        const res = entity ? run(C.updateTask, { id: entity.id, values }) : run(C.createTask, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Collaborateur ----------------------------- */

export function EmployeeForm({ entity, onDone, onCancel }: FormProps<Employee>) {
  const run = useCommand();
  const today = useToday();
  const skillKeys = Object.keys(SKILL) as (keyof typeof SKILL)[];
  const fields: FieldConfig<S.EmployeeInput>[] = [
    { name: "firstName", label: "Prénom", type: "text" },
    { name: "lastName", label: "Nom", type: "text" },
    { name: "jobTitle", label: "Poste", type: "text" },
    { name: "department", label: "Département", type: "select", options: options(DEPARTMENT) },
    { name: "email", label: "E-mail (fictif)", type: "email" },
    { name: "hireDate", label: "Date d'arrivée", type: "date" },
    { name: "monthlyCost", label: "Coût mensuel chargé estimé", type: "money" },
    {
      name: "status",
      label: "Statut",
      type: "select",
      options: [
        { value: "active", label: "Actif" },
        { value: "leave", label: "En congé" },
        { value: "left", label: "Parti" },
      ],
    },
    {
      name: "skills",
      label: "Compétences (ludique, 1 à 5)",
      type: "custom",
      span: 2,
      render: ({ value, onChange }) => {
        const skills = (value as Record<string, number>) ?? {};
        return (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {skillKeys.map((k) => (
              <label key={k} className="flex flex-col gap-1 text-[11px] text-muted">
                {SKILL[k]}
                <NativeSelect
                  value={skills[k] ?? ""}
                  onChange={(e) => {
                    const next = { ...skills };
                    if (e.target.value === "") delete next[k];
                    else next[k] = Number(e.target.value);
                    onChange(next);
                  }}
                  className="h-8 text-xs"
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
          </div>
        );
      },
    },
  ];
  return (
    <EntityForm<S.EmployeeInput>
      schema={S.employeeSchema}
      defaultValues={
        entity
          ? {
              firstName: entity.firstName,
              lastName: entity.lastName,
              jobTitle: entity.jobTitle,
              department: entity.department,
              email: entity.email,
              hireDate: entity.hireDate,
              status: entity.status,
              monthlyCost: entity.monthlyCost,
              skills: entity.skills as Record<string, number>,
            }
          : { firstName: "", lastName: "", jobTitle: "", department: "development", email: "", hireDate: today, status: "active", monthlyCost: 0, skills: {} }
      }
      fields={fields}
      onCancel={onCancel}
      onSubmit={(values) => {
        const res = entity ? run(C.updateEmployee, { id: entity.id, values }) : run(C.createEmployee, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Objectif ----------------------------- */

export function GoalForm({ entity, onDone, onCancel }: FormProps<Goal>) {
  const run = useCommand();
  const o = useOptions();
  const today = useToday();
  const fields: FieldConfig<S.GoalInput>[] = [
    { name: "title", label: "Titre", type: "text", span: 2 },
    { name: "type", label: "Type", type: "select", options: options(GOAL_TYPE) },
    { name: "ownerId", label: "Responsable", type: "select", nullable: true, options: o.employees },
    {
      name: "metric",
      label: "Mesure",
      type: "select",
      span: 2,
      options: Object.entries(GOAL_METRICS).map(([value, m]) => ({ value, label: m.auto ? `${m.label} (automatique)` : m.label })),
      help: "Une mesure automatique est recalculée depuis les données ; « Saisie manuelle » est indiquée comme telle.",
    },
    { name: "periodLabel", label: "Libellé de période", type: "text", placeholder: "T4 2026" },
    { name: "unit", label: "Unité", type: "text" },
    { name: "periodStart", label: "Début", type: "date" },
    { name: "periodEnd", label: "Date limite", type: "date" },
    { name: "startValue", label: "Valeur initiale", type: "number", step: 0.1 },
    { name: "targetValue", label: "Valeur cible", type: "number", step: 0.1 },
    { name: "manualValue", label: "Valeur actuelle (si manuelle)", type: "number", step: 0.1 },
    { name: "description", label: "Description", type: "textarea" },
    {
      name: "keyResults",
      label: "Résultats clés",
      type: "custom",
      span: 2,
      render: ({ value, onChange }) => <KeyResultsEditor value={(value as S.GoalInput["keyResults"]) ?? []} onChange={onChange} />,
    },
  ];
  return (
    <EntityForm<S.GoalInput>
      schema={S.goalSchema}
      defaultValues={
        entity
          ? {
              title: entity.title,
              description: entity.description,
              type: entity.type,
              periodLabel: entity.periodLabel,
              periodStart: entity.periodStart,
              periodEnd: entity.periodEnd,
              ownerId: entity.ownerId,
              metric: entity.metric,
              startValue: entity.startValue,
              targetValue: entity.targetValue,
              manualValue: entity.manualValue,
              unit: entity.unit,
              keyResults: entity.keyResults,
            }
          : {
              title: "",
              description: "",
              type: "financial",
              periodLabel: "",
              periodStart: today,
              periodEnd: addDays(today, 90),
              ownerId: null,
              metric: "manual",
              startValue: 0,
              targetValue: 100,
              manualValue: 0,
              unit: "",
              keyResults: [],
            }
      }
      fields={fields}
      onCancel={onCancel}
      onSubmit={(values) => {
        const res = entity ? run(C.updateGoal, { id: entity.id, values }) : run(C.createGoal, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

function KeyResultsEditor({ value, onChange }: { value: S.GoalInput["keyResults"]; onChange: (v: S.GoalInput["keyResults"]) => void }) {
  const update = (id: string, patch: Partial<S.GoalInput["keyResults"][number]>) => onChange(value.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  return (
    <div className="space-y-2">
      {value.map((kr, i) => (
        <div key={kr.id} className="grid grid-cols-12 gap-2">
          <input
            aria-label={`Résultat clé ${i + 1}`}
            className="col-span-12 h-8 rounded-lg border border-border bg-bg-elevated px-2 text-sm sm:col-span-6"
            value={kr.title}
            onChange={(e) => update(kr.id, { title: e.target.value })}
            placeholder="Résultat clé"
          />
          <input
            aria-label="Actuel"
            type="number"
            className="col-span-3 h-8 rounded-lg border border-border bg-bg-elevated px-2 text-sm sm:col-span-2"
            value={kr.current}
            onChange={(e) => update(kr.id, { current: Number(e.target.value) })}
          />
          <input
            aria-label="Cible"
            type="number"
            className="col-span-3 h-8 rounded-lg border border-border bg-bg-elevated px-2 text-sm sm:col-span-2"
            value={kr.target}
            onChange={(e) => update(kr.id, { target: Number(e.target.value) })}
          />
          <input
            aria-label="Unité"
            className="col-span-4 h-8 rounded-lg border border-border bg-bg-elevated px-2 text-sm sm:col-span-1"
            value={kr.unit}
            onChange={(e) => update(kr.id, { unit: e.target.value })}
          />
          <button type="button" className="col-span-2 text-xs text-danger hover:underline sm:col-span-1" onClick={() => onChange(value.filter((k) => k.id !== kr.id))}>
            Retirer
          </button>
        </div>
      ))}
      <button type="button" className="text-xs text-accent hover:underline" onClick={() => onChange([...value, { id: newId("kr"), title: "", target: 1, current: 0, unit: "" }])}>
        + Ajouter un résultat clé
      </button>
    </div>
  );
}

/* ----------------------------- Mission ----------------------------- */

export function MissionForm({ onDone, onCancel }: FormProps<unknown>) {
  const run = useCommand();
  const today = useToday();
  const fields: FieldConfig<S.MissionInput>[] = [
    { name: "title", label: "Titre", type: "text", span: 2 },
    { name: "category", label: "Catégorie", type: "select", options: Object.entries(MISSION_CATEGORY_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "type", label: "Type", type: "select", options: Object.entries(MISSION_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "difficulty", label: "Difficulté", type: "select", options: Object.entries(MISSION_DIFFICULTY_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "priority", label: "Priorité", type: "select", options: options(PRIORITY) },
    { name: "startDate", label: "Début", type: "date" },
    { name: "dueDate", label: "Échéance", type: "date" },
    { name: "xpReward", label: "Récompense XP (max. 30)", type: "number", min: 0, max: 30, help: "Les missions personnalisées sont plafonnées pour éviter l'auto-récompense." },
    { name: "description", label: "Description / condition de réussite", type: "textarea" },
  ];
  return (
    <EntityForm<S.MissionInput>
      schema={S.missionSchema}
      defaultValues={{ title: "", description: "", category: "strategy", type: "custom", difficulty: "medium", priority: "normal", startDate: today, dueDate: addDays(today, 7), xpReward: 20 }}
      fields={fields}
      onCancel={onCancel}
      submitLabel="Créer la mission"
      onSubmit={(values) => {
        const res = run(C.createMission, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Note ----------------------------- */

export function NoteForm({ entity, defaults, onDone, onCancel }: FormProps<Note>) {
  const run = useCommand();
  const o = useOptions();
  const fields: FieldConfig<S.NoteInput>[] = [
    { name: "title", label: "Titre", type: "text", span: 2 },
    { name: "contactId", label: "Contact", type: "select", nullable: true, options: o.contacts },
    { name: "clientId", label: "Entreprise", type: "select", nullable: true, options: o.clients },
    { name: "opportunityId", label: "Opportunité", type: "select", nullable: true, options: o.opportunities },
    { name: "projectId", label: "Projet", type: "select", nullable: true, options: o.projects },
    { name: "body", label: "Contenu", type: "textarea" },
  ];
  return (
    <EntityForm<S.NoteInput>
      schema={S.noteSchema}
      defaultValues={
        entity
          ? { title: entity.title, body: entity.body, clientId: entity.clientId, projectId: entity.projectId, contactId: entity.contactId, opportunityId: entity.opportunityId }
          : {
              title: "",
              body: "",
              clientId: pick(defaults, "clientId", null),
              projectId: pick(defaults, "projectId", null),
              contactId: pick(defaults, "contactId", null),
              opportunityId: pick(defaults, "opportunityId", null),
            }
      }
      fields={fields}
      onCancel={onCancel}
      onSubmit={(values) => {
        const res = entity ? run(C.updateNote, { id: entity.id, values }) : run(C.createNote, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Avoir ----------------------------- */

/**
 * Avoir sur une facture émise. Par défaut, les lignes de la facture sont reprises
 * (avoir total) ; ajuster les quantités ou supprimer des lignes pour un avoir partiel.
 */
export function CreditNoteForm({ defaults, onDone, onCancel }: FormProps<unknown>) {
  const run = useCommand();
  const today = useToday();
  const data = useData();
  const invoiceId = pick<string>(defaults, "invoiceId", "");
  const invoice = data.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return <p className="text-sm text-muted">Facture introuvable.</p>;
  const max = creditableAmount(invoice, data.creditNotes);
  const alreadyCredited = data.creditNotes.some((c) => c.invoiceId === invoice.id);
  const fields: FieldConfig<S.CreditNoteInput>[] = [
    { name: "issueDate", label: "Date de l'avoir", type: "date" },
    { name: "reason", label: "Motif", type: "text", placeholder: "Geste commercial, erreur de facturation, résiliation…" },
    {
      name: "items",
      label: "Lignes créditées (montants positifs)",
      type: "lines",
      help: `Montant maximal créditable : ${formatEUR(max)} TTC.${alreadyCredited ? " Un ou plusieurs avoirs existent déjà sur cette facture." : ""}`,
    },
  ];
  return (
    <EntityForm<S.CreditNoteInput>
      schema={S.creditNoteSchema}
      defaultValues={{
        invoiceId,
        issueDate: today < invoice.issueDate ? invoice.issueDate : today,
        reason: "",
        items: alreadyCredited ? [] : invoice.items.map((l) => ({ ...l, id: newId("li") })),
      }}
      fields={fields}
      onCancel={onCancel}
      submitLabel="Émettre l'avoir"
      onSubmit={(values) => {
        const res = run(C.createCreditNote, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}

/* ----------------------------- Remboursement ----------------------------- */

export function RefundForm({ defaults, onDone, onCancel }: FormProps<unknown>) {
  const run = useCommand();
  const today = useToday();
  const summaries = useSummaries();
  const invoiceId = pick<string>(defaults, "invoiceId", "");
  const s = summaries.find((x) => x.invoice.id === invoiceId);
  if (!s || s.creditBalance <= 0) return <p className="text-sm text-muted">Aucun trop-perçu à rembourser sur cette facture.</p>;
  const lastNote = s.creditNotes.at(-1);
  const fields: FieldConfig<S.RefundInput>[] = [
    { name: "date", label: "Date du remboursement", type: "date" },
    { name: "amount", label: "Montant remboursé", type: "money", help: `Trop-perçu actuel : ${formatEUR(s.creditBalance)}.` },
    { name: "method", label: "Moyen", type: "select", options: options(PAYMENT_METHOD) },
    { name: "reference", label: "Référence", type: "text" },
    {
      name: "creditNoteId",
      label: "Avoir lié",
      type: "select",
      nullable: true,
      options: s.creditNotes.map((c) => ({ value: c.id, label: c.number })),
    },
  ];
  return (
    <EntityForm<S.RefundInput>
      schema={S.refundSchema}
      defaultValues={{ invoiceId, creditNoteId: lastNote?.id ?? null, date: today, amount: s.creditBalance, method: "transfer", reference: "" }}
      fields={fields}
      onCancel={onCancel}
      submitLabel="Enregistrer le remboursement"
      onSubmit={(values) => {
        const res = run(C.recordRefund, values);
        if (res.ok) onDone(res.result);
        return res;
      }}
    />
  );
}
