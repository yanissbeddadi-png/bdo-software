import type { AppData, Department, Employee, ISODate, Task } from "@/lib/domain/types";
import type { Alert, AlertKind } from "./alerts";
import type { InvoiceSummary } from "./invoices";
import { addDays } from "./dates";
import { isProjectActive, isProjectLate, isTaskLate, isTaskOpen } from "./projects";
import { cashBalance, overdueReceivables } from "./finance";
import { vatOutstanding } from "./vat";
import { isOpen } from "./pipeline";

/**
 * Bureaux virtuels — modèle des locaux de BDO Software (vue 3D `/bureaux`).
 *
 * Tout est **dérivé des données métier** : les zones affichent les indicateurs et les
 * alertes de leur service, et la position / l'occupation de chaque collaborateur à une
 * minute donnée découle de son emploi du temps du jour :
 *
 * - journée 9 h – 18 h (hors de cette plage : « hors bureau ») ;
 * - activités commerciales du jour (réunion, démo : salle de réunion ; appel : au poste) ;
 * - pause déjeuner d'une heure (début à 12 h, 12 h 30 ou 13 h selon la personne) et une
 *   pause café de 15 min, à heures stables pour une même journée ;
 * - sinon, travail sur la tâche ouverte la plus prioritaire, ou « disponible ».
 *
 * Le « direct » est donc une simulation déterministe : la même minute donne toujours le
 * même état. Les unités de position sont des mètres (x vers la droite, z vers le bas).
 */

export const WORKDAY = { start: 9 * 60, end: 18 * 60 } as const;
export const BUILDING = { width: 32, depth: 22 } as const;

export type ZoneId = "accueil" | "direction" | "finance" | "reunion" | "commercial" | "developpement" | "detente" | "support" | "operations" | "rnd" | "terrasse";

export interface ZoneDefinition {
  id: ZoneId;
  label: string;
  /** Libellé court (petits écrans). */
  short: string;
  /** Rectangle au sol (mètres). */
  rect: { x: number; z: number; w: number; d: number };
  color: string;
  departments: Department[];
  /** Rang d'entreprise requis pour débloquer la zone. */
  minRank: number;
  href: string | null;
  kind: "team" | "meeting" | "break" | "reception" | "bonus";
}

export const ZONES: ZoneDefinition[] = [
  { id: "accueil", label: "Accueil", short: "Accueil", rect: { x: 0, z: 0, w: 6, d: 8 }, color: "#64748b", departments: [], minRank: 1, href: "/clients", kind: "reception" },
  { id: "direction", label: "Direction", short: "Direction", rect: { x: 6, z: 0, w: 8, d: 8 }, color: "#9085e9", departments: ["direction"], minRank: 1, href: "/objectifs", kind: "team" },
  { id: "finance", label: "Finance", short: "Finance", rect: { x: 14, z: 0, w: 7, d: 8 }, color: "#199e70", departments: ["finance"], minRank: 1, href: "/finances", kind: "team" },
  { id: "reunion", label: "Salle de réunion", short: "Réunion", rect: { x: 21, z: 0, w: 11, d: 8 }, color: "#3987e5", departments: [], minRank: 1, href: "/crm/activites", kind: "meeting" },
  {
    id: "commercial",
    label: "Commercial & marketing",
    short: "Commercial",
    rect: { x: 0, z: 8, w: 11, d: 7 },
    color: "#d95926",
    departments: ["sales", "marketing"],
    minRank: 1,
    href: "/crm",
    kind: "team",
  },
  { id: "developpement", label: "Développement", short: "Dév.", rect: { x: 11, z: 8, w: 12, d: 7 }, color: "#3987e5", departments: ["development"], minRank: 1, href: "/taches", kind: "team" },
  { id: "detente", label: "Espace détente", short: "Détente", rect: { x: 23, z: 8, w: 9, d: 7 }, color: "#c98500", departments: [], minRank: 1, href: null, kind: "break" },
  { id: "support", label: "Support client", short: "Support", rect: { x: 0, z: 15, w: 8, d: 7 }, color: "#d55181", departments: ["support"], minRank: 1, href: "/clients", kind: "team" },
  { id: "operations", label: "Projets & opérations", short: "Projets", rect: { x: 8, z: 15, w: 10, d: 7 }, color: "#008300", departments: ["operations"], minRank: 1, href: "/projets", kind: "team" },
  { id: "rnd", label: "Laboratoire R&D", short: "R&D", rect: { x: 18, z: 15, w: 7, d: 7 }, color: "#9085e9", departments: [], minRank: 4, href: null, kind: "bonus" },
  { id: "terrasse", label: "Terrasse", short: "Terrasse", rect: { x: 25, z: 15, w: 7, d: 7 }, color: "#199e70", departments: [], minRank: 6, href: null, kind: "bonus" },
];

