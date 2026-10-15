import type { Employee, Goal, Milestone, Mission, MissionStoredStatus, Note, Project, ProjectStatus, Task, TaskStatus } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import {
  employeeSchema,
  goalSchema,
  missionSchema,
  noteSchema,
  projectSchema,
  taskSchema,
  type EmployeeInput,
  type GoalInput,
  type MissionInput,
  type NoteInput,
  type ProjectInput,
  type TaskInput,
} from "@/lib/validation/schemas";
import { addDays, addMonths } from "@/lib/calculations/dates";
import { PROJECT_STATUS_LABELS } from "@/lib/calculations/projects";
import { activity, assertCan, audit, DomainError, findOrThrow, parse, replace, type Command } from "./core";

/* ----------------------------- Projets ----------------------------- */

export const createProject: Command<ProjectInput, Project> = (data, input, ctx) => {
  assertCan(ctx, "projects.write");
  const v = parse(projectSchema, input);
  findOrThrow(data.clients, v.clientId, "Client");
  const seq = data.sequences.project + 1;
  const project: Project = {
    id: newId("prj"),
    code: `PRJ-${String(seq).padStart(3, "0")}`,
    ...v,
    milestones: [],
    completedAt: v.status === "done" ? ctx.now : null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  let next = { ...data, projects: [...data.projects, project], sequences: { ...data.sequences, project: seq } };
  next = activity(next, ctx, "project_created", `Projet ${project.code} · ${project.name} créé`, { type: "project", id: project.id });
  return { data: next, result: project, message: `Projet ${project.code} créé.` };
};

export const updateProject: Command<{ id: string; values: ProjectInput }, Project> = (data, { id, values }, ctx) => {
  assertCan(ctx, "projects.write");
  const v = parse(projectSchema, values);
  const current = findOrThrow(data.projects, id, "Projet");
  const becameDone = v.status === "done" && current.status !== "done";
  const project: Project = { ...current, ...v, completedAt: v.status === "done" ? (current.completedAt ?? ctx.now) : null, updatedAt: ctx.now };
  let next = { ...data, projects: replace(data.projects, project) };
  if (becameDone) next = activity(next, ctx, "project_completed", `Projet ${project.code} terminé`, { type: "project", id });
  return { data: next, result: project, message: "Projet mis à jour." };
};

export const setProjectStatus: Command<{ id: string; status: ProjectStatus }, Project> = (data, { id, status }, ctx) => {
  assertCan(ctx, "projects.write");
  const current = findOrThrow(data.projects, id, "Projet");
  if (current.status === status) return { data, result: current, message: "Aucun changement." };
  if (status === "done") {
    const open = data.tasks.filter((t) => t.projectId === id && t.status !== "done" && t.status !== "cancelled");
    if (open.length) throw new DomainError(`${open.length} tâche(s) restent ouvertes : terminez-les ou annulez-les avant de clôturer le projet.`);
  }
  const project: Project = { ...current, status, completedAt: status === "done" ? ctx.now : null, updatedAt: ctx.now };
  let next = { ...data, projects: replace(data.projects, project) };
  next = activity(next, ctx, status === "done" ? "project_completed" : "project_status", status === "done" ? `Projet ${project.code} terminé` : `Projet ${project.code} → ${PROJECT_STATUS_LABELS[status]}`, { type: "project", id });
  return { data: next, result: project, message: `Projet ${project.code} : ${PROJECT_STATUS_LABELS[status]}.` };
};

export const deleteProject: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "projects.write");
  const project = findOrThrow(data.projects, id, "Projet");
  if (data.invoices.some((i) => i.projectId === id) || data.expenses.some((e) => e.projectId === id) || data.tasks.some((t) => t.projectId === id)) {
    throw new DomainError("Ce projet possède des tâches, dépenses ou factures : passez-le au statut « Annulé » pour préserver l'historique.");
  }
  return { data: audit({ ...data, projects: data.projects.filter((p) => p.id !== id) }, ctx, "project.delete", { type: "project", id }, project.code), result: undefined, message: "Projet supprimé." };
};

