import type { AppData, CreditNote, Expense, Invoice, LineItem, Payment, Product, Quote, QuoteStatus, Refund, Subscription, VatReturn } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import {
  creditNoteSchema,
  refundSchema,
  type CreditNoteInput,
  type RefundInput,
  expenseSchema,
  invoiceSchema,
  paymentSchema,
  productSchema,
  quoteSchema,
  subscriptionSchema,
  type ExpenseInput,
  type InvoiceInput,
  type PaymentInput,
  type ProductInput,
  type QuoteInput,
  type SubscriptionInput,
} from "@/lib/validation/schemas";
import { addDays } from "@/lib/calculations/dates";
import { creditableAmount, summarizeInvoice, validatePayment } from "@/lib/calculations/invoices";
import { documentTotals } from "@/lib/calculations/money";
import { nextPeriodToDeclare, vatPeriods } from "@/lib/calculations/vat";
import { billingDates } from "@/lib/calculations/recurring";
import { formatEUR } from "@/lib/formatters";
import { activity, assertCan, audit, DomainError, findOrThrow, normalize, parse, replace, type Command } from "./core";

const pad = (n: number) => String(n).padStart(4, "0");

/**
 * Une période de TVA déclarée est clôturée : les flux de trésorerie datés dans
 * cette période (paiements, remboursements, dépenses payées) ne peuvent plus être
 * créés, modifiés ni supprimés, afin que la déclaration reste cohérente.
 */
export function isVatPeriodClosed(data: Pick<AppData, "vatReturns">, date: string | null | undefined): boolean {
  if (!date) return false;
  return data.vatReturns.some((r) => r.period === date.slice(0, 7));
}

function assertVatPeriodOpen(data: Pick<AppData, "vatReturns">, date: string | null | undefined, field = "date") {
  if (isVatPeriodClosed(data, date)) throw new DomainError(`La période de TVA ${date!.slice(0, 7)} est déclarée : elle est clôturée pour les flux de trésorerie.`, { [field]: "Période clôturée" });
}

function adjustments(data: AppData) {
  return { creditNotes: data.creditNotes, refunds: data.refunds };
}

/* ----------------------------- Catalogue ----------------------------- */

export const createProduct: Command<ProductInput, Product> = (data, input, ctx) => {
  assertCan(ctx, "products.write");
  const v = parse(productSchema, input);
  if (data.products.some((p) => normalize(p.sku) === normalize(v.sku))) throw new DomainError("Cette référence existe déjà.", { sku: "Doublon" });
  const product: Product = { id: newId("prd"), ...v, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, products: [...data.products, product] };
  next = activity(next, ctx, "product_created", `Offre ${product.name} ajoutée au catalogue`, { type: "product", id: product.id });
  return { data: next, result: product, message: `« ${product.name} » ajouté au catalogue.` };
};

/** Modifie le catalogue. Les lignes de devis/factures existantes conservent leurs prix figés. */
export const updateProduct: Command<{ id: string; values: ProductInput }, Product> = (data, { id, values }, ctx) => {
  assertCan(ctx, "products.write");
  const v = parse(productSchema, values);
  const current = findOrThrow(data.products, id, "Produit");
  if (data.products.some((p) => p.id !== id && normalize(p.sku) === normalize(v.sku))) throw new DomainError("Cette référence existe déjà.", { sku: "Doublon" });
  const product: Product = { ...current, ...v, updatedAt: ctx.now };
  return { data: { ...data, products: replace(data.products, product) }, result: product, message: "Catalogue mis à jour (les pièces déjà émises ne sont pas modifiées)." };
};

/* ----------------------------- Devis ----------------------------- */

export const createQuote: Command<QuoteInput, Quote> = (data, input, ctx) => {
  assertCan(ctx, "quotes.write");
  const v = parse(quoteSchema, input);
  findOrThrow(data.clients, v.clientId, "Client");
  const seq = data.sequences.quote + 1;
  const quote: Quote = { id: newId("quo"), number: `DEV-${v.issueDate.slice(0, 4)}-${pad(seq)}`, ...v, status: "draft", invoiceId: null, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, quotes: [...data.quotes, quote], sequences: { ...data.sequences, quote: seq } };
  next = activity(next, ctx, "quote_created", `Devis ${quote.number} créé`, { type: "quote", id: quote.id });
  return { data: next, result: quote, message: `Devis ${quote.number} créé.` };
};

