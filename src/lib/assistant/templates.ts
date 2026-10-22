import type { EmailSituation, EmailTemplate } from "@/lib/domain/types";

/**
 * Modèles d'e-mails de l'assistant commercial. Le texte est volontairement court, au
 * vouvoiement, sans promesse chiffrée : l'utilisateur relit et adapte avant tout envoi
 * (l'application n'envoie jamais d'e-mail elle-même).
 */

export const SITUATION_LABEL: Record<EmailSituation, string> = {
  proposal_followup: "Relance d'une proposition",
  reengage_customer: "Reprise de contact avec un client",
  first_contact: "Premier contact avec un prospect",
  overdue_followup: "Relance en retard",
  meeting_followup: "Suite à un rendez-vous",
  stalled_deal: "Affaire au point mort",
  custom: "Autre",
};

/** Variables disponibles dans l'objet et le corps des modèles. */
export const TEMPLATE_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: "prenom", label: "Prénom du contact", example: "Claire" },
  { key: "nom", label: "Nom du contact", example: "Martin" },
  { key: "entreprise", label: "Entreprise du contact", example: "Atelier Martin" },
  { key: "affaire", label: "Nom de l'opportunité", example: "Déploiement CRM" },
  { key: "montant", label: "Montant de l'opportunité", example: "12 000 €" },
  { key: "etape", label: "Étape du pipeline", example: "Proposition envoyée" },
  { key: "dernier_echange", label: "Date du dernier échange", example: "02/10/2026" },
  { key: "expediteur", label: "Votre nom", example: "Camille Durand" },
  { key: "fonction", label: "Votre fonction", example: "Responsable commerciale" },
  { key: "societe", label: "Votre société", example: "BDO Software" },
];

export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string>>;

const SIGNATURE = "\n\nBien cordialement,\n{{expediteur}}\n{{fonction}} — {{societe}}";

export const DEFAULT_EMAIL_TEMPLATES: readonly Readonly<EmailTemplate>[] = [
  {
    id: "tpl_proposal_followup",
    name: "Relance de proposition",
    situation: "proposal_followup",
    subject: "{{affaire}} : avez-vous pu consulter notre proposition ?",
    body: "Bonjour {{prenom}},\n\nJe reviens vers vous au sujet de notre proposition pour « {{affaire}} ». Avez-vous pu en prendre connaissance ?\n\nJe me tiens à votre disposition pour répondre à vos questions ou ajuster certains points. Seriez-vous disponible pour un court échange cette semaine ?" + SIGNATURE,
  },
  {
    id: "tpl_reengage_customer",
    name: "Reprise de contact client",
    situation: "reengage_customer",
    subject: "Des nouvelles de {{entreprise}}",
    body: "Bonjour {{prenom}},\n\nNous n'avons pas échangé depuis le {{dernier_echange}} et je voulais prendre de vos nouvelles. Comment se passent vos projets en ce moment ?\n\nSi vous avez de nouveaux besoins, je serais ravi(e) d'en discuter avec vous lors d'un appel de 20 minutes." + SIGNATURE,
  },
  {
    id: "tpl_first_contact",
    name: "Premier contact",
    situation: "first_contact",
    subject: "Prise de contact — {{societe}}",
    body: "Bonjour {{prenom}},\n\nJe me permets de vous contacter car nous accompagnons des entreprises comme {{entreprise}} dans l'organisation de leur activité commerciale.\n\nSeriez-vous ouvert(e) à un premier échange de 20 minutes pour mieux comprendre vos priorités ?" + SIGNATURE,
  },
  {
    id: "tpl_overdue_followup",
    name: "Relance en retard",
    situation: "overdue_followup",
    subject: "Suite à notre dernier échange",
    body: "Bonjour {{prenom}},\n\nComme convenu, je reviens vers vous à la suite de notre dernier échange du {{dernier_echange}}.\n\nOù en est votre réflexion ? Je peux vous apporter tout complément utile." + SIGNATURE,
  },
  {
    id: "tpl_meeting_followup",
    name: "Suite à un rendez-vous",
    situation: "meeting_followup",
    subject: "Suite à notre rendez-vous",
    body: "Bonjour {{prenom}},\n\nMerci pour le temps que vous nous avez accordé. Comme convenu, voici les prochaines étapes que je vous propose pour « {{affaire}} ».\n\nN'hésitez pas à me faire part de vos remarques." + SIGNATURE,
  },
  {
    id: "tpl_stalled_deal",
    name: "Affaire au point mort",
    situation: "stalled_deal",
    subject: "{{affaire}} : faisons le point",
    body: "Bonjour {{prenom}},\n\nNous avions échangé sur « {{affaire}} » et je souhaitais faire le point avec vous. Le sujet est-il toujours d'actualité pour {{entreprise}} ?\n\nSi le calendrier a changé, dites-le-moi simplement : je reviendrai vers vous au moment opportun." + SIGNATURE,
  },
];

export function defaultEmailTemplates(): EmailTemplate[] {
  return DEFAULT_EMAIL_TEMPLATES.map((t) => ({ ...t }));
}

/** Remplace les `{{variables}}` connues ; une variable vide est retirée proprement. */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => (vars as Record<string, string | undefined>)[key]?.trim() ?? "")
    .replace(/« »/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ — \n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Modèle de l'espace pour une situation (le premier défini), sinon le modèle par défaut. */
export function templateFor(templates: EmailTemplate[] | undefined, situation: EmailSituation): EmailTemplate {
  return templates?.find((t) => t.situation === situation) ?? DEFAULT_EMAIL_TEMPLATES.find((t) => t.situation === situation) ?? DEFAULT_EMAIL_TEMPLATES[0];
}

/** Lien `mailto:` (la messagerie de l'utilisateur s'ouvre ; rien n'est envoyé par l'application). */
export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
