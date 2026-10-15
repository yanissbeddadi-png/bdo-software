import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "border-border bg-interactive text-muted",
      info: "border-action/30 bg-action/10 text-action",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-warning/30 bg-warning/10 text-warning",
      danger: "border-danger/30 bg-danger/10 text-danger",
      gold: "border-gold/30 bg-gold/10 text-gold",
      violet: "border-violet/30 bg-violet/10 text-violet",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
