"use client";
import * as React from "react";
import { DropdownMenu as DM } from "radix-ui";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={sideOffset} align={align} className={cn("z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-xl animate-fade-in", className)} {...props} />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm text-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-interactive [&_svg]:size-4 [&_svg]:text-muted", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
