"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Building2, CornerDownLeft, FileText, FolderKanban, Handshake, ListTodo, ReceiptText, Swords, User, UserRound, Search } from "lucide-react";
import { useData } from "@/lib/store/hooks";
import { useUiStore } from "@/lib/store/ui-store";
import { NAV } from "./nav";
import { formatEUR } from "@/lib/formatters";
import { documentTotals } from "@/lib/calculations/money";

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  keywords: string;
}

/** Recherche globale (Ctrl/Cmd + K) : clients, contacts, projets, tâches, factures, devis, opportunités, collaborateurs, missions. */
export function SearchCommand() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const openCreate = useUiStore((s) => s.openCreate);
  const data = useData();
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().searchOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const groups = React.useMemo(() => {
    const clients = new Map(data.clients.map((c) => [c.id, c.name]));
    const g: { key: string; label: string; icon: React.ReactNode; items: Item[] }[] = [
      { key: "clients", label: "Clients", icon: <Building2 />, items: data.clients.map((c) => ({ id: c.id, label: c.name, hint: c.sector, href: `/clients/${c.id}`, keywords: `${c.name} ${c.sector} ${c.city}` })) },
      { key: "contacts", label: "Contacts", icon: <UserRound />, items: data.contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, hint: c.clientId ? clients.get(c.clientId) : c.jobTitle, href: c.clientId ? `/clients/${c.clientId}?tab=contacts` : "/crm/prospects", keywords: `${c.firstName} ${c.lastName} ${c.email} ${c.jobTitle}` })) },
      { key: "projects", label: "Projets", icon: <FolderKanban />, items: data.projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}`, hint: clients.get(p.clientId), href: `/projets/${p.id}`, keywords: `${p.code} ${p.name} ${clients.get(p.clientId) ?? ""}` })) },
      { key: "tasks", label: "Tâches", icon: <ListTodo />, items: data.tasks.map((t) => ({ id: t.id, label: t.title, hint: t.status === "done" ? "Terminée" : t.dueDate ?? "", href: `/taches?focus=${t.id}`, keywords: t.title })) },
      { key: "invoices", label: "Factures", icon: <ReceiptText />, items: data.invoices.map((i) => ({ id: i.id, label: i.number, hint: `${clients.get(i.clientId) ?? ""} · ${formatEUR(documentTotals(i.items).totalTTC)}`, href: `/finances/factures/${i.id}`, keywords: `${i.number} ${clients.get(i.clientId) ?? ""}` })) },
      { key: "quotes", label: "Devis", icon: <FileText />, items: data.quotes.map((q) => ({ id: q.id, label: q.number, hint: clients.get(q.clientId), href: `/crm/devis/${q.id}`, keywords: `${q.number} ${clients.get(q.clientId) ?? ""}` })) },
      { key: "opps", label: "Opportunités", icon: <Handshake />, items: data.opportunities.map((o) => ({ id: o.id, label: o.name, hint: formatEUR(o.amount, { round: true }), href: `/crm?focus=${o.id}`, keywords: o.name })) },
      { key: "employees", label: "Collaborateurs", icon: <User />, items: data.employees.map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.jobTitle, href: `/equipe?focus=${e.id}`, keywords: `${e.firstName} ${e.lastName} ${e.jobTitle}` })) },
      { key: "missions", label: "Missions", icon: <Swords />, items: data.missions.filter((m) => m.status !== "cancelled").map((m) => ({ id: m.id, label: m.title, hint: `+${m.xpReward} XP`, href: `/missions?focus=${m.id}`, keywords: m.title })) },
    ];
    return g;
  }, [data]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };
  const create = (kind: Parameters<typeof openCreate>[0]) => {
    setOpen(false);
    setQuery("");
    openCreate(kind);
  };
  const q = query.trim();

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 animate-fade-in" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-rise" aria-describedby={undefined}>
          <D.Title className="sr-only">Recherche globale</D.Title>
          <Command label="Recherche globale" shouldFilter loop className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-subtle" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Rechercher un client, une facture, un projet…" className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-subtle" />
              <kbd className="hidden rounded border border-border px-1.5 text-[10px] text-subtle sm:inline">Échap</kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted">
                <p>Aucun résultat pour « {q} ».</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-interactive" onClick={() => create("client")}>
                    Créer un client
                  </button>
                  <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-interactive" onClick={() => create("lead")}>
                    Créer un prospect
                  </button>
                  <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-interactive" onClick={() => create("task")}>
                    Créer une tâche
                  </button>
                </div>
              </Command.Empty>
              {!q ? (
                <Command.Group heading="Navigation">
                  {NAV.map((n) => (
                    <Row key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)} icon={<n.icon />} label={n.label} />
                  ))}
                </Command.Group>
              ) : null}
              {q
                ? groups.map((g) => (
                    <Command.Group key={g.key} heading={g.label}>
                      {g.items.map((i) => (
                        <Row key={i.id} value={`${g.key} ${i.keywords} ${i.id}`} onSelect={() => go(i.href)} icon={g.icon} label={i.label} hint={i.hint} />
                      ))}
                    </Command.Group>
                  ))
                : null}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Row({ value, onSelect, icon, label, hint }: { value: string; onSelect: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg data-[selected=true]:bg-interactive [&_svg]:size-4 [&_svg]:text-subtle">
      {icon}
      <span className="truncate">{label}</span>
      {hint ? <span className="ml-auto truncate pl-2 text-xs text-subtle">{hint}</span> : null}
      <CornerDownLeft className="hidden shrink-0 opacity-0 data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}
