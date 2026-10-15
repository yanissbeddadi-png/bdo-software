"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, CircleAlert, Info, Mail, MailOpen, Sparkles, TriangleAlert } from "lucide-react";
import type { AppNotification, NotificationCategory } from "@/lib/domain/types";
import { useCommand, useData } from "@/lib/store/hooks";
import * as C from "@/lib/domain/commands";
import { entityHref } from "@/lib/domain/routes";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";
import { NOTIFICATION_CATEGORY } from "@/lib/formatters/labels";
import { formatDateTime, formatRelative } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const ICON = { danger: CircleAlert, warning: TriangleAlert, success: Sparkles, info: Info };

export function NotificationsPage() {
  const data = useData();
  const run = useCommand();
  const router = useRouter();
  const f = useFilters(["category", "read"] as const);
  const list = [...data.notifications].sort((a, b) => b.at.localeCompare(a.at)).filter((n) => f.match("category", n.category) && f.match("read", n.read ? "read" : "unread"));
  const unread = list.filter((n) => !n.read);
  const open = (n: AppNotification) => {
    if (!n.read) run(C.markNotificationRead, { id: n.id, read: true }, { silent: true });
    const href = entityHref(n.ref, data);
    if (href) router.push(href);
  };
  const prefs = data.settings.notifications.enabled;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Centre de notifications"
        description="Notifications générées à partir d'événements métier, avec déduplication : une même situation ne produit qu'une notification."
        actions={
          <Button variant="secondary" disabled={!unread.length} onClick={() => run(C.markAllNotificationsRead, { ids: unread.map((n) => n.id) })}>
            <CheckCheck /> Tout marquer comme lu
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <FilterBar
              onReset={f.reset}
              filters={[
                {
                  id: "category",
                  label: "Catégorie",
                  value: f.values.category,
                  onChange: f.set("category"),
                  options: (Object.keys(NOTIFICATION_CATEGORY) as NotificationCategory[]).map((k) => ({ value: k, label: NOTIFICATION_CATEGORY[k] })),
                },
                {
                  id: "read",
                  label: "État",
                  value: f.values.read,
                  onChange: f.set("read"),
                  options: [
                    { value: "unread", label: "Non lues" },
                    { value: "read", label: "Lues" },
                  ],
                },
              ]}
            />
          </div>
          {list.length ? (
            <Card>
              <ul className="divide-y divide-border/60">
                {list.map((n) => {
                  const Icon = ICON[n.severity];
                  return (
                    <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read && "bg-accent/5")}>
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          n.severity === "danger" ? "text-danger" : n.severity === "warning" ? "text-warning" : n.severity === "success" ? "text-gold" : "text-action",
                        )}
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(n)}>
                        <span className={cn("block text-sm", n.read ? "text-muted" : "font-medium text-fg")}>{n.title}</span>
                        <span className="block text-xs text-muted">{n.body}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                          <Badge>{NOTIFICATION_CATEGORY[n.category]}</Badge>
                          <time dateTime={n.at} title={formatDateTime(n.at)}>
                            {formatRelative(n.at)}
                          </time>
                        </span>
                      </button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={n.read ? "Marquer comme non lue" : "Marquer comme lue"}
                        onClick={() => run(C.markNotificationRead, { id: n.id, read: !n.read }, { silent: true })}
                      >
                        {n.read ? <Mail /> : <MailOpen />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <EmptyState title="Aucune notification" description="Rien à signaler pour ces critères." />
          )}
        </section>
        <Card className="h-fit">
          <CardHeader>
            <div>
              <CardTitle>Préférences</CardTitle>
              <CardDescription>Catégories pour lesquelles de nouvelles notifications sont créées.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(NOTIFICATION_CATEGORY) as NotificationCategory[]).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm">
                {NOTIFICATION_CATEGORY[k]}
                <Switch checked={prefs[k]} onCheckedChange={(v) => run(C.updateNotificationSettings, { enabled: { ...prefs, [k]: v } })} aria-label={`Notifications ${NOTIFICATION_CATEGORY[k]}`} />
              </label>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