export const addMilestone: Command<{ projectId: string; title: string; dueDate: string }, Milestone> = (data, { projectId, title, dueDate }, ctx) => {
  assertCan(ctx, "projects.write");
  const project = findOrThrow(data.projects, projectId, "Projet");
  if (!title.trim()) throw new DomainError("Le titre du jalon est obligatoire.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new DomainError("Date invalide.");
  const milestone: Milestone = { id: newId("ms"), title: title.trim(), dueDate, done: false, doneAt: null };
  const updated = { ...project, milestones: [...project.milestones, milestone].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), updatedAt: ctx.now };
  return { data: { ...data, projects: replace(data.projects, updated) }, result: milestone, message: "Jalon ajouté." };
};

export const toggleMilestone: Command<{ projectId: string; milestoneId: string }> = (data, { projectId, milestoneId }, ctx) => {
  assertCan(ctx, "projects.write");
  const project = findOrThrow(data.projects, projectId, "Projet");
  const milestones = project.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done, doneAt: m.done ? null : ctx.now } : m));
  return { data: { ...data, projects: replace(data.projects, { ...project, milestones, updatedAt: ctx.now }) }, result: undefined, message: "Jalon mis à jour." };
};

export const deleteMilestone: Command<{ projectId: string; milestoneId: string }> = (data, { projectId, milestoneId }, ctx) => {
  assertCan(ctx, "projects.write");
  const project = findOrThrow(data.projects, projectId, "Projet");
  return { data: { ...data, projects: replace(data.projects, { ...project, milestones: project.milestones.filter((m) => m.id !== milestoneId), updatedAt: ctx.now }) }, result: undefined, message: "Jalon supprimé." };
};

/* ----------------------------- Tâches ----------------------------- */

function checkDependencies(tasks: Task[], id: string | null, dependsOn: string[]) {
  if (id && dependsOn.includes(id)) throw new DomainError("Une tâche ne peut pas dépendre d'elle-même.");
  const map = new Map(tasks.map((t) => [t.id, t]));
  for (const dep of dependsOn) if (!map.has(dep)) throw new DomainError("Dépendance introuvable.");
  if (!id) return;
  // Détection de cycle simple (parcours en profondeur).
  const visit = (current: string, seen: Set<string>): boolean => {
    if (current === id) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    return (map.get(current)?.dependsOn ?? []).some((d) => visit(d, seen));
  };
  if (dependsOn.some((d) => visit(d, new Set()))) throw new DomainError("Ces dépendances créeraient un cycle.");
}

export const createTask: Command<TaskInput, Task> = (data, input, ctx) => {
  assertCan(ctx, "tasks.write");
  const v = parse(taskSchema, input);
  checkDependencies(data.tasks, null, v.dependsOn);
  const task: Task = { id: newId("tsk"), ...v, actualHours: 0, comments: [], completedAt: v.status === "done" ? ctx.now : null, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, tasks: [...data.tasks, task] };
  next = activity(next, ctx, "task_created", `Tâche « ${task.title} » créée`, { type: "task", id: task.id });
  return { data: next, result: task, message: "Tâche créée." };
};

export const updateTask: Command<{ id: string; values: TaskInput }, Task> = (data, { id, values }, ctx) => {
  assertCan(ctx, "tasks.write");
  const v = parse(taskSchema, values);
  checkDependencies(data.tasks, id, v.dependsOn);
  const current = findOrThrow(data.tasks, id, "Tâche");
  if (v.status !== current.status) return setTaskStatus({ ...data, tasks: replace(data.tasks, { ...current, ...v, status: current.status }) }, { id, status: v.status }, ctx);
  const task: Task = { ...current, ...v, updatedAt: ctx.now };
  return { data: { ...data, tasks: replace(data.tasks, task) }, result: task, message: "Tâche mise à jour." };
};

