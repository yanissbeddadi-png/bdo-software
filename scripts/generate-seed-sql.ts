/**
 * Génère supabase/seed.sql à partir du même générateur que le mode démonstration
 * (src/lib/database/seed.ts). Usage : npm run seed:sql [-- AAAA-MM-JJ]
 * Toutes les données sont fictives. L'organisation de démo a l'identifiant `org_demo`.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSeedData } from "../src/lib/database/seed";
import { ACHIEVEMENTS } from "../src/lib/gamification/achievements";

const anchor = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const d = createSeedData(anchor);
const ORG = "org_demo";

type V = string | number | boolean | null | undefined | object;
const lit = (v: V): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${v.replace(/'/g, "''")}'`;
};
const out: string[] = [
  "-- Généré par scripts/generate-seed-sql.ts — DONNÉES FICTIVES DE DÉMONSTRATION",
  `-- Date d'ancrage : ${anchor}`,
  "begin;",
  `insert into public.organizations (id, name, settings, is_demo) values (${lit(ORG)}, ${lit(d.settings.company.name)}, ${lit({ company: d.settings.company, rules: d.settings.rules, gamification: d.settings.gamification })}, true);`,
];
const insert = (table: string, rows: Record<string, V>[]) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    out.push(`insert into public.${table} (${cols.join(", ")}) values\n${chunk.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n")};`);
  }
};
const org = { organization_id: ORG };

insert("achievements", ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, description: a.description, category: a.category, rarity: a.rarity, condition: a.condition, icon: a.icon })));
insert("clients", d.clients.map((c) => ({ id: c.id, ...org, name: c.name, sector: c.sector, status: c.status, city: c.city, website: c.website, satisfaction: c.satisfaction, notes: c.notes, created_at: c.createdAt, updated_at: c.updatedAt })));
insert("client_documents", d.clients.flatMap((c) => c.documents.map((doc) => ({ id: doc.id, ...org, client_id: c.id, name: doc.name, kind: doc.kind, created_at: doc.addedAt }))));
insert("leads", d.leads.map((l) => ({ id: l.id, ...org, company: l.company, contact_name: l.contactName, email: l.email, phone: l.phone, sector: l.sector, source: l.source, priority: l.priority, status: l.status, next_action: l.nextAction, next_action_date: l.nextActionDate, converted_client_id: l.convertedClientId, notes: l.notes, created_at: l.createdAt, updated_at: l.updatedAt })));
insert("contacts", d.contacts.map((c) => ({ id: c.id, ...org, client_id: c.clientId, lead_id: c.leadId, first_name: c.firstName, last_name: c.lastName, job_title: c.jobTitle, email: c.email, phone: c.phone, is_primary: c.isPrimary, notes: c.notes, created_at: c.createdAt, updated_at: c.updatedAt })));
insert("employees", d.employees.map((e) => ({ id: e.id, ...org, first_name: e.firstName, last_name: e.lastName, job_title: e.jobTitle, department: e.department, email: e.email, hire_date: e.hireDate, status: e.status, monthly_cost: e.monthlyCost, created_at: e.createdAt, updated_at: e.updatedAt })));
insert("employee_skills", d.employees.flatMap((e) => Object.entries(e.skills).map(([skill, level]) => ({ employee_id: e.id, skill, level }))));
insert("opportunities", d.opportunities.map((o) => ({ id: o.id, ...org, name: o.name, client_id: o.clientId, lead_id: o.leadId, contact_id: o.contactId, amount: o.amount, probability: o.probability, stage: o.stage, expected_close_date: o.expectedCloseDate, source: o.source, owner_id: o.ownerId, last_interaction_at: o.lastInteractionAt, next_action: o.nextAction, notes: o.notes, closed_at: o.closedAt, lost_reason: o.lostReason, created_at: o.createdAt, updated_at: o.updatedAt })));
insert("products", d.products.map((p) => ({ id: p.id, ...org, name: p.name, sku: p.sku, description: p.description, type: p.type, category: p.category, unit_price: p.unitPrice, unit_cost: p.unitCost, billing_mode: p.billingMode, vat_rate: p.vatRate, status: p.status, created_at: p.createdAt, updated_at: p.updatedAt })));
insert("quotes", d.quotes.map((q) => ({ id: q.id, ...org, number: q.number, client_id: q.clientId, opportunity_id: q.opportunityId, issue_date: q.issueDate, expiry_date: q.expiryDate, status: q.status, notes: q.notes, created_at: q.createdAt, updated_at: q.updatedAt })));
insert("quote_items", d.quotes.flatMap((q) => q.items.map((l, i) => ({ id: `${q.id}_${l.id}`, quote_id: q.id, position: i, product_id: l.productId, description: l.description, quantity: l.quantity, unit_price: l.unitPrice, vat_rate: l.vatRate }))));
insert("projects", d.projects.map((p) => ({ id: p.id, ...org, code: p.code, name: p.name, client_id: p.clientId, opportunity_id: p.opportunityId, description: p.description, manager_id: p.managerId, start_date: p.startDate, due_date: p.dueDate, budget: p.budget, sale_price: p.salePrice, estimated_cost: p.estimatedCost, priority: p.priority, status: p.status, risks: p.risks, completed_at: p.completedAt, created_at: p.createdAt, updated_at: p.updatedAt })));
insert("project_members", d.projects.flatMap((p) => p.memberIds.map((m) => ({ project_id: p.id, employee_id: m }))));
insert("project_milestones", d.projects.flatMap((p) => p.milestones.map((m) => ({ id: m.id, project_id: p.id, title: m.title, due_date: m.dueDate, done: m.done, done_at: m.doneAt }))));
insert("subscriptions", d.subscriptions.map((s) => ({ id: s.id, ...org, client_id: s.clientId, product_id: s.productId, offer: s.offer, amount: s.amount, periodicity: s.periodicity, start_date: s.startDate, end_date: s.endDate, status: s.status, renewal_terms: s.renewalTerms, created_at: s.createdAt, updated_at: s.updatedAt })));
insert("invoices", d.invoices.map((i) => ({ id: i.id, ...org, number: i.number, client_id: i.clientId, issue_date: i.issueDate, due_date: i.dueDate, base_status: i.baseStatus, project_id: i.projectId, quote_id: i.quoteId, subscription_id: i.subscriptionId, notes: i.notes, cancelled_at: i.cancelledAt, created_at: i.createdAt, updated_at: i.updatedAt })));
insert("invoice_items", d.invoices.flatMap((inv) => inv.items.map((l, i) => ({ id: `${inv.id}_${l.id}`, invoice_id: inv.id, position: i, product_id: l.productId, description: l.description, quantity: l.quantity, unit_price: l.unitPrice, vat_rate: l.vatRate }))));
out.push(...d.quotes.filter((q) => q.invoiceId).map((q) => `update public.quotes set invoice_id = ${lit(q.invoiceId)} where id = ${lit(q.id)};`));
insert("payments", d.payments.map((p) => ({ id: p.id, ...org, invoice_id: p.invoiceId, date: p.date, amount: p.amount, method: p.method, reference: p.reference, notes: p.notes, created_at: p.createdAt })));
insert("expenses", d.expenses.map((e) => ({ id: e.id, ...org, label: e.label, supplier: e.supplier, category: e.category, date: e.date, amount_ht: e.amountHT, vat_rate: e.vatRate, paid: e.paid, paid_date: e.paidDate, due_date: e.dueDate, project_id: e.projectId, notes: e.notes, created_at: e.createdAt, updated_at: e.updatedAt })));
insert("goals", d.goals.map((g) => ({ id: g.id, ...org, title: g.title, description: g.description, type: g.type, period_label: g.periodLabel, period_start: g.periodStart, period_end: g.periodEnd, owner_id: g.ownerId, metric: g.metric, start_value: g.startValue, target_value: g.targetValue, manual_value: g.manualValue, unit: g.unit, archived: g.archived, created_at: g.createdAt, updated_at: g.updatedAt })));
insert("goal_key_results", d.goals.flatMap((g) => g.keyResults.map((k) => ({ id: k.id, goal_id: g.id, title: k.title, target: k.target, current: k.current, unit: k.unit }))));
insert("tasks", d.tasks.map((t) => ({ id: t.id, ...org, title: t.title, description: t.description, assignee_id: t.assigneeId, priority: t.priority, status: t.status, complexity: t.complexity, due_date: t.dueDate, estimate_hours: t.estimateHours, actual_hours: t.actualHours, project_id: t.projectId, client_id: t.clientId, goal_id: t.goalId, recurrence: t.recurrence, completed_at: t.completedAt, created_at: t.createdAt, updated_at: t.updatedAt })));
insert("task_dependencies", d.tasks.flatMap((t) => t.dependsOn.map((dep) => ({ task_id: t.id, depends_on_id: dep }))));
insert("task_comments", d.tasks.flatMap((t) => t.comments.map((c) => ({ id: c.id, task_id: t.id, author: c.author, text: c.text, created_at: c.at }))));
insert("sales_activities", d.salesActivities.map((a) => ({ id: a.id, ...org, type: a.type, date: a.date, subject: a.subject, notes: a.notes, client_id: a.clientId, lead_id: a.leadId, opportunity_id: a.opportunityId, invoice_id: a.invoiceId, owner_id: a.ownerId, done: a.done, created_at: a.createdAt })));
insert("missions", d.missions.map((m) => ({ id: m.id, ...org, title: m.title, description: m.description, category: m.category, type: m.type, difficulty: m.difficulty, priority: m.priority, status: m.status, start_date: m.startDate, due_date: m.dueDate, xp_reward: m.xpReward, condition: m.condition, entity_type: m.entity?.type ?? null, entity_id: m.entity?.id ?? null, source: m.source, auto_key: m.autoKey, completed_at: m.completedAt, created_at: m.createdAt })));
insert("mission_progress", d.missions.flatMap((m) => m.history.map((h) => ({ mission_id: m.id, at: h.at, text: h.text }))));
insert("user_achievements", d.achievements.map((a) => ({ ...org, achievement_id: a.achievementId, unlocked_at: a.unlockedAt })));
insert("xp_transactions", d.xpTransactions.map((x) => ({ id: x.id, ...org, at: x.at, amount: x.amount, reason: x.reason, source: x.source, entity_type: x.ref?.type ?? null, entity_id: x.ref?.id ?? null, idempotency_key: x.idempotencyKey })));
insert("progression_entries", d.progression.map((p) => ({ id: p.id, ...org, at: p.at, kind: p.kind, message: p.message, key: p.key })));
out.push(`insert into public.company_progress (organization_id, announced_level, announced_rank, progression_start, no_late_task_since) values (${lit(ORG)}, ${d.settings.gamification.announcedLevel}, ${d.settings.gamification.announcedRank}, ${lit(d.settings.gamification.progressionStart)}, ${lit(d.settings.gamification.noLateTaskSince)});`);
insert("notifications", d.notifications.map((n) => ({ id: n.id, ...org, key: n.key, category: n.category, severity: n.severity, title: n.title, body: n.body, entity_type: n.ref?.type ?? null, entity_id: n.ref?.id ?? null, read: n.read, created_at: n.at })));
insert("activity_events", d.activity.map((a) => ({ id: a.id, ...org, at: a.at, type: a.type, description: a.description, entity_type: a.ref?.type ?? null, entity_id: a.ref?.id ?? null })));
insert("audit_logs", d.auditLogs.map((a) => ({ id: a.id, ...org, at: a.at, actor: a.actor, role: a.role, action: a.action, entity_type: a.ref?.type ?? null, entity_id: a.ref?.id ?? null, details: a.details })));
insert("notes", d.notes.map((n) => ({ id: n.id, ...org, title: n.title, body: n.body, client_id: n.clientId, project_id: n.projectId, created_at: n.createdAt, updated_at: n.updatedAt })));
out.push("commit;", "");

const target = resolve(process.cwd(), "supabase/seed.sql");
writeFileSync(target, out.join("\n"));
console.log(`seed.sql écrit (${out.length} instructions, ancrage ${anchor}) → ${target}`);
