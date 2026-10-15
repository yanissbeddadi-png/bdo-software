import type { ZodType, ZodTypeDef } from "zod";
import type { ActivityEvent, ActivityEventType, AppData, CurrentUser, EntityRef, ISODate, ISODateTime } from "@/lib/domain/types";
import { can, type Permission, ROLE_LABELS } from "@/lib/permissions";
import { newId } from "@/lib/domain/ids";

/** Erreur métier affichable à l'utilisateur. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface CommandContext {
  now: ISODateTime;
  today: ISODate;
  user: CurrentUser;
}

export interface CommandOutput<R> {
  data: AppData;
  result: R;
  message: string;
}

export type Command<I, R = void> = (data: AppData, input: I, ctx: CommandContext) => CommandOutput<R>;

export function assertCan(ctx: CommandContext, permission: Permission) {
  if (!can(ctx.user.role, permission)) {
    throw new DomainError(`Action non autorisée pour le rôle « ${ROLE_LABELS[ctx.user.role]} ».`);
  }
}

/** Revalide l'entrée d'une commande (équivalent d'une validation côté serveur). */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const res = schema.safeParse(input);
  if (!res.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of res.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw new DomainError(res.error.issues[0]?.message ?? "Données invalides", fieldErrors);
  }
  return res.data;
}

export function findOrThrow<T extends { id: string }>(list: T[], id: string, label: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new DomainError(`${label} introuvable.`);
  return item;
}

export function replace<T extends { id: string }>(list: T[], item: T): T[] {
  return list.map((x) => (x.id === item.id ? item : x));
}

export function activity(data: AppData, ctx: CommandContext, type: ActivityEventType, description: string, ref: EntityRef | null): AppData {
  const event: ActivityEvent = { id: newId("act"), at: ctx.now, type, description, ref };
  return { ...data, activity: [...data.activity, event] };
}

/** Journal d'audit des opérations sensibles. */
export function audit(data: AppData, ctx: CommandContext, action: string, ref: EntityRef | null, details = ""): AppData {
  return {
    ...data,
    auditLogs: [...data.auditLogs, { id: newId("aud"), at: ctx.now, actor: ctx.user.name, role: ctx.user.role, action, ref, details }],
  };
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
