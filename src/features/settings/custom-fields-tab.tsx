"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { CustomFieldDef, CustomFieldEntity, CustomFieldType } from "@/lib/domain/types";
import * as C from "@/lib/domain/commands";
import { MAX_CUSTOM_FIELDS } from "@/lib/domain/commands/settings";
import { CUSTOM_ENTITY_LABELS, CUSTOM_TYPE_LABELS } from "@/lib/crm/custom-fields";
import { useCommand, useData } from "@/lib/store/hooks";
import { can } from "@/lib/permissions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/forms/entity-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";

const ENTITIES: CustomFieldEntity[] = ["contact", "company", "opportunity"];

const ENTITY_HINTS: Record<CustomFieldEntity, string> = {
  contact: "Affichés sur la fiche contact et proposés dans le formulaire contact.",
  company: "Affichés sur la fiche entreprise et proposés dans le formulaire entreprise.",
  opportunity: "Affichés sur la fiche opportunité et proposés dans le formulaire opportunité.",
};

interface Draft {
  id?: string;
  entity: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options: string;
}

/** Nombre de fiches portant une valeur pour ce champ (information avant suppression). */
function usageCount(data: ReturnType<typeof useData>, field: CustomFieldDef): number {
  const list = field.entity === "contact" ? data.contacts : field.entity === "company" ? data.clients : data.opportunities;
  return list.filter((r) => r.custom && r.custom[field.id] !== undefined).length;
}

/**
 * Paramètres › Champs personnalisés : champs propres à l'espace sur les fiches contact,
 * entreprise et opportunité. Chaque action est enregistrée immédiatement par
 * `updateCustomFields`. Supprimer un champ masque ses valeurs sans les effacer des fiches.
 */