const ZONE_BY_DEPARTMENT: Record<Department, ZoneId> = {
  direction: "direction",
  finance: "finance",
  sales: "commercial",
  marketing: "commercial",
  development: "developpement",
  support: "support",
  operations: "operations",
};

/** Alertes rattachées à chaque zone (affichées sur le plan). */
const ZONE_BY_ALERT: Partial<Record<AlertKind, ZoneId>> = {
  invoice_overdue: "finance",
  cash_low: "finance",
  cash_forecast: "finance",
  vat_declaration: "finance",
  vat_payment: "finance",
  refund_due: "finance",
  expense_overdue: "finance",
  opportunity_stale: "commercial",
  contract_ending: "commercial",
  project_late: "operations",
  project_budget: "operations",
  dependency: "operations",
  task_critical: "developpement",
  goal_risk: "direction",
  workload: "direction",
};

export function zoneForDepartment(d: Department): ZoneId {
  return ZONE_BY_DEPARTMENT[d];
}

export function zoneById(id: ZoneId): ZoneDefinition {
  return ZONES.find((z) => z.id === id)!;
}

export function isZoneUnlocked(zone: ZoneDefinition, rank: number): boolean {
  return rank >= zone.minRank;
}

/* ------------------------------------------------------------------ */
/* Postes de travail                                                   */
/* ------------------------------------------------------------------ */

export interface Point {
  x: number;
  z: number;
}

/** Postes d'une zone : grille régulière de bureaux, au moins `min` places. */
export function deskPositions(zone: ZoneDefinition, count: number, min = 2): Point[] {
  const n = Math.max(count, min);
  const cols = Math.max(1, Math.min(n, Math.floor((zone.rect.w - 1) / 2.4)));
  const rows = Math.ceil(n / cols);
  const stepX = zone.rect.w / cols;
  const stepZ = (zone.rect.d - 1.5) / rows;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: zone.rect.x + stepX * (c + 0.5), z: zone.rect.z + 1.5 + stepZ * (r + 0.5) });
  }
  return out;
}

/** Places assises autour de la table de réunion et dans l'espace détente. */
export function gatheringSpots(zone: ZoneDefinition, count: number): Point[] {
  const cx = zone.rect.x + zone.rect.w / 2;
  const cz = zone.rect.z + zone.rect.d / 2 + 0.4;
  const rx = Math.min(zone.rect.w / 2 - 1.2, 3.2);
  const rz = Math.min(zone.rect.d / 2 - 1.2, 1.9);
  return Array.from({ length: Math.max(count, 1) }, (_, i) => {
    const a = (i / Math.max(count, 6)) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz };
  });
}

/* ------------------------------------------------------------------ */
/* Emploi du temps                                                     */
/* ------------------------------------------------------------------ */

export type OfficeActivity = "away" | "leave" | "working" | "available" | "call" | "meeting" | "lunch" | "coffee";

export const ACTIVITY_LABELS: Record<OfficeActivity, string> = {
  away: "Hors bureau",
  leave: "En congé",
  working: "Au travail",
  available: "Disponible",
  call: "En appel",
  meeting: "En réunion",
  lunch: "Pause déjeuner",
  coffee: "Pause café",
};

export interface ScheduleEvent {
  employeeId: string;
  start: number;
  end: number;
  activity: "call" | "meeting" | "lunch" | "coffee";
  label: string;
}