export const updateQuote: Command<{ id: string; values: QuoteInput }, Quote> = (data, { id, values }, ctx) => {
  assertCan(ctx, "quotes.write");
  const v = parse(quoteSchema, values);
  const current = findOrThrow(data.quotes, id, "Devis");
  if (current.status !== "draft" && current.status !== "sent") throw new DomainError("Seuls les devis brouillons ou envoyés sont modifiables.");
  const quote: Quote = { ...current, ...v, updatedAt: ctx.now };
  return { data: { ...data, quotes: replace(data.quotes, quote) }, result: quote, message: "Devis mis à jour." };
};

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "refused", "expired", "draft"],
  accepted: [],
  refused: ["draft"],
  expired: ["draft"],
};

export const setQuoteStatus: Command<{ id: string; status: QuoteStatus }, Quote> = (data, { id, status }, ctx) => {
  assertCan(ctx, "quotes.write");
  const current = findOrThrow(data.quotes, id, "Devis");
  if (!QUOTE_TRANSITIONS[current.status].includes(status)) throw new DomainError("Transition de statut non autorisée pour ce devis.");
  const quote: Quote = { ...current, status, updatedAt: ctx.now };
  let next = { ...data, quotes: replace(data.quotes, quote) };
  // Un devis accepté rattaché à une opportunité ouverte la fait passer en « Gagnée ».
  if (status === "accepted" && quote.opportunityId) {
    next = {
      ...next,
      opportunities: next.opportunities.map((o) =>
        o.id === quote.opportunityId && o.stage !== "won" && o.stage !== "lost"
          ? { ...o, stage: "won" as const, probability: 100, closedAt: ctx.now, lastInteractionAt: ctx.now, updatedAt: ctx.now }
          : o,
      ),
    };
  }
  next = activity(
    next,
    ctx,
    "quote_status",
    `Devis ${quote.number} : ${status === "sent" ? "envoyé" : status === "accepted" ? "accepté" : status === "refused" ? "refusé" : status === "expired" ? "expiré" : "repassé en brouillon"}`,
    { type: "quote", id },
  );
  return { data: next, result: quote, message: "Statut du devis mis à jour." };
};

export const deleteQuote: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "quotes.write");
  const quote = findOrThrow(data.quotes, id, "Devis");
  if (quote.status !== "draft") throw new DomainError("Seul un devis brouillon peut être supprimé.");
  return { data: audit({ ...data, quotes: data.quotes.filter((q) => q.id !== id) }, ctx, "quote.delete", { type: "quote", id }, quote.number), result: undefined, message: "Devis supprimé." };
};

