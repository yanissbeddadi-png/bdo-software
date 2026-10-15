import { Badge, type BadgeTone } from "@/components/ui/badge";

export function StatusBadge({ meta, className }: { meta: { label: string; tone: BadgeTone }; className?: string }) {
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