/** Hachage FNV-1a (stable) pour les horaires propres à chaque collaborateur. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Date (AAAA-MM-JJ) et minute locales d'un horodatage, dans le fuseau de l'entreprise. */
export function localDateMinute(iso: string, timeZone: string): { date: ISODate; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function formatMinute(minute: number): string {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Emploi du temps du jour (réunions, appels, pauses) de tous les collaborateurs présents. */
export function daySchedule(data: Pick<AppData, "employees" | "salesActivities" | "tasks" | "settings">, today: ISODate): ScheduleEvent[] {
  const tz = data.settings.company.timezone;
  const events: ScheduleEvent[] = [];
  const present = data.employees.filter((e) => e.status === "active");
  const ids = new Set(present.map((e) => e.id));
  for (const a of data.salesActivities) {
    if (!a.ownerId || !ids.has(a.ownerId)) continue;
    if (a.type !== "meeting" && a.type !== "demo" && a.type !== "call") continue;
    const local = localDateMinute(a.date, tz);
    if (local.date !== today) continue;
    const duration = a.type === "call" ? 30 : 60;
    events.push({ employeeId: a.ownerId, start: local.minute, end: local.minute + duration, activity: a.type === "call" ? "call" : "meeting", label: a.subject });
  }
  // Rendez-vous et appels planifiés (missions CRM avec heure) du jour.
  for (const t of data.tasks) {
    if (!t.assigneeId || !ids.has(t.assigneeId) || t.dueDate !== today || !t.dueTime || t.status === "cancelled") continue;
    if (t.type !== "meeting" && t.type !== "call") continue;
    const [hh, mm] = t.dueTime.split(":").map(Number);
    const start = (hh ?? 0) * 60 + (mm ?? 0);
    events.push({ employeeId: t.assigneeId, start, end: start + (t.type === "call" ? 30 : 60), activity: t.type, label: t.title });
  }
  for (const e of present) {
    const h = hash(`${e.id}:${today}`);
    const lunch = 12 * 60 + ((h >>> 4) % 3) * 30;
    events.push({ employeeId: e.id, start: lunch, end: lunch + 60, activity: "lunch", label: "Déjeuner" });
    const coffee = (h % 2 === 0 ? 10 * 60 + 15 : 15 * 60 + 30) + (h % 45);
    events.push({ employeeId: e.id, start: coffee, end: coffee + 15, activity: "coffee", label: "Café" });
  }
  return events.sort((a, b) => a.start - b.start || a.employeeId.localeCompare(b.employeeId));
}

/* ------------------------------------------------------------------ */
/* État en direct                                                      */
/* ------------------------------------------------------------------ */

export interface EmployeePresence {
  employee: Employee;
  zone: ZoneId;
  desk: Point;
  /** Position cible à la minute courante. */
  position: Point;
  location: "desk" | "meeting" | "break" | "away";
  activity: OfficeActivity;
  /** Description lisible de l'occupation. */
  detail: string;
  currentTask: Task | null;
  openTasks: number;
  lateTasks: number;
  /** Heures restantes estimées sur les tâches dues sous 14 jours. */
  remainingHours: number;
  overloaded: boolean;
}

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 } as const;

function pickCurrentTask(tasks: Task[]): Task | null {
  const open = tasks.filter(isTaskOpen).filter((t) => t.status !== "waiting");
  const sorted = [...open].sort(
    (a, b) =>
      (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );
  return sorted[0] ?? null;
}

export function officePresence(data: AppData, today: ISODate, minute: number, schedule = daySchedule(data, today)): EmployeePresence[] {
  const people = data.employees.filter((e) => e.status !== "left");
  const byZone = new Map<ZoneId, Employee[]>();
  for (const e of people) {
    const z = zoneForDepartment(e.department);
    byZone.set(z, [...(byZone.get(z) ?? []), e]);
  }
  const meetingSeats = gatheringSpots(zoneById("reunion"), 8);
  const breakSeats = gatheringSpots(zoneById("detente"), 8);
  const horizon = addDays(today, 14);
  const threshold = data.settings.rules.workloadHoursThreshold;
  let meetingIdx = 0;
  let breakIdx = 0;

  return people.map((employee) => {
    const zone = zoneForDepartment(employee.department);
    const colleagues = byZone.get(zone)!;
    // En Direction, une place supplémentaire est réservée au dirigeant (voir `directorPresence`).
    const seats = colleagues.length + (zone === "direction" ? 1 : 0);
    const desk = deskPositions(zoneById(zone), seats)[colleagues.indexOf(employee)]!;
    const tasks = data.tasks.filter((t) => t.assigneeId === employee.id);
    const open = tasks.filter(isTaskOpen);
    const remainingHours = open.filter((t) => t.dueDate && t.dueDate <= horizon).reduce((s, t) => s + Math.max(t.estimateHours - t.actualHours, 0), 0);
    const currentTask = pickCurrentTask(tasks);
    const base = { employee, zone, desk, currentTask, openTasks: open.length, lateTasks: tasks.filter((t) => isTaskLate(t, today)).length, remainingHours, overloaded: remainingHours > threshold };

    if (employee.status === "leave") return { ...base, position: desk, location: "away" as const, activity: "leave" as const, detail: "En congé aujourd'hui" };
    if (minute < WORKDAY.start || minute >= WORKDAY.end) return { ...base, position: desk, location: "away" as const, activity: "away" as const, detail: `Arrivée à ${formatMinute(WORKDAY.start)}` };

    // Les réunions et appels priment sur les pauses.
    const now = schedule.filter((ev) => ev.employeeId === employee.id && ev.start <= minute && minute < ev.end);
    const ev = now.find((x) => x.activity === "meeting") ?? now.find((x) => x.activity === "call") ?? now[0];
    if (ev?.activity === "meeting") return { ...base, position: meetingSeats[meetingIdx++ % meetingSeats.length]!, location: "meeting" as const, activity: "meeting" as const, detail: ev.label };
    if (ev?.activity === "call") return { ...base, position: desk, location: "desk" as const, activity: "call" as const, detail: ev.label };
    if (ev) return { ...base, position: breakSeats[breakIdx++ % breakSeats.length]!, location: "break" as const, activity: ev.activity, detail: ev.activity === "lunch" ? "Déjeuner" : "Pause café" };
    if (currentTask) return { ...base, position: desk, location: "desk" as const, activity: "working" as const, detail: currentTask.title };
    return { ...base, position: desk, location: "desk" as const, activity: "available" as const, detail: "Aucune tâche ouverte" };
  });
}

/** Fil d'activité de la journée jusqu'à `minute` (arrivées, réunions, pauses, départs). */
export function activityFeed(data: Pick<AppData, "employees">, schedule: ScheduleEvent[], minute: number, limit = 8): { minute: number; text: string; employeeId: string }[] {
  const names = new Map(data.employees.map((e) => [e.id, e.firstName]));
  const items: { minute: number; text: string; employeeId: string }[] = [];
  for (const e of data.employees.filter((x) => x.status === "active")) {
    const offset = hash(e.id) % 20;
    items.push({ minute: WORKDAY.start - 10 + offset, text: `${e.firstName} arrive au bureau`, employeeId: e.id });
    items.push({ minute: WORKDAY.end + offset, text: `${e.firstName} quitte le bureau`, employeeId: e.id });
  }
  for (const ev of schedule) {
    const who = names.get(ev.employeeId) ?? "—";
    const text =
      ev.activity === "meeting"
        ? `${who} rejoint la salle de réunion · ${ev.label}`
        : ev.activity === "call"
          ? `${who} est en appel · ${ev.label}`
          : ev.activity === "lunch"
            ? `${who} part déjeuner`
            : `${who} prend un café`;
    items.push({ minute: ev.start, text, employeeId: ev.employeeId });
  }
  return items
    .filter((i) => i.minute <= minute)
    .sort((a, b) => b.minute - a.minute)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Indicateurs par zone                                                */
/* ------------------------------------------------------------------ */

export interface ZoneKpi {
  label: string;
  value: number;
  unit: "eur" | "count" | "hours";
  tone?: "danger" | "success" | "default";
}

export interface ZoneState {
  zone: ZoneDefinition;
  unlocked: boolean;
  alerts: Alert[];
  kpis: ZoneKpi[];
  occupants: number;
}

export function zoneStates(data: AppData, today: ISODate, summaries: InvoiceSummary[], alerts: Alert[], rank: number, presence: EmployeePresence[]): ZoneState[] {
  const inDept = (depts: Department[]) => new Set(data.employees.filter((e) => depts.includes(e.department) && e.status !== "left").map((e) => e.id));
  const taskStats = (ids: Set<string>) => {
    const tasks = data.tasks.filter((t) => t.assigneeId && ids.has(t.assigneeId));
    return { open: tasks.filter(isTaskOpen).length, late: tasks.filter((t) => isTaskLate(t, today)).length };
  };
  const occupancy = (id: ZoneId) =>
    presence.filter((p) => {
      if (p.location === "away") return false;
      if (p.location === "meeting") return id === "reunion";
      if (p.location === "break") return id === "detente";
      return p.zone === id;
    }).length;

  return ZONES.map((zone) => {
    const zoneAlerts = alerts.filter((a) => ZONE_BY_ALERT[a.kind] === zone.id);
    let kpis: ZoneKpi[] = [];
    switch (zone.id) {
      case "finance": {
        const cash = cashBalance(data, today);
        const overdue = overdueReceivables(summaries);
        kpis = [
          { label: "Trésorerie", value: cash, unit: "eur", tone: cash < data.settings.company.cashAlertThreshold ? "danger" : "default" },
          { label: "Factures échues", value: overdue, unit: "eur", tone: overdue > 0 ? "danger" : "success" },
          { label: "TVA déclarée à payer", value: vatOutstanding(data.vatReturns), unit: "eur" },
        ];
        break;
      }
      case "commercial": {
        const open = data.opportunities.filter(isOpen);
        kpis = [
          { label: "Opportunités ouvertes", value: open.length, unit: "count" },
          { label: "Pipeline pondéré", value: open.reduce((s, o) => s + Math.round((o.amount * o.probability) / 100), 0), unit: "eur" },
          {
            label: "Actions planifiées",
            value: data.tasks.filter((t) => t.type !== "internal" && t.status !== "done" && t.status !== "cancelled" && !!t.dueDate && t.dueDate >= today).length,
            unit: "count",
          },
        ];
        break;
      }
      case "developpement":
      case "support": {
        const s = taskStats(inDept(zone.departments));
        kpis = [
          { label: "Tâches ouvertes", value: s.open, unit: "count" },
          { label: "Tâches en retard", value: s.late, unit: "count", tone: s.late ? "danger" : "success" },
        ];
        break;
      }
      case "operations": {
        const active = data.projects.filter(isProjectActive);
        const late = active.filter((p) => isProjectLate(p, today)).length;
        kpis = [
          { label: "Projets actifs", value: active.length, unit: "count" },
          { label: "Projets en retard", value: late, unit: "count", tone: late ? "danger" : "success" },
        ];
        break;
      }
      case "direction":
        kpis = [
          { label: "Rang de l'entreprise", value: rank, unit: "count" },
          { label: "Objectifs en cours", value: data.goals.filter((g) => !g.archived && g.periodEnd >= today).length, unit: "count" },
          { label: "Alertes ouvertes", value: alerts.length, unit: "count", tone: alerts.length ? "danger" : "success" },
        ];
        break;
      case "accueil":
        kpis = [
          { label: "Clients actifs", value: data.clients.filter((c) => c.relation === "customer" && c.status === "active").length, unit: "count" },
          { label: "Prospects actifs", value: data.contacts.filter((c) => c.relation === "prospect").length, unit: "count" },
        ];
        break;
      case "reunion": {
        kpis = [
          {
            label: "Réunions et démos aujourd'hui",
            value: data.tasks.filter((t) => t.type === "meeting" && t.dueDate === today && t.status !== "cancelled").length,
            unit: "count",
          },
        ];
        break;
      }
      default:
        kpis = [];
    }
    return { zone, unlocked: isZoneUnlocked(zone, rank), alerts: zoneAlerts, kpis, occupants: occupancy(zone.id) };
  });
}

/** Identifiant réservé à l'avatar du dirigeant (l'utilisateur), installé en Direction. */
export const DIRECTOR_ID = "__director";

/**
 * Avatar du dirigeant (« Vous ») : présent en Direction pendant les heures d'ouverture.
 * Il n'est pas un collaborateur : absent des listes et des compteurs de présence.
 */
export function directorPresence(data: Pick<AppData, "settings">, minute: number, deskIndex = 0): EmployeePresence {
  const open = minute >= WORKDAY.start && minute < WORKDAY.end;
  const desk = deskPositions(zoneById("direction"), deskIndex + 1)[deskIndex]!;
  const employee: Employee = {
    id: DIRECTOR_ID,
    firstName: "Vous",
    lastName: "",
    jobTitle: data.settings.user.name,
    department: "direction",
    email: data.settings.user.email,
    hireDate: "2000-01-01",
    status: "active",
    monthlyCost: 0,
    skills: {},
    createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z",
  };
  return {
    employee,
    zone: "direction",
    desk,
    position: desk,
    location: open ? "desk" : "away",
    activity: open ? "working" : "away",
    detail: "Pilotage de l'entreprise",
    currentTask: null,
    openTasks: 0,
    lateTasks: 0,
    remainingHours: 0,
    overloaded: false,
  };
}
