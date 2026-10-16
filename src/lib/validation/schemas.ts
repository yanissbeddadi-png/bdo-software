import { z } from "zod";

/**
 * Schémas de validation partagés entre les formulaires (client) et la couche de
 * commandes (validation « serveur » : chaque commande revalide son entrée).
 * Les montants sont exprimés en centimes entiers.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optionalId = z.string().min(1).nullable();
const cents = z.number({ invalid_type_error: "Montant invalide" }).int("Montant invalide").min(0, "Le montant doit être positif");
const vatRate = z.number().int().min(0).max(10_000);
const text = (max = 2000) => z.string().trim().max(max, `${max} caractères maximum`);
const required = (label: string, max = 200) => z.string().trim().min(1, `${label} est obligatoire`).max(max, `${max} caractères maximum`);
const priority = z.enum(["low", "normal", "high", "critical"]);

export const lineItemSchema = z.object({
  id: z.string().min(1),
  productId: optionalId,
  description: required("La désignation", 300),
  quantity: z
    .number({ invalid_type_error: "Quantité invalide" })
    .positive("La quantité doit être positive")
    .max(100_000)
    .refine((q) => Math.round(q * 100) === q * 100, "2 décimales maximum"),
  /** Un prix négatif est autorisé pour une ligne de remise. */
  unitPrice: z.number({ invalid_type_error: "Montant invalide" }).int("Montant invalide"),
  vatRate,
});

const nonNegativeTotal = (items: { quantity: number; unitPrice: number }[]) => items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0) >= 0;