/**
 * Changement de statut. À la clôture d'une tâche récurrente, l'occurrence suivante
 * est créée automatiquement (nouvel identifiant, donc nouvelle récompense possible).
 */
export const setTaskStatus: Command<{ id: string; status: TaskStatus }, Task> = (data, { id, status }, ctx) => {
  assertCan(ctx, "tasks.write");
  const current = findOrThrow(data.tasks, id, "Tâche");
  if (current.status === status) return { data, result: current, message: "Aucun changement." };
  if (status === "done") {
    const blocking = current.dependsOn.map((d) => data.tasks.find((t) => t.id === d)).filter((t) => t && t.status !== "done" && t.status !== "cancelled");
    if (blocking.length) throw new DomainError(`Tâche bloquée par : ${blocking.map((t) => `« ${t!.title} »`).join(", ")}.`);
  }
  const task: Task = { ...current, status, completedAt: status === "done" ? ctx.now : null, updatedAt: ctx.now };
  let tasks = replace(data.tasks, task);
  let message = status === "done" ? "Tâche terminée." : "Statut de la tâche mis à jour.";
  if (status === "done" && current.recurrence !== "none" && current.status !== "done") {
    const base = current.dueDate ?? ctx.today;
    const nextDue = current.recurrence === "weekly" ? addDays(base, 7) : addMonths(base, 1);
    const alreadySpawned = data.tasks.some((t) => t.title === current.title && t.dueDate === nextDue && t.recurrence === current.recurrence && t.status !== "cancelled");
    if (!alreadySpawned) {
      tasks = [...tasks, { ...current, id: newId("tsk"), status: "todo", dueDate: nextDue, actualHours: 0, comments: [], completedAt: null, createdAt: ctx.now, updatedAt: ctx.now }];
      message = "Tâche terminée — prochaine occurrence planifiée.";
    }
  }
  let next = { ...data, tasks };
  if (status === "done") next = activity(next, ctx, "task_completed", `Tâche « ${task.title} » terminée`, { type: "task", id });
  return { data: next, result: task, message };
};

export const logTaskTime: Command<{ id: string; hours: number }, Task> = (data, { id, hours }, ctx) => {
  assertCan(ctx, "tasks.write");
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new DomainError("Saisissez une durée comprise entre 0 et 24 heures.");
  const current = findOrThrow(data.tasks, id, "Tâche");
  const task: Task = { ...current, actualHours: Math.round((current.actualHours + hours) * 100) / 100, status: current.status === "todo" ? "in_progress" : current.status, updatedAt: ctx.now };
  return { data: { ...data, tasks: replace(data.tasks, task) }, result: task, message: `${hours} h ajoutée(s) à la tâche.` };
};

export const addTaskComment: Command<{ id: string; text: string }, Task> = (data, { id, text }, ctx) => {
  assertCan(ctx, "tasks.write");
  if (!text.trim()) throw new DomainError("Le commentaire est vide.");
  const current = findOrThrow(data.tasks, id, "Tâche");
  const task: Task = { ...current, comments: [...current.comments, { id: newId("cmt"), author: ctx.user.name, text: text.trim().slice(0, 2000), at: ctx.now }], updatedAt: ctx.now };
  return { data: { ...data, tasks: replace(data.tasks, task) }, result: task, message: "Commentaire ajouté." };
};

export const deleteTask: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "tasks.write");
  const task = findOrThrow(data.tasks, id, "Tâche");
  return {
    data: audit({ ...data, tasks: data.tasks.filter((t) => t.id !== id).map((t) => (t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) } : t)) }, ctx, "task.delete", { type: "task", id }, task.title),
    result: undefined,
    message: "Tâche supprimée.",
  };
};

/* ----------------------------- Équipe ----------------------------- */

