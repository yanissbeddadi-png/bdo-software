import type { AppData, Contact } from "@/lib/domain/types";

/**
 * Détection des doublons probables de contacts (jamais de fusion automatique) :
 * - même adresse e-mail (insensible à la casse) ;
 * - même prénom + nom dans la même entreprise (normalisés, sans accents).
 */

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

export interface DuplicateMatch {
  contact: Contact;
  reason: "email" | "name_company";
}

export function findContactDuplicates(
  data: Pick<AppData, "contacts">,
  candidate: { email: string; firstName: string; lastName: string; clientId: string | null },
  exceptId?: string,
): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  const email = candidate.email.trim().toLowerCase();
  const name = `${norm(candidate.firstName)} ${norm(candidate.lastName)}`;
  for (const c of data.contacts) {
    if (c.id === exceptId) continue;
    if (email && c.email.toLowerCase() === email) out.push({ contact: c, reason: "email" });
    else if (candidate.clientId && c.clientId === candidate.clientId && `${norm(c.firstName)} ${norm(c.lastName)}` === name) out.push({ contact: c, reason: "name_company" });
  }
  return out;
}

export function describeDuplicates(matches: DuplicateMatch[]): string {
  return matches.map((m) => `${m.contact.firstName} ${m.contact.lastName} (${m.reason === "email" ? "même e-mail" : "même nom dans la même entreprise"})`).join(", ");
}