/** Conversion d'un devis accepté en facture brouillon : lignes, montants et client sont préservés. */
export const convertQuoteToInvoice: Command<{ id: string }, Invoice> = (data, { id }, ctx) => {
  assertCan(ctx, "invoices.write");
  const quote = findOrThrow(data.quotes, id, "Devis");
  if (quote.status !== "accepted") throw new DomainError("Seul un devis accepté peut être converti en facture.");
  if (quote.invoiceId) throw new DomainError("Ce devis a déjà été converti en facture.");
  const project = data.projects.find((p) => p.opportunityId && p.opportunityId === quote.opportunityId);
  const invoice: Invoice = {
    id: newId("inv"),
    number: `BROUILLON-${quote.number}`,
    clientId: quote.clientId,
    issueDate: ctx.today,
    dueDate: addDays(ctx.today, 30),
    items: quote.items.map((i) => ({ ...i, id: newId("li") })),
    baseStatus: "draft",
    projectId: project?.id ?? null,
    quoteId: quote.id,
    subscriptionId: null,
    notes: `Facture issue du devis ${quote.number}.`,
    cancelledAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  let next = { ...data, invoices: [...data.invoices, invoice], quotes: replace(data.quotes, { ...quote, invoiceId: invoice.id, updatedAt: ctx.now }) };
  next = activity(next, ctx, "invoice_created", `Facture brouillon créée depuis le devis ${quote.number}`, { type: "invoice", id: invoice.id });
  return { data: next, result: invoice, message: "Facture brouillon créée à partir du devis." };
};

/* ----------------------------- Factures ----------------------------- */

function issueNumber(data: { sequences: { invoice: number } }, issueDate: string) {
  const seq = data.sequences.invoice + 1;
  return { seq, number: `FAC-${issueDate.slice(0, 4)}-${pad(seq)}` };
}

export const createInvoice: Command<InvoiceInput, Invoice> = (data, input, ctx) => {
  assertCan(ctx, "invoices.write");
  const v = parse(invoiceSchema, input);
  findOrThrow(data.clients, v.clientId, "Client");
  const { issue, ...rest } = v;
  let sequences = data.sequences;
  let number = `BROUILLON-${newId("").slice(1, 7).toUpperCase()}`;
  if (issue) {
    const n = issueNumber(data, v.issueDate);
    sequences = { ...sequences, invoice: n.seq };
    number = n.number;
  }
  const invoice: Invoice = {
    id: newId("inv"),
    number,
    ...rest,
    baseStatus: issue ? "issued" : "draft",
    quoteId: null,
    subscriptionId: null,
    cancelledAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  let next = { ...data, invoices: [...data.invoices, invoice], sequences };
  next = activity(next, ctx, issue ? "invoice_issued" : "invoice_created", issue ? `Facture ${number} émise` : "Facture brouillon créée", { type: "invoice", id: invoice.id });
  next = audit(next, ctx, issue ? "invoice.issue" : "invoice.create", { type: "invoice", id: invoice.id }, number);
  return { data: next, result: invoice, message: issue ? `Facture ${number} émise.` : "Facture brouillon enregistrée." };
};

/**
 * Modification : une facture brouillon est entièrement modifiable ; une facture
 * émise ne peut voir modifier que l'échéance, le projet et les notes (les lignes et
 * montants d'une pièce émise sont figés).
 */
export const updateInvoice: Command<{ id: string; values: InvoiceInput }, Invoice> = (data, { id, values }, ctx) => {
  assertCan(ctx, "invoices.write");
  const v = parse(invoiceSchema, values);
  const current = findOrThrow(data.invoices, id, "Facture");
  if (current.baseStatus === "cancelled") throw new DomainError("Une facture annulée n'est plus modifiable.");
  let invoice: Invoice;
  if (current.baseStatus === "draft") {
    const { issue: _issue, ...rest } = v;
    void _issue;
    invoice = { ...current, ...rest, updatedAt: ctx.now };
  } else {
    if (v.dueDate < current.issueDate) throw new DomainError("L'échéance doit suivre la date d'émission.");
    invoice = { ...current, dueDate: v.dueDate, projectId: v.projectId, notes: v.notes, updatedAt: ctx.now };
  }
  let next = { ...data, invoices: replace(data.invoices, invoice) };
  next = audit(next, ctx, "invoice.update", { type: "invoice", id }, invoice.number);
  return { data: next, result: invoice, message: "Facture mise à jour." };
};

export const issueInvoice: Command<{ id: string }, Invoice> = (data, { id }, ctx) => {
  assertCan(ctx, "invoices.write");
  const current = findOrThrow(data.invoices, id, "Facture");
  if (current.baseStatus !== "draft") throw new DomainError("Seule une facture brouillon peut être émise.");
  if (!current.items.length) throw new DomainError("La facture ne comporte aucune ligne.");
  const { seq, number } = issueNumber(data, current.issueDate);
  const invoice: Invoice = { ...current, number, baseStatus: "issued", updatedAt: ctx.now };
  let next = { ...data, invoices: replace(data.invoices, invoice), sequences: { ...data.sequences, invoice: seq } };
  next = activity(next, ctx, "invoice_issued", `Facture ${number} émise`, { type: "invoice", id });
  next = audit(next, ctx, "invoice.issue", { type: "invoice", id }, number);
  return { data: next, result: invoice, message: `Facture ${number} émise.` };
};

/** Annulation : impossible si un paiement a été enregistré (un avoir serait alors nécessaire). */
export const cancelInvoice: Command<{ id: string; reason: string }, Invoice> = (data, { id, reason }, ctx) => {
  assertCan(ctx, "invoices.write");
  const current = findOrThrow(data.invoices, id, "Facture");
  if (current.baseStatus === "cancelled") throw new DomainError("Cette facture est déjà annulée.");
  if (data.payments.some((p) => p.invoiceId === id)) throw new DomainError("Des paiements sont enregistrés sur cette facture : établissez un avoir pour l'annuler.");
  if (data.creditNotes.some((c) => c.invoiceId === id)) throw new DomainError("Des avoirs existent sur cette facture : complétez l'avoir plutôt que d'annuler la facture.");
  const invoice: Invoice = { ...current, baseStatus: "cancelled", cancelledAt: ctx.now, notes: reason ? `${current.notes}\nAnnulation : ${reason}`.trim() : current.notes, updatedAt: ctx.now };
  let next = { ...data, invoices: replace(data.invoices, invoice) };
  next = activity(next, ctx, "invoice_cancelled", `Facture ${invoice.number} annulée`, { type: "invoice", id });
  next = audit(next, ctx, "invoice.cancel", { type: "invoice", id }, reason);
  return { data: next, result: invoice, message: `Facture ${invoice.number} annulée.` };
};

export const deleteDraftInvoice: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "invoices.write");
  const current = findOrThrow(data.invoices, id, "Facture");
  if (current.baseStatus !== "draft") throw new DomainError("Seul un brouillon peut être supprimé ; une facture émise doit être annulée.");
  let next = { ...data, invoices: data.invoices.filter((i) => i.id !== id), quotes: data.quotes.map((q) => (q.invoiceId === id ? { ...q, invoiceId: null } : q)) };
  next = audit(next, ctx, "invoice.delete_draft", { type: "invoice", id }, current.number);
  return { data: next, result: undefined, message: "Brouillon supprimé." };
};