export const clientSchema = z.object({
  name: required("Le nom"),
  sector: text(100),
  status: z.enum(["active", "inactive", "churned"]),
  city: text(100),
  website: text(200),
  satisfaction: z.number().int().min(1).max(5).nullable(),
  notes: text(),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const contactSchema = z.object({
  clientId: optionalId,
  leadId: optionalId,
  firstName: required("Le prénom", 100),
  lastName: required("Le nom", 100),
  jobTitle: text(100),
  email: z.string().trim().email("Adresse e-mail invalide").or(z.literal("")),
  phone: text(40),
  isPrimary: z.boolean(),
  notes: text(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const leadSchema = z.object({
  company: required("L'entreprise"),
  contactName: text(150),
  email: z.string().trim().email("Adresse e-mail invalide").or(z.literal("")),
  phone: text(40),
  sector: text(100),
  source: text(100),
  priority,
  status: z.enum(["new", "contacted", "qualified", "unqualified", "converted"]),
  nextAction: text(300),
  nextActionDate: isoDate.nullable(),
  notes: text(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const opportunitySchema = z
  .object({
    name: required("Le nom"),
    clientId: optionalId,
    leadId: optionalId,
    contactId: optionalId,
    amount: cents,
    probability: z.number().int().min(0, "0 à 100").max(100, "0 à 100"),
    stage: z.enum(["new", "contacted", "qualification", "meeting", "proposal", "negotiation", "won", "lost"]),
    expectedCloseDate: isoDate,
    source: text(100),
    ownerId: optionalId,
    nextAction: text(300),
    notes: text(),
  })
  .refine((o) => o.clientId || o.leadId, { message: "Associez un client ou un prospect", path: ["clientId"] });
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const salesActivitySchema = z
  .object({
    type: z.enum(["call", "email", "meeting", "demo", "followup", "note"]),
    date: z.string().min(10),
    subject: required("L'objet"),
    notes: text(),
    clientId: optionalId,
    leadId: optionalId,
    opportunityId: optionalId,
    invoiceId: optionalId,
    ownerId: optionalId,
    done: z.boolean(),
  })
  .refine((a) => a.clientId || a.leadId || a.opportunityId, { message: "Associez l'activité à un client, un prospect ou une opportunité", path: ["clientId"] });
export type SalesActivityInput = z.infer<typeof salesActivitySchema>;

export const productSchema = z.object({
  name: required("Le nom"),
  sku: required("La référence", 40),
  description: text(),
  type: z.enum(["saas", "license", "custom_dev", "maintenance", "consulting", "integration", "support"]),
  category: text(100),
  unitPrice: cents,
  unitCost: cents,
  billingMode: z.enum(["one_time", "monthly", "yearly", "daily", "hourly"]),
  vatRate,
  status: z.enum(["active", "archived"]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const quoteSchema = z
  .object({
    clientId: z.string().min(1, "Le client est obligatoire"),
    opportunityId: optionalId,
    issueDate: isoDate,
    expiryDate: isoDate,
    items: z.array(lineItemSchema).min(1, "Ajoutez au moins une ligne"),
    notes: text(),
  })
  .refine((q) => q.expiryDate >= q.issueDate, { message: "L'expiration doit suivre la date du devis", path: ["expiryDate"] })
  .refine((q) => nonNegativeTotal(q.items), { message: "Le total du devis ne peut pas être négatif", path: ["items"] });
export type QuoteInput = z.infer<typeof quoteSchema>;

export const invoiceSchema = z
  .object({
    clientId: z.string().min(1, "Le client est obligatoire"),
    issueDate: isoDate,
    dueDate: isoDate,
    items: z.array(lineItemSchema).min(1, "Ajoutez au moins une ligne"),
    projectId: optionalId,
    notes: text(),
    issue: z.boolean(),
  })
  .refine((i) => i.dueDate >= i.issueDate, { message: "L'échéance doit suivre la date d'émission", path: ["dueDate"] })
  .refine((i) => nonNegativeTotal(i.items), { message: "Le total de la facture ne peut pas être négatif (avoirs non gérés)", path: ["items"] });
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  date: isoDate,
  amount: cents.refine((v) => v > 0, "Le montant doit être strictement positif"),
  method: z.enum(["transfer", "card", "direct_debit", "check", "cash"]),
  reference: text(100),
  notes: text(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const creditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  issueDate: isoDate,
  items: z.array(lineItemSchema).min(1, "Ajoutez au moins une ligne"),
  reason: required("Le motif", 500),
});
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

export const refundSchema = z.object({
  invoiceId: z.string().min(1),
  creditNoteId: optionalId,
  date: isoDate,
  amount: cents.refine((v) => v > 0, "Le montant doit être strictement positif"),
  method: z.enum(["transfer", "card", "direct_debit", "check", "cash"]),
  reference: text(100),
});
export type RefundInput = z.infer<typeof refundSchema>;

export const expenseSchema = z
  .object({
    label: required("Le libellé"),
    supplier: required("Le fournisseur", 150),
    category: z.enum(["salaries", "software", "hosting", "marketing", "contractors", "hardware", "office", "travel", "bank_fees", "misc"]),
    date: isoDate,
    amountHT: cents.refine((v) => v > 0, "Le montant doit être strictement positif"),
    vatRate,
    paid: z.boolean(),
    paidDate: isoDate.nullable(),
    dueDate: isoDate,
    projectId: optionalId,
    notes: text(),
  })
  .refine((e) => !e.paid || !!e.paidDate, { message: "Indiquez la date de paiement", path: ["paidDate"] });
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const subscriptionSchema = z
  .object({
    clientId: z.string().min(1, "Le client est obligatoire"),
    productId: optionalId,
    offer: required("L'offre"),
    amount: cents.refine((v) => v > 0, "Le montant doit être strictement positif"),
    periodicity: z.enum(["monthly", "quarterly", "yearly"]),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    status: z.enum(["active", "paused", "cancelled"]),
    renewalTerms: text(300),
  })
  .refine((s) => !s.endDate || s.endDate >= s.startDate, { message: "La fin doit suivre le début", path: ["endDate"] });
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const projectSchema = z
  .object({
    name: required("Le nom"),
    clientId: z.string().min(1, "Le client est obligatoire"),
    opportunityId: optionalId,
    description: text(),
    managerId: optionalId,
    memberIds: z.array(z.string()),
    startDate: isoDate,
    dueDate: isoDate,
    budget: cents,
    salePrice: cents,
    estimatedCost: cents,
    priority,
    status: z.enum(["to_plan", "planned", "in_progress", "on_hold", "at_risk", "done", "cancelled"]),
    risks: text(),
  })
  .refine((p) => p.dueDate >= p.startDate, { message: "L'échéance doit suivre le début", path: ["dueDate"] });
export type ProjectInput = z.infer<typeof projectSchema>;

export const taskSchema = z.object({
  title: required("Le titre"),
  description: text(),
  assigneeId: optionalId,
  priority,
  status: z.enum(["todo", "in_progress", "waiting", "done", "cancelled"]),
  complexity: z.enum(["simple", "standard", "complex"]),
  dueDate: isoDate.nullable(),
  estimateHours: z.number().min(0).max(1000),
  projectId: optionalId,
  clientId: optionalId,
  goalId: optionalId,
  dependsOn: z.array(z.string()),
  recurrence: z.enum(["none", "weekly", "monthly"]),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const employeeSchema = z.object({
  firstName: required("Le prénom", 100),
  lastName: required("Le nom", 100),
  jobTitle: required("Le poste", 100),
  department: z.enum(["direction", "development", "sales", "marketing", "finance", "support", "operations"]),
  email: z.string().trim().email("Adresse e-mail invalide"),
  hireDate: isoDate,
  status: z.enum(["active", "leave", "left"]),
  monthlyCost: cents,
  skills: z.record(z.number().int().min(1).max(5)),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const goalSchema = z
  .object({
    title: required("Le titre"),
    description: text(),
    type: z.enum(["financial", "commercial", "operational", "customer", "growth", "team"]),
    periodLabel: required("La période", 50),
    periodStart: isoDate,
    periodEnd: isoDate,
    ownerId: optionalId,
    metric: z.enum([
      "manual",
      "mrr",
      "overdue_receivables",
      "won_opportunities",
      "projects_completed",
      "avg_project_margin",
      "late_tasks",
      "billed_revenue",
      "active_clients",
      "new_leads",
      "new_subscriptions",
    ]),
    startValue: z.number(),
    targetValue: z.number(),
    manualValue: z.number(),
    unit: text(20),
    keyResults: z.array(z.object({ id: z.string(), title: required("Le résultat clé"), target: z.number(), current: z.number(), unit: text(20) })),
  })
  .refine((g) => g.periodEnd >= g.periodStart, { message: "La fin doit suivre le début", path: ["periodEnd"] })
  .refine((g) => g.targetValue !== g.startValue, { message: "La cible doit différer de la valeur initiale", path: ["targetValue"] });
export type GoalInput = z.infer<typeof goalSchema>;

export const missionSchema = z.object({
  title: required("Le titre"),
  description: text(),
  category: z.enum(["finance", "commercial", "operations", "projects", "team", "strategy", "personal"]),
  type: z.enum(["daily", "weekly", "monthly", "strategic", "custom"]),
  difficulty: z.enum(["easy", "medium", "hard", "epic"]),
  priority,
  startDate: isoDate,
  dueDate: isoDate,
  xpReward: z.number().int().min(0).max(30, "30 XP maximum pour une mission personnalisée"),
});
export type MissionInput = z.infer<typeof missionSchema>;

export const noteSchema = z.object({
  title: required("Le titre"),
  body: text(5000),
  clientId: optionalId,
  projectId: optionalId,
});
export type NoteInput = z.infer<typeof noteSchema>;
