import type { AppData, EntityRef } from "@/lib/domain/types";

/** URL de la page affichant une entité (navigation depuis alertes, recherche, activité…). */
export function entityHref(ref: EntityRef | null | undefined, data?: Pick<AppData, "contacts" | "payments">): string | null {
  if (!ref) return null;
  switch (ref.type) {
    case "client":
      return `/clients/${ref.id}`;
    case "contact": {
      const c = data?.contacts.find((x) => x.id === ref.id);
      return c?.clientId ? `/clients/${c.clientId}?tab=contacts` : "/crm/prospects";
    }
    case "lead":
      return `/crm/prospects?focus=${ref.id}`;
    case "opportunity":
      return `/crm?focus=${ref.id}`;
    case "activity":
      return "/crm/activites";
    case "product":
      return `/catalogue?focus=${ref.id}`;
    case "quote":
      return `/crm/devis/${ref.id}`;
    case "invoice":
      return `/finances/factures/${ref.id}`;
    case "payment": {
      const p = data?.payments.find((x) => x.id === ref.id);
      return p ? `/finances/factures/${p.invoiceId}` : "/finances/factures";
    }
    case "expense":
      return `/finances/depenses?focus=${ref.id}`;
    case "subscription":
      return `/finances/abonnements?focus=${ref.id}`;
    case "project":
      return `/projets/${ref.id}`;
    case "task":
      return `/taches?focus=${ref.id}`;
    case "employee":
      return `/equipe?focus=${ref.id}`;
    case "goal":
      return `/objectifs?focus=${ref.id}`;
    case "mission":
      return `/missions?focus=${ref.id}`;
    case "achievement":
      return "/progression?tab=succes";
    case "note":
      return "/operations?tab=notes";
    case "credit_note":
      return `/finances/avoirs/${ref.id}`;
    case "vat_return":
      return "/finances/tva";
  }
}
