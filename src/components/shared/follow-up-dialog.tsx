"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useCommand, useData, useSummaries } from "@/lib/store/hooks";
import { logInvoiceFollowUp } from "@/lib/domain/commands";
import { formatEUR } from "@/lib/formatters";

/** Consigne une relance de facture. Aucun e-mail n'est envoyé (aucun service configuré). */
export function FollowUpDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const run = useCommand();
  const data = useData();
  const summary = useSummaries().find((s) => s.invoice.id === invoiceId);
  const client = data.clients.find((c) => c.id === summary?.invoice.clientId);
  const [notes, setNotes] = React.useState("Relance téléphonique et rappel de l'échéance.");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Relancer ${client?.name ?? "le client"}`} description="La relance est consignée dans le CRM. L'application n'envoie aucun e-mail : aucun service d'envoi n'est configuré.">
        {summary ? (
          <p className="mb-3 text-sm text-muted">
            Facture <span className="text-fg">{summary.invoice.number}</span> · solde <span className="tabular text-fg">{formatEUR(summary.balance)}</span>
            {summary.daysOverdue ? ` · ${summary.daysOverdue} j de retard` : ""}
          </p>
        ) : null}
        <Label htmlFor="followup-notes">Compte rendu de la relance</Label>
        <Textarea id="followup-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = run(logInvoiceFollowUp, { invoiceId, notes });
              if (res.ok) onClose();
            }}
          >
            Consigner la relance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
