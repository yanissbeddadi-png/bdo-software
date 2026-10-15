"use client";
import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "danger",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/60 animate-fade-in" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-2xl animate-rise">
          <A.Title className="text-base font-semibold text-fg">{title}</A.Title>
          <A.Description asChild>
            <div className="mt-2 text-sm text-muted">{description}</div>
          </A.Description>
          {children}
          <div className="mt-5 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="ghost">Annuler</Button>
            </A.Cancel>
            <A.Action asChild>
              <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}

/** Hook utilitaire : ouvre une confirmation puis exécute l'action. */
export function useConfirm() {
  const [state, setState] = React.useState<{ title: string; description: React.ReactNode; confirmLabel?: string; tone?: "danger" | "primary"; action: () => void } | null>(null);
  const dialog = state ? (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && setState(null)}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      tone={state.tone}
      onConfirm={() => {
        state.action();
        setState(null);
      }}
    />
  ) : null;
  return { confirm: setState, dialog };
}
