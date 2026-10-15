"use client";
import * as React from "react";
import { Controller, useForm, type FieldValues, type Path, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodTypeAny } from "zod";
import { Loader2, Star } from "lucide-react";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch, Checkbox } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { MoneyInput } from "./money-input";
import { LineItemsEditor } from "./line-items-editor";
import { cn } from "@/lib/utils";
import type { RunResult } from "@/lib/store/hooks";

export type FieldType = "text" | "email" | "textarea" | "number" | "money" | "date" | "select" | "switch" | "multiselect" | "rating" | "lines" | "custom";

export interface FieldConfig<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  /** Pour select/date : la valeur vide correspond à `null`. */
  nullable?: boolean;
  placeholder?: string;
  help?: string;
  span?: 1 | 2;
  step?: number;
  min?: number;
  max?: number;
  hidden?: boolean;
  render?: (props: { value: unknown; onChange: (v: unknown) => void }) => React.ReactNode;
}

export function Field({ label, htmlFor, error, help, children, className }: { label: string; htmlFor?: string; error?: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="text-[11px] text-subtle">{help}</p>
      ) : null}
    </div>
  );
}

/**
 * Formulaire générique piloté par un schéma Zod (le même que celui de la commande
 * métier). Les erreurs renvoyées par la commande sont réaffectées aux champs.
 */
export function EntityForm<T extends FieldValues>({
  schema,
  defaultValues,
  fields,
  onSubmit,
  onCancel,
  submitLabel = "Enregistrer",
  footerExtra,
}: {
  schema: ZodTypeAny;
  defaultValues: DefaultValues<T>;
  fields: FieldConfig<T>[];
  onSubmit: (values: T) => RunResult<unknown>;
  onCancel?: () => void;
  submitLabel?: string;
  footerExtra?: React.ReactNode;
}) {
  const form = useForm<T>({ resolver: zodResolver(schema), defaultValues, mode: "onSubmit" });
  const [pending, setPending] = React.useState(false);
  const id = React.useId();

  const submit = form.handleSubmit((values) => {
    if (pending) return;
    setPending(true);
    try {
      const res = onSubmit(values);
      if (!res.ok) {
        for (const [key, message] of Object.entries(res.fieldErrors)) {
          if (fields.some((f) => f.name === key)) form.setError(key as Path<T>, { message });
        }
      }
    } finally {
      setPending(false);
    }
  });

  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields
        .filter((f) => !f.hidden)
        .map((f) => {
          const fid = `${id}-${f.name}`;
          const error = errors[f.name]?.message ?? (f.type === "lines" ? (errors[f.name] as { root?: { message?: string } } | undefined)?.root?.message : undefined);
          return (
            <Controller
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <Field label={f.label} htmlFor={fid} error={error} help={f.help} className={cn(f.span === 2 || f.type === "textarea" || f.type === "lines" || f.type === "multiselect" ? "sm:col-span-2" : "")}>
                  {f.type === "textarea" ? (
                    <Textarea id={fid} aria-invalid={!!error} placeholder={f.placeholder} {...field} value={(field.value as string) ?? ""} />
                  ) : f.type === "money" ? (
                    <MoneyInput id={fid} aria-invalid={!!error} value={field.value as number} onChange={field.onChange} onBlur={field.onBlur} />
                  ) : f.type === "number" ? (
                    <Input id={fid} type="number" inputMode="decimal" aria-invalid={!!error} step={f.step ?? 1} min={f.min} max={f.max} value={Number.isFinite(field.value as number) ? (field.value as number) : ""} onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))} onBlur={field.onBlur} className="tabular" />
                  ) : f.type === "date" ? (
                    <Input id={fid} type="date" aria-invalid={!!error} value={(field.value as string) ?? ""} onChange={(e) => field.onChange(e.target.value === "" && f.nullable ? null : e.target.value)} onBlur={field.onBlur} />
                  ) : f.type === "select" ? (
                    <NativeSelect id={fid} aria-invalid={!!error} value={(field.value as string) ?? ""} onChange={(e) => field.onChange(e.target.value === "" && f.nullable ? null : e.target.value)} onBlur={field.onBlur}>
                      {f.nullable ? <option value="">— Aucun —</option> : null}
                      {!f.nullable && !(field.value as string) ? <option value="">Choisir…</option> : null}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : f.type === "switch" ? (
                    <div className="flex h-9 items-center">
                      <Switch id={fid} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  ) : f.type === "rating" ? (
                    <div className="flex h-9 items-center gap-1" role="radiogroup" aria-label={f.label}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={field.value === n} aria-label={`${n} sur 5`} onClick={() => field.onChange(field.value === n ? null : n)} className="cursor-pointer p-0.5">
                          <Star className={cn("size-5", (field.value as number | null) !== null && n <= (field.value as number) ? "fill-gold text-gold" : "text-subtle")} />
                        </button>
                      ))}
                    </div>
                  ) : f.type === "multiselect" ? (
                    <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-border bg-bg-elevated p-2 sm:grid-cols-2">
                      {f.options?.length ? (
                        f.options.map((o) => {
                          const list = (field.value as string[]) ?? [];
                          return (
                            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-interactive">
                              <Checkbox checked={list.includes(o.value)} onCheckedChange={(c) => field.onChange(c ? [...list, o.value] : list.filter((v) => v !== o.value))} />
                              <span className="truncate">{o.label}</span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-xs text-subtle">Aucune option disponible.</p>
                      )}
                    </div>
                  ) : f.type === "lines" ? (
                    <LineItemsEditor value={(field.value as never) ?? []} onChange={field.onChange} />
                  ) : f.type === "custom" && f.render ? (
                    f.render({ value: field.value, onChange: field.onChange })
                  ) : (
                    <Input id={fid} type={f.type === "email" ? "email" : "text"} aria-invalid={!!error} placeholder={f.placeholder} {...field} value={(field.value as string) ?? ""} />
                  )}
                </Field>
              )}
            />
          );
        })}
      <DialogFooter className="sm:col-span-2">
        {footerExtra}
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