export const duplicateInvoice: Command<{ id: string }, Invoice> = (data, { id }, ctx) => {
  assertCan(ctx, "invoices.write");
  const source = findOrThrow(data.invoices, id, "Facture");
  const delay = Math.max(Math.round((Date.parse(source.dueDate) - Date.parse(source.issueDate)) / 86_400_000), 0);
  const invoice: Invoice = {
    ...source,
    id: newId("inv"),
    number: `BROUILLON-${newId("").slice(1, 7).toUpperCase()}`,
    issueDate: ctx.today,
    dueDate: addDays(ctx.today, delay || 30),
    items: source.items.map((i) => ({ ...i, id: newId("li") })),
    baseStatus: "draft",
    quoteId: null,
    subscriptionId: null,
    cancelledAt: null,
    notes: `Copie de ${source.number}`,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  let next = { ...data, invoices: [...data.invoices, invoice] };
  next = activity(next, ctx, "invoice_created", `Facture dupliquée depuis ${source.number}`, { type: "invoice", id: invoice.id });
  return { data: next, result: invoice, message: "Facture dupliquée en brouillon." };
};

export const recordPayment: Command<PaymentInput, Payment> = (data, input, ctx) => {
  assertCan(ctx, "payments.write");
  const v = parse(paymentSchema, input);
  const invoice = findOrThrow(data.invoices, v.invoiceId, "Facture");
  if (v.date > ctx.today) throw new DomainError("La date de paiement ne peut pas être dans le futur.", { date: "Date future" });
  if (v.date < invoice.issueDate) throw new DomainError("Le paiement ne peut pas précéder l'émission de la facture.", { date: "Date invalide" });
  assertVatPeriodOpen(data, v.date);
  const check = validatePayment(
    invoice,
    data.payments.filter((p) => p.invoiceId === invoice.id),
    v.amount,
    adjustments(data),
  );
  if (!check.ok) throw new DomainError(check.reason, { amount: check.reason });
  const payment: Payment = { id: newId("pay"), ...v, createdAt: ctx.now };
  let next = { ...data, payments: [...data.payments, payment] };
  next = activity(next, ctx, "payment_recorded", `Paiement de ${formatEUR(payment.amount)} reçu sur ${invoice.number}`, { type: "invoice", id: invoice.id });
  next = audit(next, ctx, "payment.record", { type: "payment", id: payment.id }, `${invoice.number} · ${payment.amount}`);
  return { data: next, result: payment, message: `Paiement de ${formatEUR(payment.amount)} enregistré.` };
};

export const deletePayment: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "payments.write");
  const payment = findOrThrow(data.payments, id, "Paiement");
  assertVatPeriodOpen(data, payment.date);
  const invoice = findOrThrow(data.invoices, payment.invoiceId, "Facture");
  const remaining = data.payments.filter((p) => p.invoiceId === invoice.id && p.id !== id);
  const after = summarizeInvoice(
    invoice,
    remaining,
    "9999-12-31",
    [],
    data.refunds.filter((r) => r.invoiceId === invoice.id),
  );
  if (after.paid < 0) throw new DomainError("Un remboursement a déjà été effectué sur ce paiement : il ne peut plus être supprimé.");
  let next = { ...data, payments: data.payments.filter((p) => p.id !== id) };
  next = audit(next, ctx, "payment.delete", { type: "invoice", id: payment.invoiceId }, `${payment.amount}`);
  return { data: next, result: undefined, message: "Paiement supprimé (correction de saisie journalisée)." };
};

