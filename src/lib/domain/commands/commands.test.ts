import { describe, expect, it } from "vitest";
import { execute } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import { summarizeInvoices } from "@/lib/calculations/invoices";
import { documentTotals } from "@/lib/calculations/money";
import { client, ctx, CLIENT_INPUT, emptyData, line, OPPORTUNITY_INPUT, TASK_INPUT, TODAY } from "@/test/fixtures";
import type { AppData } from "@/lib/domain/types";

function base(): AppData {
  const d = emptyData();
  d.clients = [client()];
  return d;
}
function ok<R>(res: ReturnType<typeof execute<unknown, R>>) {
  if (!res.ok) throw new Error(res.error);
  return res;
}
const invoiceInput = (issue = true) => ({ clientId: "cli_1", issueDate: "2026-10-01", dueDate: "2026-10-31", items: [line(2, 500), line(1, 100, 1000)], projectId: null, notes: "", issue });

describe("factures et paiements", () => {
  it("crée une facture émise numérotée séquentiellement", () => {
    const a = ok(execute(base(), C.createInvoice, invoiceInput(), ctx()));
    const b = ok(execute(a.data, C.createInvoice, invoiceInput(), ctx()));
    expect(a.result.number).toBe("FAC-2026-0001");
    expect(b.result.number).toBe("FAC-2026-0002");
  });

  it("un brouillon reçoit son numéro à l'émission et ne peut pas recevoir de paiement", () => {
    const draft = ok(execute(base(), C.createInvoice, invoiceInput(false), ctx()));
    expect(draft.result.number.startsWith("BROUILLON")).toBe(true);
    expect(execute(draft.data, C.recordPayment, { invoiceId: draft.result.id, date: TODAY, amount: 100, method: "transfer", reference: "", notes: "" }, ctx()).ok).toBe(false);
    const issued = ok(execute(draft.data, C.issueInvoice, { id: draft.result.id }, ctx()));
    expect(issued.result.number).toBe("FAC-2026-0001");
  });

  it("recalcule le solde et le statut après paiements partiel puis intégral", () => {
    let d = ok(execute(base(), C.createInvoice, invoiceInput(), ctx())).data;
    const inv = d.invoices[0]!;
    const ttc = documentTotals(inv.items).totalTTC; // 1 000 € × 1,2 + 100 € × 1,1 = 1 310 €
    expect(ttc).toBe(131_000);
    d = ok(execute(d, C.recordPayment, { invoiceId: inv.id, date: TODAY, amount: 31_000, method: "transfer", reference: "", notes: "" }, ctx())).data;
    let s = summarizeInvoices(d.invoices, d.payments, TODAY)[0]!;
    expect(s.status).toBe("partially_paid");
    expect(s.balance).toBe(100_000);
    const over = execute(d, C.recordPayment, { invoiceId: inv.id, date: TODAY, amount: 100_001, method: "transfer", reference: "", notes: "" }, ctx());
    expect(over.ok).toBe(false);
    d = ok(execute(d, C.recordPayment, { invoiceId: inv.id, date: TODAY, amount: 100_000, method: "card", reference: "", notes: "" }, ctx())).data;
    s = summarizeInvoices(d.invoices, d.payments, TODAY)[0]!;
    expect(s.status).toBe("paid");
    expect(s.balance).toBe(0);
  });

  it("refuse un paiement daté dans le futur", () => {
    const d = ok(execute(base(), C.createInvoice, invoiceInput(), ctx())).data;
    expect(execute(d, C.recordPayment, { invoiceId: d.invoices[0]!.id, date: "2026-12-01", amount: 100, method: "transfer", reference: "", notes: "" }, ctx()).ok).toBe(false);
  });

  it("interdit l'annulation d'une facture comportant des paiements", () => {
    let d = ok(execute(base(), C.createInvoice, invoiceInput(), ctx())).data;
    const id = d.invoices[0]!.id;
    d = ok(execute(d, C.recordPayment, { invoiceId: id, date: TODAY, amount: 1_000, method: "transfer", reference: "", notes: "" }, ctx())).data;
    expect(execute(d, C.cancelInvoice, { id, reason: "test" }, ctx()).ok).toBe(false);
  });

  it("une facture émise garde ses lignes figées lors d'une modification", () => {
    const d = ok(execute(base(), C.createInvoice, invoiceInput(), ctx())).data;
    const inv = d.invoices[0]!;
    const res = ok(execute(d, C.updateInvoice, { id: inv.id, values: { ...invoiceInput(), items: [line(1, 1)], dueDate: "2026-11-15", notes: "Nouvelle échéance" } }, ctx()));
    expect(res.result.items).toEqual(inv.items);
    expect(res.result.dueDate).toBe("2026-11-15");
  });

  it("la modification du catalogue ne réécrit pas les prix historiques", () => {
    let d = base();
    const p = ok(
      execute(
        d,
        C.createProduct,
        { name: "BDO Test", sku: "T-1", description: "", type: "saas", category: "", unitPrice: 10_000, unitCost: 1_000, billingMode: "monthly", vatRate: 2000, status: "active" },
        ctx(),
      ),
    );
    d = p.data;
    d = ok(execute(d, C.createInvoice, { ...invoiceInput(), items: [{ id: "li", productId: p.result.id, description: "BDO Test", quantity: 1, unitPrice: 10_000, vatRate: 2000 }] }, ctx())).data;
    d = ok(execute(d, C.updateProduct, { id: p.result.id, values: { ...p.result, unitPrice: 99_000 } }, ctx())).data;
    expect(d.invoices[0]!.items[0]!.unitPrice).toBe(10_000);
  });
});

