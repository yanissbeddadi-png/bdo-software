"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { browserClient } from "@/lib/cloud/browser";
import { FormDialog } from "@/components/forms/quick-create";
import { Field } from "@/components/forms/entity-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Changement de son propre mot de passe (session Supabase en cours). */
export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const close = () => {
    setPassword("");
    setConfirm("");
    setError(null);
    onOpenChange(false);
  };
  return (
    <FormDialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())} title="Changer mon mot de passe" description="10 caractères minimum.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 10) return setError("10 caractères minimum.");
          if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
          setPending(true);
          const { error: err } = await browserClient().auth.updateUser({ password });
          setPending(false);
          if (err) return setError(/different/i.test(err.message) ? "Choisissez un mot de passe différent de l'actuel." : `Modification impossible : ${err.message}`);
          toast.success("Mot de passe modifié.");
          close();
        }}
      >
        <Field label="Nouveau mot de passe" htmlFor="pw-new">
          <Input id="pw-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirmer" htmlFor="pw-confirm">
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Enregistrer
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