/* ----------------------------- Dépenses ----------------------------- */

export const createExpense: Command<ExpenseInput, Expense> = (data, input, ctx) => {
  assertCan(ctx, "expenses.write");
  const v = parse(expenseSchema, input);
  if (v.paid && v.paidDate && v.paidDate > ctx.today) throw new DomainError("La date de paiement ne peut pas être dans le futur.", { paidDate: "Date future" });
  if (v.paid) assertVatPeriodOpen(data, v.paidDate, "paidDate");
  const duplicate = data.expenses.some((e) => e.supplier === v.supplier && e.amountHT === v.amountHT && e.date === v.date && normalize(e.label) === normalize(v.label));
  if (duplicate) throw new DomainError("Une dépense identique (fournisseur, montant, date, libellé) existe déjà.");
  const expense: Expense = { id: newId("exp"), ...v, paidDate: v.paid ? v.paidDate : null, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, expenses: [...data.expenses, expense] };
  next = activity(next, ctx, "expense_created", `Dépense ${expense.label} enregistrée (${formatEUR(expense.amountHT)} HT)`, { type: "expense", id: expense.id });
  next = audit(next, ctx, "expense.create", { type: "expense", id: expense.id }, `${expense.amountHT}`);
  return { data: next, result: expense, message: "Dépense enregistrée." };
};

export const updateExpense: Command<{ id: string; values: ExpenseInput }, Expense> = (data, { id, values }, ctx) => {
  assertCan(ctx, "expenses.write");
  const v = parse(expenseSchema, values);
  if (v.paid && v.paidDate && v.paidDate > ctx.today) throw new DomainError("La date de paiement ne peut pas être dans le futur.", { paidDate: "Date future" });
  const current = findOrThrow(data.expenses, id, "Dépense");
  const nextPaidDate = v.paid ? v.paidDate : null;
  if (current.paid && isVatPeriodClosed(data, current.paidDate)) {
    const cashChanged = v.amountHT !== current.amountHT || v.vatRate !== current.vatRate || !v.paid || nextPaidDate !== current.paidDate;
    if (cashChanged) throw new DomainError(`Dépense payée dans une période de TVA déclarée (${current.paidDate!.slice(0, 7)}) : montant, TVA et paiement ne sont plus modifiables.`);
  } else if (v.paid) {
    assertVatPeriodOpen(data, nextPaidDate, "paidDate");
  }
  const expense: Expense = { ...current, ...v, paidDate: nextPaidDate, updatedAt: ctx.now };
  let next = { ...data, expenses: replace(data.expenses, expense) };
  next = audit(next, ctx, "expense.update", { type: "expense", id }, "");
  return { data: next, result: expense, message: "Dépense mise à jour." };
};

export const markExpensePaid: Command<{ id: string; paidDate: string }, Expense> = (data, { id, paidDate }, ctx) => {
  assertCan(ctx, "expenses.write");
  const current = findOrThrow(data.expenses, id, "Dépense");
  if (current.paid) throw new DomainError("Cette dépense est déjà payée.");
  if (paidDate > ctx.today) throw new DomainError("La date de paiement ne peut pas être dans le futur.");
  assertVatPeriodOpen(data, paidDate, "paidDate");
  const expense: Expense = { ...current, paid: true, paidDate, updatedAt: ctx.now };
  return { data: audit({ ...data, expenses: replace(data.expenses, expense) }, ctx, "expense.pay", { type: "expense", id }, paidDate), result: expense, message: "Dépense marquée comme payée." };
};