describe("devis", () => {
  it("convertit un devis accepté en facture en préservant lignes, montants et client", () => {
    let d = base();
    const q = ok(execute(d, C.createQuote, { clientId: "cli_1", opportunityId: null, issueDate: "2026-10-01", expiryDate: "2026-10-31", items: [line(3, 650), line(1, -100)], notes: "" }, ctx()));
    d = q.data;
    expect(execute(d, C.convertQuoteToInvoice, { id: q.result.id }, ctx()).ok).toBe(false); // pas encore accepté
    d = ok(execute(d, C.setQuoteStatus, { id: q.result.id, status: "sent" }, ctx())).data;
    d = ok(execute(d, C.setQuoteStatus, { id: q.result.id, status: "accepted" }, ctx())).data;
    const conv = ok(execute(d, C.convertQuoteToInvoice, { id: q.result.id }, ctx()));
    expect(conv.result.clientId).toBe("cli_1");
    expect(documentTotals(conv.result.items)).toEqual(documentTotals(q.result.items));
    expect(conv.data.quotes[0]!.invoiceId).toBe(conv.result.id);
    expect(execute(conv.data, C.convertQuoteToInvoice, { id: q.result.id }, ctx()).ok).toBe(false); // pas de double conversion
  });

  it("refuse une transition de statut invalide", () => {
    const q = ok(execute(base(), C.createQuote, { clientId: "cli_1", opportunityId: null, issueDate: "2026-10-01", expiryDate: "2026-10-31", items: [line(1, 100)], notes: "" }, ctx()));
    expect(execute(q.data, C.setQuoteStatus, { id: q.result.id, status: "accepted" }, ctx()).ok).toBe(false);
  });
});

describe("CRM", () => {
  it("refuse une entreprise en doublon évident", () => {
    expect(execute(base(), C.createClient, { ...CLIENT_INPUT, name: "Nova Test" }, ctx()).ok).toBe(false);
    expect(execute(base(), C.createClient, { ...CLIENT_INPUT, name: "Autre entreprise" }, ctx()).ok).toBe(true);
  });

  it("déplacer une opportunité met à jour probabilité et date de clôture sans créer d'encaissement", () => {
    const o = ok(execute(base(), C.createOpportunity, OPPORTUNITY_INPUT, ctx()));
    let d = ok(execute(o.data, C.moveOpportunity, { id: o.result.id, stage: "negotiation" }, ctx())).data;
    expect(d.opportunities[0]!.probability).toBe(75);
    d = ok(execute(d, C.moveOpportunity, { id: o.result.id, stage: "won" }, ctx())).data;
    expect(d.opportunities[0]!.closedAt).not.toBeNull();
    expect(d.payments).toHaveLength(0);
  });
});

