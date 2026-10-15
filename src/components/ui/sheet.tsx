"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;

export function SheetContent({ className, children, title, side = "left", ...props }: React.ComponentProps<typeof D.Content> & { title: string; side?: "left" | "right" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 animate-fade-in" />
      <D.Content className={cn("fixed inset-y-0 z-50 flex w-[85vw] max-w-sm flex-col border-border bg-bg-elevated shadow-2xl animate-fade-in focus:outline-none", side === "left" ? "left-0 border-r" : "right-0 border-l", className)} {...props}>
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">{title}</D.Description>
        <D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted hover:bg-interactive hover:text-fg" aria-label="Fermer">
          <X className="size-4" />
        </D.Close>
        {children}
      </D.Content>
    </D.Portal>
  );
}