export const createEmployee: Command<EmployeeInput, Employee> = (data, input, ctx) => {
  assertCan(ctx, "team.write");
  const v = parse(employeeSchema, input);
  if (data.employees.some((e) => e.email.toLowerCase() === v.email.toLowerCase())) throw new DomainError("Cette adresse e-mail est déjà utilisée.", { email: "Doublon" });
  const employee: Employee = { id: newId("emp"), ...v, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, employees: [...data.employees, employee] };
  next = activity(next, ctx, "employee_created", `${employee.firstName} ${employee.lastName} rejoint l'équipe`, { type: "employee", id: employee.id });
  return { data: next, result: employee, message: "Collaborateur ajouté." };
};

export const updateEmployee: Command<{ id: string; values: EmployeeInput }, Employee> = (data, { id, values }, ctx) => {
  assertCan(ctx, "team.write");
  const v = parse(employeeSchema, values);
  const current = findOrThrow(data.employees, id, "Collaborateur");
  if (data.employees.some((e) => e.id !== id && e.email.toLowerCase() === v.email.toLowerCase())) throw new DomainError("Cette adresse e-mail est déjà utilisée.", { email: "Doublon" });
  const employee: Employee = { ...current, ...v, updatedAt: ctx.now };
  return { data: audit({ ...data, employees: replace(data.employees, employee) }, ctx, "employee.update", { type: "employee", id }, ""), result: employee, message: "Collaborateur mis à jour." };
};

/* ----------------------------- Objectifs ----------------------------- */

export const createGoal: Command<GoalInput, Goal> = (data, input, ctx) => {
  assertCan(ctx, "goals.write");
  const v = parse(goalSchema, input);
  const goal: Goal = { id: newId("goal"), ...v, archived: false, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, goals: [...data.goals, goal] };
  next = activity(next, ctx, "goal_updated", `Objectif « ${goal.title} » créé`, { type: "goal", id: goal.id });
  return { data: next, result: goal, message: "Objectif créé." };
};

export const updateGoal: Command<{ id: string; values: GoalInput }, Goal> = (data, { id, values }, ctx) => {
  assertCan(ctx, "goals.write");
  const v = parse(goalSchema, values);
  const current = findOrThrow(data.goals, id, "Objectif");
  const goal: Goal = { ...current, ...v, updatedAt: ctx.now };
  let next = { ...data, goals: replace(data.goals, goal) };
  next = activity(next, ctx, "goal_updated", `Objectif « ${goal.title} » mis à jour`, { type: "goal", id });
  return { data: next, result: goal, message: "Objectif mis à jour." };
};

/** Mise à jour d'un objectif manuel ou d'un résultat clé. */
export const setGoalProgress: Command<{ id: string; manualValue?: number; keyResults?: { id: string; current: number }[] }, Goal> = (data, { id, manualValue, keyResults }, ctx) => {
  assertCan(ctx, "goals.write");
  const current = findOrThrow(data.goals, id, "Objectif");
  if (manualValue !== undefined && current.metric !== "manual") throw new DomainError("La valeur de cet objectif est calculée automatiquement depuis les données.");
  if (manualValue !== undefined && !Number.isFinite(manualValue)) throw new DomainError("Valeur invalide.");
  const goal: Goal = {
    ...current,
    manualValue: manualValue ?? current.manualValue,
    keyResults: current.keyResults.map((kr) => {
      const upd = keyResults?.find((k) => k.id === kr.id);
      return upd && Number.isFinite(upd.current) ? { ...kr, current: upd.current } : kr;
    }),
    updatedAt: ctx.now,
  };
  let next = { ...data, goals: replace(data.goals, goal) };
  next = activity(next, ctx, "goal_updated", `Progression de « ${goal.title} » mise à jour`, { type: "goal", id });
  return { data: next, result: goal, message: "Progression enregistrée." };
};

