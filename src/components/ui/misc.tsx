"use client";
import * as React from "react";
import { Switch as S, Checkbox as C, Popover as P } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-interactive transition-colors data-[state=checked]:bg-accent", className)}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-4" />
    </S.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border border-border-strong bg-bg-elevated data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3 text-on-accent" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset} className={cn("z-50 rounded-xl border border-border bg-card shadow-2xl animate-fade-in focus:outline-none", className)} {...props} />
    </P.Portal>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden />;
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

export function ProgressBar({
  value,
  className,
  tone = "accent",
  label,
}: {
  value: number;
  className?: string;
  tone?: "accent" | "success" | "gold" | "violet" | "danger" | "warning";
  label?: string;
}) {
  const color = { accent: "bg-accent", success: "bg-success", gold: "bg-gold", violet: "bg-violet", danger: "bg-danger", warning: "bg-warning" }[tone];
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-interactive", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
