"use client";
import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function RowActions({ actions, label = "Actions" }: { actions: (RowAction | false | null | undefined)[]; label?: string }) {
  const list = actions.filter(Boolean) as RowAction[];
  if (!list.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {list.map((a) => (
          <React.Fragment key={a.label}>
            {a.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={a.onSelect} disabled={a.disabled} className={a.danger ? "text-danger [&_svg]:text-danger" : undefined}>
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
