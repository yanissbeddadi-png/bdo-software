"use client";
import * as React from "react";
import { Copy, KeyRound, Loader2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/lib/domain/types";
import { useData } from "@/lib/store/hooks";
import { can } from "@/lib/permissions";
import { createMember, createTestAccounts, listMembers, resetMemberPassword, updateMember, type MemberView } from "@/lib/cloud/actions";
import { ROLE } from "@/lib/formatters/labels";
import { formatDateTime } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/forms/entity-form";
import { FormDialog } from "@/components/forms/quick-create";

/** Rôles proposés : le directeur commercial administre l'espace et voit toutes les données ; les autres comptes ne voient que leur portefeuille. */
const ROLES: Role[] = ["dirigeant", "commercial", "collaborateur"];
const roleOptions = (current?: Role) => (current && !ROLES.includes(current) ? [current, ...ROLES] : ROLES);

interface Credential {
  name: string;
  email: string;
  password: string;
  role?: Role;
}

/**
 * Gestion des comptes (mode multi-utilisateur) : création avec mot de passe temporaire
 * affiché une seule fois, rôle, fiche collaborateur associée, réinitialisation du mot de
 * passe et désactivation. Toutes les opérations sont revérifiées côté serveur.
 */
export function UsersAdmin() {
  const data = useData();
  const me = data.settings.user;
  const isAdmin = can(me.role, "settings.write");
  const [members, setMembers] = React.useState<MemberView[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [credentials, setCredentials] = React.useState<Credential[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const employees = data.employees.filter((e) => e.status !== "left");
  const employeeName = (id: string | null) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "—";
  };

  const load = React.useCallback(async () => {
    const r = await listMembers();
    if (r.ok) setMembers(r.members);
    else setError(r.error);
  }, []);

  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    listMembers().then((r) => {
      if (!alive) return;
      if (r.ok) setMembers(r.members);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const update = async (m: MemberView, patch: Partial<Pick<MemberView, "role" | "employeeId" | "active">>) => {
    const r = await updateMember({ userId: m.userId, role: patch.role ?? m.role, employeeId: patch.employeeId !== undefined ? patch.employeeId : m.employeeId, active: patch.active ?? m.active });
    if (r.ok) {
      toast.success("Compte mis à jour.");
      await load();
    } else toast.error(r.error);
  };

  const myAccount = (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Mon compte</CardTitle>
          <CardDescription>Votre rôle est attribué par le directeur commercial et vérifié par le serveur à chaque action.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted">Nom : </span>
          {me.name}
        </span>
        <span>
          <span className="text-muted">E-mail : </span>
          {me.email}
        </span>
        <span>
          <span className="text-muted">Rôle : </span>
          {ROLE[me.role]}
        </span>
        <span>
          <span className="text-muted">Fiche collaborateur : </span>
          {employeeName(me.employeeId ?? null)}
        </span>
      </CardContent>
    </Card>
  );

  if (!isAdmin) return myAccount;

  return (
    <div className="space-y-6">
      {myAccount}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Utilisateurs de l&apos;équipe</CardTitle>
            <CardDescription>
              Chaque collaborateur se connecte avec son e-mail et son mot de passe et ne voit que son portefeuille (contacts, entreprises, opportunités et missions dont il est responsable). Le
              directeur commercial voit tout et gère les comptes. Les mots de passe temporaires ne sont affichés qu&apos;une fois.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await createTestAccounts();
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                if (!r.accounts.length) return toast.info("Aucun compte à créer : chaque fiche collaborateur avec un e-mail a déjà son compte.");
                setCredentials(r.accounts);
                await load();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Users />} {data.settings.demo.sample === false ? "Créer les comptes de l'équipe" : "Créer les comptes de test"}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <UserPlus /> Nouveau compte
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {!members ? (
            <Loader2 className="size-5 animate-spin text-muted" aria-label="Chargement des comptes" />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Comptes utilisateurs</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="py-2 pr-3 font-medium">Utilisateur</th>
                  <th className="py-2 pr-3 font-medium">Rôle</th>
                  <th className="py-2 pr-3 font-medium">Fiche collaborateur</th>
                  <th className="py-2 pr-3 font-medium">Dernière connexion</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-b border-border/60 last:border-0" data-member={m.email}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">
                        {m.name} {m.isSelf ? <Badge tone="info">Vous</Badge> : null} {!m.active ? <Badge>Désactivé</Badge> : null}
                      </p>
                      <p className="text-xs text-muted">{m.email}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <NativeSelect aria-label={`Rôle de ${m.name}`} value={m.role} onChange={(e) => void update(m, { role: e.target.value as Role })} className="h-8 w-auto text-xs">
                        {roleOptions(m.role).map((r) => (
                          <option key={r} value={r}>
                            {ROLE[r]}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="py-2 pr-3">
                      <NativeSelect
                        aria-label={`Fiche collaborateur de ${m.name}`}
                        value={m.employeeId ?? ""}
                        onChange={(e) => void update(m, { employeeId: e.target.value || null })}
                        className="h-8 w-auto text-xs"
                      >
                        <option value="">— Aucune —</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">{m.lastSignInAt ? formatDateTime(m.lastSignInAt) : "Jamais"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const r = await resetMemberPassword(m.userId);
                            if (r.ok) setCredentials([{ name: m.name, email: m.email, password: r.password }]);
                            else toast.error(r.error);
                          }}
                        >
                          <KeyRound /> Nouveau mot de passe
                        </Button>
                        {!m.isSelf ? (
                          <Button size="sm" variant="ghost" onClick={() => void update(m, { active: !m.active })}>
                            {m.active ? "Désactiver" : "Réactiver"}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <FormDialog open={creating} onOpenChange={setCreating} title="Nouveau compte">
        <CreateMemberForm
          employees={employees.map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}`, email: e.email }))}
          onCancel={() => setCreating(false)}
          onCreated={async (c) => {
            setCreating(false);
            setCredentials([c]);
            await load();
          }}
        />
      </FormDialog>

      <FormDialog
        open={!!credentials}
        onOpenChange={(o) => !o && setCredentials(null)}
        title="Identifiants à transmettre"
        description="Copiez ces informations maintenant : les mots de passe ne seront plus affichés. Chaque personne peut ensuite changer le sien (menu du profil)."
      >
        {credentials ? (
          <div className="space-y-3">
            <ul className="divide-y divide-border rounded-lg border border-border" data-testid="credentials">
              {credentials.map((c) => (
                <li key={c.email} className="grid gap-0.5 px-3 py-2 text-sm">
                  <span className="font-medium">
                    {c.name} {c.role ? <span className="text-xs text-muted">· {ROLE[c.role]}</span> : null}
                  </span>
                  <span className="font-mono text-xs">{c.email}</span>
                  <span className="font-mono text-xs">{c.password}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(credentials.map((c) => `${c.name}\t${c.email}\t${c.password}`).join("\n"));
                toast.success("Identifiants copiés.");
              }}
            >
              <Copy /> Copier
            </Button>
          </div>
        ) : null}
      </FormDialog>
    </div>
  );
}

function CreateMemberForm({ employees, onCancel, onCreated }: { employees: { id: string; label: string; email: string }[]; onCancel: () => void; onCreated: (c: Credential) => void }) {
  const [form, setForm] = React.useState({ name: "", email: "", role: "commercial" as Role, employeeId: "" });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await createMember({ ...form, employeeId: form.employeeId || null });
        setPending(false);
        if (r.ok) onCreated({ name: form.name, email: r.email, password: r.password, role: form.role });
        else setError(r.error);
      }}
    >
      <Field label="Fiche collaborateur" htmlFor="m-employee" className="sm:col-span-2">
        <NativeSelect
          id="m-employee"
          value={form.employeeId}
          onChange={(e) => {
            const emp = employees.find((x) => x.id === e.target.value);
            setForm((f) => ({ ...f, employeeId: e.target.value, name: emp ? emp.label : f.name, email: emp ? emp.email : f.email }));
          }}
        >
          <option value="">— Aucune —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Nom" htmlFor="m-name">
        <Input id="m-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
      </Field>
      <Field label="E-mail (identifiant)" htmlFor="m-email">
        <Input id="m-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
      </Field>
      <Field label="Rôle" htmlFor="m-role">
        <NativeSelect id="m-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE[r]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Créer le compte
        </Button>
      </div>
    </form>
  );
}
