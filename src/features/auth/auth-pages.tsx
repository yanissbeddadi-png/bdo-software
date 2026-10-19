"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { isCloudMode } from "@/lib/cloud/config";
import { browserClient } from "@/lib/cloud/browser";
import { hardNavigate } from "@/lib/cloud/session";
import { installOrganization, setupStatus } from "@/lib/cloud/actions";
import { createSeedData } from "@/lib/database/seed";
import { realTodayISO } from "@/lib/calculations/dates";
import { BdoMark } from "@/components/layout/sidebar";
import { Field } from "@/components/forms/entity-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";

/** Mise en page des écrans d'accès : bandeau gris à pan coupé et filet rouge (charte BDO). */
function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main id="contenu" className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#efefef] lg:block" aria-hidden>
        <div className="absolute inset-y-0 right-0 w-2/3 bg-[#f7f7f7] [clip-path:polygon(35%_0,100%_0,100%_100%,0_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <BdoMark />
            <span className="text-[11px] font-bold uppercase tracking-wide text-bdo-red">Software &amp; Services</span>
          </div>
          <div className="max-w-md">
            <p className="text-4xl font-bold leading-tight text-fg">Customer Relationship Command Center</p>
            <p className="mt-4 text-base text-muted">Pipeline, contacts, missions et relances de toute l&apos;équipe, au même endroit.</p>
          </div>
          <div className="h-[3px] w-24 bg-bdo-red" />
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BdoMark />
            <span className="text-[11px] font-bold uppercase tracking-wide text-bdo-red">Software &amp; Services</span>
          </div>
          <h1 className="text-2xl font-bold text-fg">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}

function DemoNotice() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5 text-sm text-muted">
      <p>
        Cette installation fonctionne en <strong className="text-fg">mode démonstration</strong> : les données restent dans votre navigateur et aucune connexion n&apos;est nécessaire.
      </p>
      <p>Pour activer les comptes utilisateurs, configurez Supabase (voir le README, section « Mode multi-utilisateur »).</p>
      <Button asChild variant="primary">
        <Link href="/">Ouvrir l&apos;application</Link>
      </Button>
    </div>
  );
}

export function LoginPage() {
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [needsSetup, setNeedsSetup] = React.useState(false);

  React.useEffect(() => {
    if (!isCloudMode) return;
    let alive = true;
    setupStatus()
      .then((s) => alive && setNeedsSetup(s.needsSetup))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!isCloudMode)
    return (
      <AuthLayout title="Connexion" subtitle="BDO Software CRM">
        <DemoNotice />
      </AuthLayout>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setPending(false);
      setError(/banned/i.test(err.message) ? "Ce compte est désactivé. Contactez votre administrateur." : "E-mail ou mot de passe incorrect.");
      return;
    }
    const next = params.get("suite");
    hardNavigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  };

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre espace avec votre e-mail professionnel et votre mot de passe.">
      {needsSetup ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Aucun compte n&apos;existe encore.{" "}
          <Link href="/installation" className="font-semibold underline">
            Terminer l&apos;installation
          </Link>
        </p>
      ) : null}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="E-mail" htmlFor="login-email">
          <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mot de passe" htmlFor="login-password">
          <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || !email || !password}>
          {pending ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Se connecter
        </Button>
        <p className="text-xs text-subtle">Mot de passe oublié ? Demandez à votre administrateur de le réinitialiser (Paramètres › Utilisateurs).</p>
      </form>
    </AuthLayout>
  );
}

export function InstallPage() {
  const [status, setStatus] = React.useState<Awaited<ReturnType<typeof setupStatus>> | null>(null);
  const [form, setForm] = React.useState({ code: "", companyName: "BDO Software", name: "", email: "", password: "", confirm: "", employeeId: "emp_sacha" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const employees = React.useMemo(() => createSeedData(realTodayISO()).employees.filter((e) => e.status !== "left"), []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  React.useEffect(() => {
    if (!isCloudMode) return;
    setupStatus()
      .then(setStatus)
      .catch(() => setStatus({ cloud: true, ready: false, reason: "Serveur injoignable.", needsSetup: false, codeRequired: false }));
  }, []);

  if (!isCloudMode)
    return (
      <AuthLayout title="Installation" subtitle="BDO Software CRM">
        <DemoNotice />
      </AuthLayout>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await installOrganization({ code: form.code, companyName: form.companyName, name: form.name, email: form.email, password: form.password, employeeId: form.employeeId || null });
    if (!res.ok) {
      setPending(false);
      setError(res.error);
      return;
    }
    await browserClient().auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
    hardNavigate("/parametres?tab=roles");
  };

  return (
    <AuthLayout title="Installation" subtitle="Création de l'espace de votre équipe et du compte administrateur.">
      {!status ? (
        <Loader2 className="size-5 animate-spin text-muted" aria-label="Chargement" />
      ) : !status.ready ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {status.reason}
        </p>
      ) : !status.needsSetup ? (
        <div className="space-y-4 text-sm text-muted">
          <p>L&apos;installation est déjà terminée.</p>
          <Button asChild variant="primary">
            <Link href="/connexion">Se connecter</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Code d'installation" htmlFor="setup-code" help="Valeur de la variable BDO_SETUP_CODE définie dans la configuration du déploiement.">
            <Input id="setup-code" type="password" value={form.code} onChange={set("code")} required />
          </Field>
          <Field label="Nom de l'entreprise" htmlFor="setup-company">
            <Input id="setup-company" value={form.companyName} onChange={set("companyName")} />
          </Field>
          <Field label="Votre nom" htmlFor="setup-name">
            <Input id="setup-name" autoComplete="name" value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Votre fiche collaborateur" htmlFor="setup-employee" help="Sert aux vues « Mes prospects » et « Mes missions ».">
            <NativeSelect id="setup-employee" value={form.employeeId} onChange={set("employeeId")}>
              <option value="">— Aucune —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} — {e.jobTitle}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="E-mail (identifiant)" htmlFor="setup-email">
            <Input id="setup-email" type="email" autoComplete="username" value={form.email} onChange={set("email")} required />
          </Field>
          <Field label="Mot de passe (10 caractères minimum)" htmlFor="setup-password">
            <Input id="setup-password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required />
          </Field>
          <Field label="Confirmer le mot de passe" htmlFor="setup-confirm">
            <Input id="setup-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} required />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Créer l&apos;espace et le compte administrateur
          </Button>
          <p className="text-xs text-subtle">Les données de démonstration (entreprises, contacts, pipeline…) sont chargées pour que toute l&apos;équipe puisse tester.</p>
        </form>
      )}
    </AuthLayout>
  );
}
