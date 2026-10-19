"use client";
import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useCommand, useData } from "@/lib/store/hooks";
import * as C from "@/lib/domain/commands";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/forms/quick-create";
import { NoteForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/formatters";

export function NotesGrid({ notes }: { notes: { id: string; title: string; body: string; updatedAt: string }[] }) {
  const run = useCommand();
  const data = useData();
  const [edit, setEdit] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const note = data.notes.find((n) => n.id === edit);
  if (!notes.length) return <EmptyState title="Aucune note" />;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {notes.map((n) => (
          <Card key={n.id}>
            <CardContent className="space-y-2 pt-4">
              <p className="font-medium text-fg">{n.title}</p>
              <p className="whitespace-pre-line text-sm text-muted">{n.body}</p>
              <div className="flex items-center justify-between pt-1 text-[11px] text-subtle">
                <span>Modifiée le {formatDateTime(n.updatedAt)}</span>
                <span className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Modifier la note" onClick={() => setEdit(n.id)}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Supprimer la note"
                    onClick={() => confirm({ title: "Supprimer cette note ?", description: n.title, confirmLabel: "Supprimer", action: () => run(C.deleteNote, { id: n.id }) })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <FormDialog open={!!note} onOpenChange={(o) => !o && setEdit(null)} title="Modifier la note">
        {note ? <NoteForm entity={note} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} /> : null}
      </FormDialog>
      {dialog}
    </>
  );
}