export const deleteExpense: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "expenses.write");
  const current = findOrThrow(data.expenses, id, "Dépense");
  if (current.paid && isVatPeriodClosed(data, current.paidDate))
    throw new DomainError(`Dépense payée dans une période de TVA déclarée (${current.paidDate!.slice(0, 7)}) : elle ne peut plus être supprimée.`);
  let next = { ...data, expenses: data.expenses.filter((e) => e.id !== id) };
  next = audit(next, ctx, "expense.delete", { type: "expense", id }, `${current.label} · ${current.amountHT}`);
  return { data: next, result: undefined, message: "Dépense supprimée." };
};

/* ----------------------------- Abonnements ----------------------------- */

export const createSubscription: Command<SubscriptionInput, Subscription> = (data, input, ctx) => {
  assertCan(ctx, "subscriptions.write");
  const v = parse(subscriptionSchema, input);
  findOrThrow(data.clients, v.clientId, "Client");
  const sub: Subscription = { id: newId("sub"), ...v, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, subscriptions: [...data.subscriptions, sub] };
  next = activity(next, ctx, "subscription_created", `Contrat récurrent ${sub.offer} ajouté`, { type: "subscription", id: sub.id });
  return { data: next, result: sub, message: "Abonnement créé." };
};

export const updateSubscription: Command<{ id: string; values: SubscriptionInput }, Subscription> = (data, { id, values }, ctx) => {
  assertCan(ctx, "subscriptions.write");
  const v = parse(subscriptionSchema, values);
  const current = findOrThrow(data.subscriptions, id, "Abonnement");
  if (v.status === "cancelled" && !v.endDate) throw new DomainError("Indiquez la date de fin pour résilier le contrat.", { endDate: "Obligatoire" });
  const sub: Subscription = { ...current, ...v, updatedAt: ctx.now };
  return {
    data: audit({ ...data, subscriptions: replace(data.subscriptions, sub) }, ctx, "subscription.update", { type: "subscription", id }, v.status),
    result: sub,
    message: "Abonnement mis à jour.",
  };
};

