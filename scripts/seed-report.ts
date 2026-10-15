import { createSeedData } from "../src/lib/database/seed";
import { summarizeInvoices } from "../src/lib/calculations/invoices";
import { monthlySeries, financialSnapshot } from "../src/lib/calculations/finance";
import { presetPeriod, previousPeriod } from "../src/lib/calculations/dates";
import { computeGameMetrics } from "../src/lib/gamification/metrics";
import { computeRank } from "../src/lib/gamification/ranks";
import { levelFromXp } from "../src/lib/gamification/levels";
import { computeAlerts } from "../src/lib/calculations/alerts";
import { projectFinancials, projectProgress } from "../src/lib/calculations/projects";
import { evaluateGoal } from "../src/lib/calculations/goals";
import { buildForecast } from "../src/lib/calculations/cashflow";

const anchor = process.argv[2] ?? "2026-10-15";
const t0 = Date.now();
const d = createSeedData(anchor);
console.log("seed ms", Date.now() - t0);
const s = summarizeInvoices(d.invoices, d.payments, anchor);
const counts = Object.fromEntries(Object.entries(d).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
console.log(counts);
console.log("status", s.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] ?? 0) + 1 }), {} as Record<string, number>));
for (const m of monthlySeries(d, anchor, 13, s)) console.log(m.month, "billed", m.billed / 100, "coll", m.collected / 100, "disb", m.disbursed / 100, "exp", m.expenses / 100, "res", m.result / 100, "cash", m.cash / 100, "mrr", m.mrr / 100);
const p = presetPeriod("month", anchor);
const snap = financialSnapshot(d, s, p, previousPeriod(p), anchor);
console.log("snapshot", { cash: snap.cash / 100, rec: snap.receivables / 100, overdue: snap.overdueReceivables / 100, pay: snap.payables / 100, mrr: snap.mrr / 100 });
const m = computeGameMetrics(d, anchor, s);
console.log("metrics", m);
console.log("rank", JSON.stringify(computeRank(m), null, 0));
const xp = d.xpTransactions.reduce((a, x) => a + x.amount, 0);
console.log("xp", xp, levelFromXp(xp), "achievements", d.achievements.map((a) => a.achievementId));
console.log("alerts", computeAlerts(d, anchor, s).map((a) => `${a.severity} ${a.title}`));
for (const pr of d.projects) { const f = projectFinancials(pr, d, s); console.log(pr.code, pr.status, projectProgress(pr, d.tasks) + "%", "budget", f.budget / 100, "actual", f.actualCost / 100, "inv", f.invoiced / 100, "var", f.budgetVariance / 100); }
for (const g of d.goals) { const e = evaluateGoal(g, d, anchor, s); console.log(g.title, e.current, e.progress, e.status); }
for (const sc of ["prudent", "central", "optimistic"] as const) { const f = buildForecast(d, anchor, sc); console.log(sc, f.months.map((x) => `${x.month}:${Math.round(x.closingBalance / 100)}`).join(" ")); }
console.log("missions", d.missions.map((x) => `${x.source}/${x.status} ${x.title}`));
console.log("notifications", d.notifications.length);
