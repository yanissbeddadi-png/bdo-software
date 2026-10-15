"use client";
import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className={cn("z-50 max-w-72 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs leading-relaxed text-fg shadow-xl animate-fade-in", className)}>
          {content}
          <T.Arrow className="fill-bg-elevated" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