/** Facture une échéance d'abonnement. Idempotent : une échéance déjà facturée ne peut pas l'être deux fois. */
export const invoiceSubscriptionPeriod: Command<{ id: string; billingDate: string }, Invoice> = (data, { id, billingDate }, ctx) => {
  assertCan(ctx, "invoices.write");
  const sub = findOrThrow(data.subscriptions, id, "Abonnement");
  if (billingDate > ctx.today) throw new DomainError("Cette échéance n'est pas encore exigible.");
  if (!billingDates(sub, billingDate, billingDate).length) throw new DomainError("Date d'échéance invalide pour ce contrat.");
  if (data.invoices.some((i) => i.subscriptionId === id && i.issueDate === billingDate && i.baseStatus !== "cancelled")) throw new DomainError("Cette échéance a déjà été facturée.");
  const product = sub.productId ? data.products.find((p) => p.id === sub.productId) : undefined;
  const item: LineItem = {
    id: newId("li"),
    productId: sub.productId,
    description: `${sub.offer} — échéance du ${billingDate.split("-").reverse().join("/")}`,
    quantity: 1,
    unitPrice: sub.amount,
    vatRate: product?.vatRate ?? data.settings.company.defaultVatRate,
  };
  const { seq, number } = issueNumber(data, billingDate);
  const invoice: Invoice = {
    id: newId("inv"),
    number,
    clientId: sub.clientId,
    issueDate: billingDate,
    dueDate: addDays(billingDate, 30),
    items: [item],
    baseStatus: "issued",
    projectId: null,
    quoteId: null,
    subscriptionId: id,
    notes: "",
    cancelledAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  let next = { ...data, invoices: [...data.invoices, invoice], sequences: { ...data.sequences, invoice: seq } };
  next = activity(next, ctx, "invoice_issued", `Facture ${number} émise (abonnement ${sub.offer})`, { type: "invoice", id: invoice.id });
  return { data: next, result: invoice, message: `Facture ${number} émise.` };
};

/* ----------------------------- Avoirs et remboursements ----------------------------- */

/**
 * Émet un avoir sur une facture émise. Le total TTC des avoirs ne peut pas dépasser
 * le TTC de la facture. Les lignes sont figées (prix et TVA) comme sur une facture.
 */
export const createCreditNote: Command<CreditNoteInput, CreditNote> = (data, input, ctx) => {
  assertCan(ctx, "invoices.write");
  const v = parse(creditNoteSchema, input);
  const invoice = findOrThrow(data.invoices, v.invoiceId, "Facture");
  if (invoice.baseStatus !== "issued") throw new DomainError("Un avoir ne peut être émis que sur une facture émise (non brouillon, non annulée).");
  if (v.issueDate < invoice.issueDate) throw new DomainError("L'avoir ne peut pas précéder la facture.", { issueDate: "Date invalide" });
  if (v.issueDate > ctx.today) throw new DomainError("L'avoir ne peut pas être daté dans le futur.", { issueDate: "Date future" });
  const totals = documentTotals(v.items);
  if (totals.totalTTC <= 0) throw new DomainError("Le montant de l'avoir doit être strictement positif.", { items: "Montant nul" });
  const max = creditableAmount(invoice, data.creditNotes);
  if (totals.totalTTC > max)
    throw new DomainError(`L'avoir (${formatEUR(totals.totalTTC)} TTC) dépasse le montant restant créditable de la facture (${formatEUR(max)} TTC).`, { items: "Montant trop élevé" });
  const seq = data.sequences.creditNote + 1;
  const note: CreditNote = {
    id: newId("cn"),
    number: `AV-${v.issueDate.slice(0, 4)}-${pad(seq)}`,
    invoiceId: invoice.id,
    clientId: invoice.clientId,
    issueDate: v.issueDate,
    items: v.items,
    reason: v.reason,
    createdAt: ctx.now,
  };
  let next: AppData = { ...data, creditNotes: [...data.creditNotes, note], sequences: { ...data.sequences, creditNote: seq } };
  next = activity(next, ctx, "credit_note_issued", `Avoir ${note.number} émis sur ${invoice.number} (${formatEUR(totals.totalTTC)} TTC)`, { type: "credit_note", id: note.id });
  next = audit(next, ctx, "credit_note.issue", { type: "credit_note", id: note.id }, `${invoice.number} · ${totals.totalTTC} · ${v.reason}`);
  const after = summarizeInvoice(
    invoice,
    next.payments.filter((p) => p.invoiceId === invoice.id),
    ctx.today,
    next.creditNotes.filter((c) => c.invoiceId === invoice.id),
    next.refunds.filter((r) => r.invoiceId === invoice.id),
  );
  const hint = after.creditBalance > 0 ? ` Trop-perçu à rembourser : ${formatEUR(after.creditBalance)}.` : "";
  return { data: next, result: note, message: `Avoir ${note.number} émis.${hint}` };
};

/** Rembourse un trop-perçu client (consécutif à un avoir). Ne peut dépasser le trop-perçu. */
export const recordRefund: Command<RefundInput, Refund> = (data, input, ctx) => {
  assertCan(ctx, "payments.write");
  const v = parse(refundSchema, input);
  const invoice = findOrThrow(data.invoices, v.invoiceId, "Facture");
  if (v.date > ctx.today) throw new DomainError("La date de remboursement ne peut pas être dans le futur.", { date: "Date future" });
  assertVatPeriodOpen(data, v.date);
  if (v.creditNoteId && !data.creditNotes.some((c) => c.id === v.creditNoteId && c.invoiceId === invoice.id)) throw new DomainError("Avoir introuvable sur cette facture.");
  const s = summarizeInvoice(
    invoice,
    data.payments.filter((p) => p.invoiceId === invoice.id),
    "9999-12-31",
    data.creditNotes.filter((c) => c.invoiceId === invoice.id),
    data.refunds.filter((r) => r.invoiceId === invoice.id),
  );
  if (s.creditBalance <= 0) throw new DomainError("Aucun trop-perçu à rembourser sur cette facture.");
  if (v.amount > s.creditBalance) throw new DomainError(`Le remboursement dépasse le trop-perçu (${formatEUR(s.creditBalance)}).`, { amount: "Montant trop élevé" });
  const refund: Refund = { id: newId("ref"), ...v, createdAt: ctx.now };
  let next: AppData = { ...data, refunds: [...data.refunds, refund] };
  next = activity(next, ctx, "refund_recorded", `Remboursement de ${formatEUR(refund.amount)} sur ${invoice.number}`, { type: "invoice", id: invoice.id });
  next = audit(next, ctx, "refund.record", { type: "invoice", id: invoice.id }, `${refund.amount}`);
  return { data: next, result: refund, message: `Remboursement de ${formatEUR(refund.amount)} enregistré.` };
};

/* ----------------------------- TVA ----------------------------- */

/**
 * Déclare la TVA d'une période complète. Les déclarations sont séquentielles (la
 * période doit être la plus ancienne non déclarée) ; les montants sont figés et la
 * période est ensuite clôturée pour les flux de trésorerie.
 */
export const declareVatReturn: Command<{ period: string }, VatReturn> = (data, { period }, ctx) => {
  assertCan(ctx, "vat.write");
  const rows = vatPeriods(data, ctx.today);
  const next = nextPeriodToDeclare(rows);
  if (!rows.some((r) => r.period === period)) throw new DomainError("Cette période n'est pas déclarable (mois non terminé ou antérieur au suivi de TVA).");
  if (data.vatReturns.some((r) => r.period === period)) throw new DomainError("Cette période est déjà déclarée.");
  if (!next || next.period !== period) throw new DomainError(`Déclarez d'abord la période ${next?.period ?? ""}.`);
  const vatReturn: VatReturn = {
    id: newId("vat"),
    period,
    collected: next.collected,
    deductible: next.deductible,
    creditCarriedIn: next.creditCarriedIn,
    net: next.net,
    status: next.net > 0 ? "declared" : "credit",
    dueDate: next.dueDate,
    declaredAt: ctx.now,
    paidDate: null,
    reference: "",
  };
  let out: AppData = { ...data, vatReturns: [...data.vatReturns, vatReturn] };
  out = activity(out, ctx, "vat_declared", `TVA de ${period} déclarée (${vatReturn.net > 0 ? `${formatEUR(vatReturn.net)} à payer` : `crédit ${formatEUR(-vatReturn.net)} reporté`})`, {
    type: "vat_return",
    id: vatReturn.id,
  });
  out = audit(out, ctx, "vat.declare", { type: "vat_return", id: vatReturn.id }, `${period} · net ${vatReturn.net}`);
  return {
    data: out,
    result: vatReturn,
    message:
      vatReturn.net > 0
        ? `TVA de ${period} déclarée : ${formatEUR(vatReturn.net)} à payer avant le ${vatReturn.dueDate.split("-").reverse().join("/")}.`
        : `TVA de ${period} déclarée : crédit de ${formatEUR(-vatReturn.net)} reporté.`,
  };
};

/** Enregistre le paiement d'une déclaration de TVA (décaissement réel). */
export const payVatReturn: Command<{ id: string; paidDate: string; reference: string }, VatReturn> = (data, { id, paidDate, reference }, ctx) => {
  assertCan(ctx, "vat.write");
  const current = findOrThrow(data.vatReturns, id, "Déclaration de TVA");
  if (current.status !== "declared") throw new DomainError(current.status === "paid" ? "Cette déclaration est déjà payée." : "Aucun montant à payer (crédit de TVA).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new DomainError("Date invalide.", { paidDate: "Date invalide" });
  if (paidDate > ctx.today) throw new DomainError("La date de paiement ne peut pas être dans le futur.", { paidDate: "Date future" });
  if (paidDate.slice(0, 7) <= current.period) throw new DomainError("Le paiement doit intervenir après la fin de la période déclarée.", { paidDate: "Date invalide" });
  const paid: VatReturn = { ...current, status: "paid", paidDate, reference: reference.trim().slice(0, 100) };
  let out: AppData = { ...data, vatReturns: replace(data.vatReturns, paid) };
  out = activity(out, ctx, "vat_paid", `TVA de ${current.period} payée (${formatEUR(current.net)})`, { type: "vat_return", id });
  out = audit(out, ctx, "vat.pay", { type: "vat_return", id }, `${current.period} · ${current.net} · ${paidDate}`);
  return { data: out, result: paid, message: `Paiement de TVA de ${formatEUR(current.net)} enregistré.` };
};
