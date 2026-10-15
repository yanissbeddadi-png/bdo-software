import * as React from "react";
import { Inbox, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, icon, className }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center", className)}>
      <div className="mb-1 rounded-full bg-interactive p-3 text-muted [&_svg]:size-5">{icon ?? <Inbox />}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Une erreur est survenue", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <TriangleAlert className="size-6 text-danger" />
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
