"use client";
import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex w-full items-center gap-1 overflow-x-auto border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg cursor-pointer [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("pt-4 focus:outline-none animate-fade-in", className)} {...props} />;
}

/** Sélecteur segmenté (vues liste / kanban / calendrier). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg border border-border bg-bg-elevated p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer [&_svg]:size-3.5",
            value === o.value ? "bg-interactive text-fg shadow" : "text-muted hover:text-fg",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