export function CustomFieldsTab() {
  const data = useData();
  const run = useCommand();
  const { confirm, dialog } = useConfirm();
  const editable = can(data.settings.user.role, "settings.write");
  const fields = data.settings.customFields;
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const save = (next: CustomFieldDef[], successMessage?: string) => run(C.updateCustomFields, { fields: next }, { successMessage });

  const move = (field: CustomFieldDef, dir: -1 | 1) => {
    const same = fields.filter((f) => f.entity === field.entity);
    const i = same.findIndex((f) => f.id === field.id);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    const swapped = [...same];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    // L'ordre global conserve les autres fiches à leur place.
    let k = 0;
    save(
      fields.map((f) => (f.entity === field.entity ? swapped[k++] : f)),
      "Ordre des champs enregistré.",
    );
  };

  const remove = (field: CustomFieldDef) => {
    const used = usageCount(data, field);
    confirm({
      title: `Supprimer le champ « ${field.label} » ?`,
      description:
        used > 0
          ? `${used} fiche(s) ont une valeur pour ce champ. Les valeurs sont conservées dans les fiches mais ne sont plus affichées, ni exportées.`
          : "Aucune fiche n'a de valeur pour ce champ.",
      confirmLabel: "Supprimer le champ",
      action: () => save(fields.filter((f) => f.id !== field.id), `Champ « ${field.label} » supprimé.`),
    });
  };

  return (
    <div className="space-y-6">
      {!editable ? (
        <p className="rounded-lg border border-border bg-interactive p-3 text-xs text-muted" role="note">
          Lecture seule : seuls le directeur commercial et l&apos;administrateur modifient les champs personnalisés.
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-3">
        {ENTITIES.map((entity) => {
          const list = fields.filter((f) => f.entity === entity);
          return (
            <Card key={entity}>
              <CardHeader>
                <div>
                  <CardTitle>{CUSTOM_ENTITY_LABELS[entity]}</CardTitle>
                  <CardDescription>{ENTITY_HINTS[entity]}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.length ? (
                  <ul className="space-y-2" aria-label={`Champs personnalisés : ${CUSTOM_ENTITY_LABELS[entity]}`}>
                    {list.map((f, i) => (
                      <li key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{f.label}</p>
                          <p className="truncate text-[11px] text-muted">
                            {CUSTOM_TYPE_LABELS[f.type]}
                            {f.type === "select" ? ` : ${f.options.join(", ")}` : ""}
                          </p>
                        </div>
                        {editable ? (
                          <div className="flex shrink-0 items-center">
                            <Button variant="ghost" size="icon-sm" aria-label={`Monter le champ ${f.label}`} disabled={i === 0} onClick={() => move(f, -1)}>
                              <ArrowUp />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Descendre le champ ${f.label}`} disabled={i === list.length - 1} onClick={() => move(f, 1)}>
                              <ArrowDown />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Modifier le champ ${f.label}`}
                              onClick={() => setDraft({ id: f.id, entity, label: f.label, type: f.type, options: f.options.join("\n") })}
                            >
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Supprimer le champ ${f.label}`} onClick={() => remove(f)}>
                              <Trash2 />
                            </Button>
                          </div>
                        ) : (
                          <Badge>{CUSTOM_TYPE_LABELS[f.type]}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-subtle">Aucun champ personnalisé.</p>
                )}
                {editable ? (
                  <Button variant="outline" size="sm" disabled={list.length >= MAX_CUSTOM_FIELDS} onClick={() => setDraft({ entity, label: "", type: "text", options: "" })}>
                    <Plus /> Ajouter un champ
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-subtle">
        Les champs apparaissent dans les formulaires, sur les fiches, dans le menu « Colonnes » des listes, dans les exports CSV, dans la recherche (texte et listes) et dans l&apos;import Excel
        (colonne portant le libellé du champ). {MAX_CUSTOM_FIELDS} champs maximum par type de fiche.
      </p>
      <FieldDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSave={(d) => {
          const def = { id: d.id, entity: d.entity, label: d.label, type: d.type, options: d.type === "select" ? splitOptions(d.options) : [] };
          const next = d.id ? fields.map((f) => (f.id === d.id ? { ...f, ...def, id: f.id } : f)) : [...fields, def];
          const res = save(next as CustomFieldDef[], d.id ? "Champ modifié." : `Champ « ${d.label.trim()} » ajouté.`);
          if (res.ok) setDraft(null);
          return res.ok ? null : res.error;
        }}
      />
      {dialog}
    </div>
  );
}

function splitOptions(text: string): string[] {
  return [...new Set(text.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean))];
}

function FieldDialog({ draft, onClose, onSave }: { draft: Draft | null; onClose: () => void; onSave: (d: Draft) => string | null }) {
  const [d, setD] = React.useState<Draft | null>(draft);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  // Réinitialise le brouillon à chaque ouverture.
  const [opened, setOpened] = React.useState(draft);
  if (opened !== draft) {
    setOpened(draft);
    setD(draft);
    setError(null);
  }
  const editing = !!draft?.id;
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      {d ? (
        <DialogContent
          title={editing ? "Modifier le champ" : `Nouveau champ : ${CUSTOM_ENTITY_LABELS[d.entity]}`}
          description={editing ? "Le type d'un champ existant ne change pas : créez un nouveau champ pour un autre type." : "Le champ est ajouté aux formulaires et aux fiches de ce type."}
        >
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!d.label.trim()) return setError("Le libellé est obligatoire.");
              if (d.type === "select" && !splitOptions(d.options).length) return setError("Indiquez au moins une valeur pour la liste.");
              setError(onSave(d));
            }}
          >
            <Field label="Libellé" htmlFor={`${id}-label`}>
              <Input id={`${id}-label`} value={d.label} maxLength={60} autoFocus onChange={(e) => setD({ ...d, label: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor={`${id}-type`}>
              <NativeSelect id={`${id}-type`} value={d.type} disabled={editing} onChange={(e) => setD({ ...d, type: e.target.value as CustomFieldType })}>
                {(Object.keys(CUSTOM_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {CUSTOM_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {d.type === "select" ? (
              <Field label="Valeurs proposées" htmlFor={`${id}-options`} help="Une valeur par ligne (50 au plus). Une valeur retirée reste affichée sur les fiches qui l'utilisent.">
                <Textarea id={`${id}-options`} rows={6} value={d.options} onChange={(e) => setD({ ...d, options: e.target.value })} />
              </Field>
            ) : null}
            {error ? (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" variant="primary">
                {editing ? "Enregistrer" : "Ajouter le champ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