describe("tâches et projets", () => {
  const task = { ...TASK_INPUT, recurrence: "weekly" as const };

  it("une tâche récurrente terminée planifie l'occurrence suivante", () => {
    const t = ok(execute(base(), C.createTask, task, ctx()));
    const done = ok(execute(t.data, C.setTaskStatus, { id: t.result.id, status: "done" }, ctx()));
    const next = done.data.tasks.find((x) => x.id !== t.result.id)!;
    expect(next.dueDate).toBe("2026-10-27");
    expect(next.status).toBe("todo");
  });

  it("refuse de terminer une tâche bloquée par une dépendance ouverte et les cycles", () => {
    const a = ok(execute(base(), C.createTask, { ...task, recurrence: "none" }, ctx()));
    const b = ok(execute(a.data, C.createTask, { ...task, title: "Suite", recurrence: "none", dependsOn: [a.result.id] }, ctx()));
    expect(execute(b.data, C.setTaskStatus, { id: b.result.id, status: "done" }, ctx()).ok).toBe(false);
    expect(execute(b.data, C.updateTask, { id: a.result.id, values: { ...task, recurrence: "none", dependsOn: [b.result.id] } }, ctx()).ok).toBe(false);
  });

  it("ne clôture pas un projet ayant des tâches ouvertes", () => {
    let d = base();
    const p = ok(
      execute(
        d,
        C.createProject,
        {
          name: "Portail",
          clientId: "cli_1",
          opportunityId: null,
          description: "",
          managerId: null,
          memberIds: [],
          startDate: "2026-10-01",
          dueDate: "2026-12-01",
          budget: 0,
          salePrice: 0,
          estimatedCost: 0,
          priority: "normal",
          status: "in_progress",
          risks: "",
        },
        ctx(),
      ),
    );
    d = ok(execute(p.data, C.createTask, { ...task, recurrence: "none", projectId: p.result.id }, ctx())).data;
    expect(execute(d, C.setProjectStatus, { id: p.result.id, status: "done" }, ctx()).ok).toBe(false);
  });
});

describe("permissions et validation", () => {
  it("refuse l'émission de facture à un collaborateur", () => {
    const res = execute(base(), C.createInvoice, invoiceInput(), ctx("collaborateur"));
    expect(res.ok).toBe(false);
  });

  it("autorise la création de tâche au collaborateur mais pas la création de client", () => {
    expect(execute(base(), C.createTask, { ...TASK_INPUT, title: "x", priority: "low", dueDate: null }, ctx("collaborateur")).ok).toBe(true);
    expect(execute(base(), C.createClient, { ...CLIENT_INPUT, name: "Y" }, ctx("collaborateur")).ok).toBe(false);
  });

  it("revalide les entrées et renvoie les erreurs par champ", () => {
    const res = execute(base(), C.createInvoice, { ...invoiceInput(), dueDate: "2026-09-01" }, ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.dueDate).toBeDefined();
    const empty = execute(base(), C.createInvoice, { ...invoiceInput(), items: [] }, ctx());
    expect(empty.ok).toBe(false);
  });

  it("journalise les opérations sensibles", () => {
    const res = ok(execute(base(), C.createInvoice, invoiceInput(), ctx()));
    expect(res.data.auditLogs.some((a) => a.action === "invoice.issue")).toBe(true);
  });

  it("une commande en échec ne modifie pas les données (tout ou rien)", () => {
    const d = base();
    const res = execute(d, C.createInvoice, { ...invoiceInput(), clientId: "inexistant" }, ctx());
    expect(res.ok).toBe(false);
    expect(d.invoices).toHaveLength(0);
  });
});