export const archiveGoal: Command<{ id: string; archived: boolean }> = (data, { id, archived }, ctx) => {
  assertCan(ctx, "goals.write");
  const current = findOrThrow(data.goals, id, "Objectif");
  return { data: { ...data, goals: replace(data.goals, { ...current, archived, updatedAt: ctx.now }) }, result: undefined, message: archived ? "Objectif archivé." : "Objectif restauré." };
};

/* ----------------------------- Missions ----------------------------- */

export const createMission: Command<MissionInput, Mission> = (data, input, ctx) => {
  assertCan(ctx, "missions.write");
  const v = parse(missionSchema, input);
  if (v.dueDate < v.startDate) throw new DomainError("L'échéance doit suivre le début.", { dueDate: "Date invalide" });
  const mission: Mission = {
    id: newId("mis"),
    ...v,
    type: v.type,
    status: "todo",
    condition: { kind: "manual" },
    entity: null,
    history: [{ at: ctx.now, text: `Mission personnalisée créée par ${ctx.user.name}.` }],
    source: "custom",
    autoKey: null,
    completedAt: null,
    createdAt: ctx.now,
  };
  return { data: { ...data, missions: [...data.missions, mission] }, result: mission, message: "Mission créée." };
};

/**
 * Changement de statut d'une mission. Une mission à condition automatique ne peut
 * pas être validée manuellement : elle se termine quand sa condition est remplie.
 */
export const setMissionStatus: Command<{ id: string; status: MissionStoredStatus; note?: string }, Mission> = (data, { id, status, note }, ctx) => {
  assertCan(ctx, "missions.write");
  const current = findOrThrow(data.missions, id, "Mission");
  if (current.status === "done") throw new DomainError("Cette mission est déjà terminée.");
  if (current.status === "cancelled" && status !== "todo") throw new DomainError("Mission annulée.");
  if (status === "done" && current.condition.kind !== "manual") throw new DomainError("Cette mission se valide automatiquement lorsque sa condition est remplie.");
  const labels: Record<MissionStoredStatus, string> = { todo: "Remise à faire", in_progress: "Démarrée", done: "Validée manuellement", cancelled: "Annulée" };
  const mission: Mission = {
    ...current,
    status,
    completedAt: status === "done" ? ctx.now : null,
    history: [...current.history, { at: ctx.now, text: `${labels[status]} par ${ctx.user.name}${note ? ` — ${note}` : ""}.` }],
  };
  return { data: { ...data, missions: replace(data.missions, mission) }, result: mission, message: status === "done" ? "Mission validée." : "Mission mise à jour." };
};

/* ----------------------------- Notes ----------------------------- */

export const createNote: Command<NoteInput, Note> = (data, input, ctx) => {
  assertCan(ctx, "notes.write");
  const v = parse(noteSchema, input);
  const note: Note = { id: newId("note"), ...v, createdAt: ctx.now, updatedAt: ctx.now };
  let next = { ...data, notes: [...data.notes, note] };
  next = activity(next, ctx, "note_created", `Note « ${note.title} » ajoutée`, { type: "note", id: note.id });
  return { data: next, result: note, message: "Note enregistrée." };
};

export const updateNote: Command<{ id: string; values: NoteInput }, Note> = (data, { id, values }, ctx) => {
  assertCan(ctx, "notes.write");
  const v = parse(noteSchema, values);
  const current = findOrThrow(data.notes, id, "Note");
  const note = { ...current, ...v, updatedAt: ctx.now };
  return { data: { ...data, notes: replace(data.notes, note) }, result: note, message: "Note mise à jour." };
};

export const deleteNote: Command<{ id: string }> = (data, { id }, ctx) => {
  assertCan(ctx, "notes.write");
  findOrThrow(data.notes, id, "Note");
  return { data: { ...data, notes: data.notes.filter((n) => n.id !== id) }, result: undefined, message: "Note supprimée." };
};
