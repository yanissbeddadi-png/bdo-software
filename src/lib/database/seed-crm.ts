/**
 * Jeu de démonstration CRM — ENTIÈREMENT FICTIF (domaines `.example`).
 *
 * Entreprises (clients, prospects, partenaire), contacts, opportunités, historique
 * d'interactions, missions (en retard, du jour, à venir, terminées) et notes. Toutes
 * les dates sont relatives à la date d'ancrage pour couvrir chaque état de l'interface :
 * relances en retard, actions du jour, prospects non traités, propositions en attente,
 * contacts sans prochaine action, clients inactifs, opportunités gagnées et perdues.
 */
import type { Client, Contact, CrmTaskType, ISODate, ISODateTime, Note, Opportunity, OpportunityStage, Priority, RelationType, SalesActivity, Task } from "@/lib/domain/types";
import { addDays } from "@/lib/calculations/dates";
import { QUALIFIED_STAGES, STAGES } from "@/lib/calculations/pipeline";

export interface SeedHelpers {
  anchor: ISODate;
  D: (days: number) => ISODate;
  M: (offset: number, day: number) => ISODate;
  ts: (date: ISODate, hour?: number) => ISODateTime;
  between: (min: number, max: number) => number;
}

const eur = (v: number) => Math.round(v * 100);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/* ------------------------------------------------------------------ */
/* Entreprises, contacts, opportunités                                 */
/* ------------------------------------------------------------------ */

export function crmEntities(h: SeedHelpers) {
  const { D, M, ts, between } = h;

  const company = (
    id: string,
    name: string,
    sector: string,
    city: string,
    created: ISODate,
    relation: RelationType,
    opts: { status?: Client["status"]; size?: string; satisfaction?: number | null; owner?: string; source?: string; notes?: string } = {},
  ): Client => ({
    id,
    name,
    sector,
    status: opts.status ?? "active",
    relation,
    size: opts.size ?? "11-50",
    city,
    country: "France",
    website: `https://www.${slug(name)}.example`,
    ownerId: opts.owner ?? "emp_sacha",
    source: opts.source ?? "",
    satisfaction: opts.satisfaction ?? null,
    notes: opts.notes ?? "",
    documents: [],
    createdAt: ts(created),
    updatedAt: ts(created),
  });

  const clients: Client[] = [
    // Clients actifs (historique de facturation dans les modules historiques).
    company("cli_novaretail", "NovaRetail", "Distribution", "Lyon", "2024-11-05", "customer", { size: "201-1000", satisfaction: 5, source: "Salon" }),
    company("cli_hexa", "HexaLogistics", "Logistique", "Villeurbanne", "2025-02-17", "customer", { size: "51-200", satisfaction: 4, source: "Recommandation" }),
    company("cli_greenpulse", "GreenPulse", "Énergie", "Grenoble", "2025-06-10", "customer", { size: "51-200", satisfaction: 3, source: "Site web", owner: "emp_camille" }),
    company("cli_horizon", "Atelier Horizon", "Artisanat & design", "Annecy", "2025-05-02", "customer", { size: "1-10", satisfaction: 4, source: "Recommandation", owner: "emp_camille" }),
    company("cli_finova", "Finova Conseil", "Conseil financier", "Paris", M(-11, 8), "customer", { size: "11-50", satisfaction: 5, source: "LinkedIn" }),
    company("cli_cloudnest", "CloudNest", "Hébergement", "Lyon", M(-10, 14), "customer", { size: "51-200", satisfaction: 4, source: "Partenaire" }),
    company("cli_medialink", "Medialink", "Médias", "Marseille", M(-10, 3), "customer", {
      status: "inactive",
      satisfaction: 3,
      source: "Site web",
      owner: "emp_camille",
      notes: "Relation en pause depuis le report du projet intranet.",
    }),
    company("cli_orbis", "Orbis Industrie", "Industrie", "Saint-Étienne", M(-8, 19), "customer", { size: "201-1000", satisfaction: 4, source: "Salon" }),
    company("cli_pixelforge", "PixelForge", "Jeux vidéo", "Montpellier", M(-7, 7), "customer", { satisfaction: 5, source: "Recommandation" }),
    company("cli_urbanflow", "UrbanFlow", "Mobilité", "Bordeaux", "2025-03-20", "former", {
      status: "churned",
      satisfaction: 2,
      source: "Campagne e-mail",
      notes: "Abonnement résilié — migration vers un outil interne.",
    }),
    company("cli_bluepeak", "BluePeak", "Tourisme", "Chambéry", M(-6, 11), "customer", { satisfaction: 4, source: "Site web", owner: "emp_camille" }),
    company("cli_synapse", "Synapse RH", "Ressources humaines", "Lyon", M(-4, 22), "customer", { satisfaction: 4, source: "Site web" }),
    company("cli_ecobatir", "ÉcoBâtir", "Construction", "Clermont-Ferrand", M(-3, 9), "customer", { size: "51-200", source: "Salon", owner: "emp_camille" }),
    company("cli_dataspring", "DataSpring", "Data & IA", "Nantes", M(-3, 25), "customer", { satisfaction: 5, source: "LinkedIn" }),
    company("cli_lumina", "LuminaTech", "Électronique", "Toulouse", M(-1, 4), "customer", { size: "51-200", source: "Salon" }),
    // Prospects.
    company("cli_solenne", "Maison Solenne", "Cosmétique", "Lyon", M(-2, 6), "prospect", { source: "Salon" }),
    company("cli_transalp", "TransAlp Fret", "Transport", "Chambéry", M(-2, 18), "prospect", { size: "201-1000", source: "Recommandation" }),
    company("cli_kerys", "Kerys Santé", "Santé", "Lyon", M(-1, 2), "prospect", { source: "Site web", owner: "emp_camille" }),
    company("cli_lumen", "Brasserie Lumen", "Agroalimentaire", "Annecy", D(-16), "prospect", { size: "1-10", source: "LinkedIn", owner: "emp_camille" }),
    company("cli_vectis", "Vectis Avocats", "Juridique", "Paris", M(-1, 20), "prospect", { source: "Partenaire" }),
    company("cli_optimum", "Optimum Immo", "Immobilier", "Grenoble", D(-6), "prospect", { source: "Appel entrant" }),
    company("cli_nordika", "Nordika Design", "Design", "Lille", M(-3, 10), "archived", { size: "1-10", source: "Site web", owner: "emp_camille" }),
    company("cli_helios", "Helios Énergie", "Énergie", "Valence", M(-1, 12), "prospect", { size: "201-1000", source: "Salon" }),
    company("cli_quartz", "Quartz Assurances", "Assurance", "Lyon", D(-3), "prospect", { size: "201-1000", source: "LinkedIn" }),
    company("cli_alto", "Alto Musique", "Culture", "Nantes", M(-2, 27), "prospect", { size: "1-10", source: "Recommandation", owner: "emp_camille" }),
    company("cli_verdure", "Verdure & Co", "Paysagisme", "Annecy", D(-1), "prospect", { source: "Site web" }),
    company("cli_atlas", "Atlas Formation", "Formation", "Lyon", D(-2), "prospect", { source: "Campagne e-mail" }),
    // Partenaire.
    company("cli_nexus", "Nexus Intégration", "Intégrateur", "Lyon", M(-5, 4), "partner", { source: "Partenaire" }),
  ];
  clients.find((c) => c.id === "cli_novaretail")!.documents.push({ id: "doc_nr_1", name: "Contrat-cadre NovaRetail 2025.pdf", kind: "Contrat", addedAt: ts("2024-11-20") });
  clients.find((c) => c.id === "cli_orbis")!.documents.push({ id: "doc_or_1", name: "Cahier des charges automatisation devis.pdf", kind: "Cahier des charges", addedAt: ts(M(-4, 2)) });

  const contacts: Contact[] = [];
  const person = (
    clientId: string,
    firstName: string,
    lastName: string,
    jobTitle: string,
    relation: RelationType,
    opts: { owner?: string; source?: string; priority?: Priority; created?: ISODate; primary?: boolean; phone?: boolean; email?: boolean; notes?: string } = {},
  ) => {
    const c = clients.find((x) => x.id === clientId)!;
    const created = opts.created ? ts(opts.created, 9) : c.createdAt;
    const contact: Contact = {
      id: `con_${clientId.slice(4)}_${slug(firstName)}`,
      clientId,
      leadId: null,
      firstName,
      lastName,
      jobTitle,
      email: opts.email === false ? "" : `${slug(firstName)}.${slug(lastName)}@${slug(c.name)}.example`,
      phone: opts.phone === false ? "" : `+33 6 00 00 ${String(between(10, 99))} ${String(between(10, 99))}`,
      relation,
      ownerId: opts.owner ?? c.ownerId,
      source: opts.source ?? c.source,
      priority: opts.priority ?? "normal",
      links: [],
      archivedAt: relation === "archived" ? ts(D(-40), 17) : null,
      isPrimary: opts.primary ?? !contacts.some((x) => x.clientId === clientId),
      notes: opts.notes ?? "",
      createdAt: created,
      updatedAt: created,
    };
    contacts.push(contact);
    return contact.id;
  };

  // Clients.
  person("cli_novaretail", "Sophie", "Garnier", "Directrice e-commerce", "customer", { priority: "high" });
  person("cli_novaretail", "Julien", "Roche", "DSI", "customer");
  person("cli_hexa", "Marc", "Lefebvre", "Directeur des opérations", "customer", { priority: "high" });
  person("cli_greenpulse", "Claire", "Fontaine", "Responsable marketing", "customer", { priority: "high" });
  person("cli_greenpulse", "Paul", "Mercier", "Directeur administratif", "customer");
  person("cli_horizon", "Élodie", "Blanc", "Gérante", "customer");
  person("cli_finova", "Antoine", "Girard", "Associé", "customer", { priority: "high" });
  person("cli_cloudnest", "Sarah", "Chevalier", "CTO", "customer");
  person("cli_medialink", "Nicolas", "Faure", "Directeur digital", "customer", { priority: "low" });
  person("cli_orbis", "Isabelle", "Rousseau", "Directrice industrielle", "customer", { priority: "high" });
  person("cli_orbis", "Karim", "Haddad", "Responsable ADV", "customer");
  person("cli_pixelforge", "Lucas", "Bonnet", "Producteur exécutif", "customer");
  person("cli_urbanflow", "Manon", "Lambert", "Head of Product", "former", { priority: "low" });
  person("cli_bluepeak", "Hélène", "Marchand", "Directrice générale", "customer");
  person("cli_synapse", "Romain", "Gauthier", "DRH", "customer");
  person("cli_synapse", "Amélie", "Perrin", "Chargée SIRH", "customer", { phone: false });
  person("cli_ecobatir", "Olivier", "Renaud", "Président", "customer");
  person("cli_dataspring", "Yasmine", "Cherif", "Head of Data", "customer", { owner: "emp_lea" });
  person("cli_lumina", "Benoît", "Arnaud", "Directeur service client", "customer", { priority: "high" });
  // Prospects.
  person("cli_solenne", "Agathe", "Morel", "Directrice marketing", "prospect", { priority: "high" });
  person("cli_transalp", "Didier", "Vasseur", "Directeur général", "prospect", { priority: "high" });
  person("cli_transalp", "Laura", "Michel", "Responsable exploitation", "prospect", { created: M(-1, 6) });
  person("cli_kerys", "Laure", "Simon", "Directrice médicale", "prospect");
  person("cli_lumen", "Victor", "Caron", "Cofondateur", "prospect", { priority: "low" });
  person("cli_vectis", "Anne", "Leroy", "Associée", "prospect", { priority: "high" });
  person("cli_optimum", "Fabien", "Collin", "Directeur d'agence", "prospect", { email: false });
  person("cli_nordika", "Sven", "Larsen", "Fondateur", "archived", { priority: "low" });
  person("cli_helios", "Margaux", "Rivière", "Responsable innovation", "prospect", { priority: "critical" });
  person("cli_quartz", "Bruno", "Lemoine", "Directeur des systèmes d'information", "prospect", { priority: "high" });
  person("cli_alto", "Chloé", "Vidal", "Directrice administrative", "prospect", { priority: "low" });
  person("cli_verdure", "Noémie", "Brun", "Gérante", "prospect", { phone: false });
  person("cli_atlas", "Emma", "Roux", "Directrice pédagogique", "prospect", { priority: "high" });
  // Partenaire.
  person("cli_nexus", "Thomas", "Garcia", "Directeur des partenariats", "partner");

  const contactOf = (clientId: string) => contacts.find((c) => c.clientId === clientId && c.isPrimary)!.id;

  const opp = (
    id: string,
    name: string,
    clientId: string,
    amount: number,
    stage: OpportunityStage,
    created: ISODate,
    expected: ISODate,
    source: string,
    lastInteraction: ISODate,
    opts: { closed?: ISODate; lostReason?: string; owner?: string; priority?: Priority; contactId?: string; archived?: ISODate; qualified?: ISODate } = {},
  ): Opportunity => {
    const def = STAGES.find((s) => s.id === stage)!;
    const qualified = opts.qualified ?? (QUALIFIED_STAGES.includes(stage) || (stage === "lost" && amount > 20_000) ? addDays(created, 12) : null);
    return {
      id,
      name,
      clientId,
      leadId: null,
      contactId: opts.contactId ?? contactOf(clientId),
      amount: eur(amount),
      probability: def.defaultProbability,
      stage,
      expectedCloseDate: expected,
      source,
      ownerId: opts.owner ?? clients.find((c) => c.id === clientId)!.ownerId,
      lastInteractionAt: ts(lastInteraction, 15),
      nextAction: "",
      notes: "",
      closedAt: opts.closed ? ts(opts.closed, 16) : null,
      lostReason: opts.lostReason ?? "",
      priority: opts.priority ?? "normal",
      qualifiedAt: qualified ? ts(qualified, 11) : null,
      archivedAt: opts.archived ? ts(opts.archived, 17) : null,
      createdAt: ts(created),
      updatedAt: ts(lastInteraction, 15),
    };
  };

  const opportunities: Opportunity[] = [
    // Gagnées.
    opp("opp_orbis_auto", "Automatisation des devis Orbis", "cli_orbis", 68_000, "won", M(-6, 2), M(-4, 15), "Salon", M(-4, 12), { closed: M(-4, 12) }),
    opp("opp_pixel_app", "Application mobile PixelForge", "cli_pixelforge", 82_000, "won", M(-6, 20), M(-4, 30), "Recommandation", M(-4, 26), { closed: M(-4, 26) }),
    opp("opp_synapse_portal", "Portail collaborateurs Synapse RH", "cli_synapse", 46_000, "won", M(-4, 25), M(-3, 20), "Site web", M(-3, 18), { closed: M(-3, 18) }),
    opp("opp_dataspring_dw", "Data warehouse DataSpring", "cli_dataspring", 56_000, "won", M(-3, 26), M(-1, 15), "LinkedIn", M(-1, 14), { closed: M(-1, 14) }),
    opp("opp_lumina_bot", "Chatbot support IA LuminaTech", "cli_lumina", 32_000, "won", M(-3, 5), D(-8), "Salon", D(-9), { closed: D(-9), priority: "high" }),
    opp("opp_cloudnest_backup", "Sauvegarde managée CloudNest", "cli_cloudnest", 14_500, "won", D(-38), D(-2), "Client existant", D(-3), { closed: D(-3) }),
    // Perdues / archivées.
    opp("opp_medialink_intranet", "Refonte intranet Medialink", "cli_medialink", 38_000, "lost", M(-5, 10), M(-3, 30), "Client existant", M(-3, 22), {
      closed: M(-3, 22),
      lostReason: "Budget reporté à l'an prochain",
    }),
    opp("opp_bluepeak_field", "Application terrain BluePeak", "cli_bluepeak", 24_000, "lost", M(-4, 3), M(-2, 15), "Client existant", M(-2, 9), {
      closed: M(-2, 9),
      lostReason: "Concurrent moins cher",
    }),
    opp("opp_nordika_site", "Site vitrine Nordika", "cli_nordika", 6_000, "lost", M(-3, 10), M(-2, 10), "Site web", M(-2, 4), {
      closed: M(-2, 4),
      lostReason: "Besoin hors de notre cœur de métier",
      archived: M(-2, 5),
    }),
    opp("opp_alto_app", "Billetterie en ligne Alto Musique", "cli_alto", 12_000, "lost", M(-2, 27), D(-10), "Recommandation", D(-18), { closed: D(-18), lostReason: "Pas de budget cette année" }),
    // En cours.
    opp("opp_nova_multisite", "Extension BDO Analytics multi-sites", "cli_novaretail", 32_000, "negotiation", M(-2, 4), D(12), "Client existant", D(-3), { priority: "high" }),
    opp("opp_hexa_ai", "Module IA de prévision des flux", "cli_hexa", 45_000, "proposal", M(-2, 15), D(25), "Client existant", D(-6), { priority: "high" }),
    opp("opp_green_training", "Formation & accompagnement BDO CRM", "cli_greenpulse", 7_500, "proposal", M(-1, 10), D(5), "Client existant", D(-14)),
    opp("opp_finova_renewal", "Renouvellement licence On-Premise Finova", "cli_finova", 9_600, "proposal", D(-25), D(10), "Client existant", D(-12), { priority: "high" }),
    opp("opp_cloudnest_support", "Support Premium CloudNest", "cli_cloudnest", 6_000, "discussion", D(-12), D(30), "Client existant", D(-5)),
    opp("opp_solenne_eshop", "Boutique en ligne Maison Solenne", "cli_solenne", 18_000, "discussion", M(-2, 8), D(40), "Salon", D(-4), { priority: "high" }),
    opp("opp_transalp_tms", "Digitalisation du TMS TransAlp", "cli_transalp", 60_000, "discussion", M(-2, 20), D(55), "Recommandation", D(-7), { priority: "high" }),
    opp("opp_helios_cadrage", "Plateforme de suivi énergétique Helios", "cli_helios", 40_000, "discussion", M(-1, 12), D(70), "Salon", D(-2), { priority: "critical" }),
    opp("opp_horizon_maint", "Maintenance évolutive Atelier Horizon", "cli_horizon", 9_600, "qualify", M(-2, 1), D(20), "Client existant", D(-31)),
    opp("opp_vectis_ged", "GED et signature électronique Vectis", "cli_vectis", 14_000, "qualify", M(-1, 20), D(45), "Partenaire", D(-9), { priority: "high" }),
    opp("opp_optimum_portal", "Portail propriétaires Optimum Immo", "cli_optimum", 11_000, "qualify", D(-6), D(60), "Appel entrant", D(-5)),
    opp("opp_kerys_portal", "Portail patients Kerys Santé", "cli_kerys", 25_000, "new", M(-1, 3), D(75), "Site web", D(-10)),
    opp("opp_lumen_shop", "Click & collect Brasserie Lumen", "cli_lumen", 5_500, "new", D(-16), D(80), "LinkedIn", D(-16)),
    opp("opp_quartz_crm", "CRM collaboratif Quartz Assurances", "cli_quartz", 52_000, "new", D(-3), D(90), "LinkedIn", D(-3), { priority: "high" }),
    opp("opp_verdure_site", "Devis en ligne Verdure & Co", "cli_verdure", 4_800, "new", D(-1), D(90), "Site web", D(-1)),
  ];

  return { clients, contacts, opportunities };
}

/* ------------------------------------------------------------------ */
/* Historique : interactions, missions, notes                          */
/* ------------------------------------------------------------------ */

export function crmJournal(h: SeedHelpers, ents: ReturnType<typeof crmEntities>, extra: { medialinkInvoiceId: string | null }) {
  const { anchor, D, ts } = h;
  const { contacts, opportunities } = ents;
  const contactOfOpp = (id: string) => opportunities.find((o) => o.id === id)!.contactId;
  const clientOfContact = (id: string | null) => contacts.find((c) => c.id === id)?.clientId ?? null;

  /* ---------- Interactions (faits passés) ---------- */
  const salesActivities: SalesActivity[] = [];
  const log = (
    type: SalesActivity["type"],
    date: ISODate,
    subject: string,
    link: { contactId?: string | null; opportunityId?: string; clientId?: string; invoiceId?: string | null },
    opts: { hour?: number; direction?: "in" | "out"; outcome?: string; notes?: string; nextStep?: string; owner?: string } = {},
  ) => {
    if (date > anchor) return;
    const contactId = link.contactId ?? (link.opportunityId ? contactOfOpp(link.opportunityId) : null);
    const hour = opts.hour ?? 10;
    // Une interaction du jour d'ancrage reste dans le passé (avant 9 h UTC).
    const at = ts(date, date === anchor ? Math.min(hour, 7) : hour);
    salesActivities.push({
      id: `sa_${String(salesActivities.length + 1).padStart(3, "0")}`,
      type,
      date: at,
      subject,
      notes: opts.notes ?? "",
      clientId: link.clientId ?? clientOfContact(contactId) ?? opportunities.find((o) => o.id === link.opportunityId)?.clientId ?? null,
      leadId: null,
      opportunityId: link.opportunityId ?? null,
      invoiceId: link.invoiceId ?? null,
      ownerId: opts.owner ?? "emp_sacha",
      contactId,
      direction: type === "call" || type === "email" || type === "message" ? (opts.direction ?? "out") : null,
      outcome: opts.outcome ?? "",
      nextStep: opts.nextStep ?? "",
      taskId: null,
      done: true,
      createdAt: at,
    });
  };

  const stageOrder: OpportunityStage[] = ["new", "qualify", "discussion", "proposal", "negotiation"];
  for (const o of opportunities) {
    const created = o.createdAt.slice(0, 10);
    const last = o.lastInteractionAt.slice(0, 10);
    const link = { opportunityId: o.id };
    const reached = o.stage === "won" ? 5 : o.stage === "lost" ? (o.qualifiedAt ? 3 : 1) : stageOrder.indexOf(o.stage);
    // Les prospects tout juste arrivés n'ont pas encore été contactés (état « à traiter »).
    if (o.stage === "new" && created >= addDays(anchor, -2)) continue;
    log("call", created, `Appel de découverte — ${o.name}`, link, { outcome: "Besoin confirmé, interlocuteur identifié.", direction: o.source === "Appel entrant" ? "in" : "out" });
    if (reached >= 2)
      log("meeting", addDays(created, 9), `Rendez-vous de qualification — ${o.name}`, link, { hour: 14, outcome: "Budget et calendrier validés.", nextStep: "Préparer une proposition" });
    if (reached >= 3) log("email", addDays(created, 20), `Envoi de la proposition — ${o.name}`, link, { outcome: "Proposition commerciale transmise." });
    if (reached >= 4) log("demo", addDays(created, 26), `Démonstration — ${o.name}`, link, { hour: 15, outcome: "Démonstration appréciée par l'équipe métier." });
    if (o.stage === "won") log("meeting", last, `Signature — ${o.name}`, link, { hour: 15, outcome: "Contrat signé." });
    else if (o.stage === "lost") log("call", last, `Débrief de la perte — ${o.name}`, link, { hour: 15, outcome: o.lostReason });
    else if (last > created) log("followup", last, `Point d'avancement — ${o.name}`, link, { hour: 15, outcome: "Échange constructif, décision en attente." });
  }
  // Interactions récentes variées (séries d'activité et timeline).
  log("email", D(-1), "Réponse aux questions sur la sécurité des données", { contactId: "con_quartz_bruno" }, { direction: "in", outcome: "Demande de documentation RGPD." });
  log("call", D(-2), "Point d'étape sur l'atelier de cadrage", { opportunityId: "opp_helios_cadrage" }, { outcome: "Atelier confirmé, trois participants côté client." });
  log("message", D(-4), "Question sur les délais de mise en ligne", { contactId: "con_solenne_agathe" }, { direction: "in", outcome: "Lancement souhaité avant les soldes d'hiver." });
  log("note", D(-5), "Compte rendu du comité de pilotage GreenPulse", { contactId: "con_greenpulse_claire" }, { outcome: "Satisfaction en baisse sur les délais de support." });
  log("call", D(-7), "Appel de suivi déploiement", { contactId: "con_lumina_benoit" }, { outcome: "Mise en production réussie, montée en charge à surveiller." });
  log("email", D(-8), "Envoi de l'étude de cas « GED cabinet d'avocats »", { opportunityId: "opp_vectis_ged" }, { outcome: "Étude de cas envoyée, retour attendu." });
  log("call", D(-9), "Appel entrant — demande d'accès API", { contactId: "con_dataspring_yasmine" }, { direction: "in", owner: "emp_lea", outcome: "Demande transmise au support." });
  log("meeting", D(-11), "Revue trimestrielle du compte", { contactId: "con_novaretail_sophie" }, { hour: 14, outcome: "Engagement 24 mois envisagé contre remise." });
  log("call", D(-15), "Appel de courtoisie", { contactId: "con_bluepeak_helene" }, { outcome: "Pas de nouveau besoin à court terme." });
  log("email", D(-20), "Partage du rapport d'usage BDO Analytics", { contactId: "con_finova_antoine" }, { outcome: "Rapport transmis." });
  log("call", D(-25), "Présentation du programme partenaires", { contactId: "con_nexus_thomas" }, { outcome: "Intérêt pour un partenariat d'intégration." });
  log("call", D(-60), "Point annuel", { contactId: "con_horizon_elodie" }, { outcome: "Souhaite des évolutions mineures." });
  log("call", D(-75), "Appel de suivi", { contactId: "con_ecobatir_olivier" }, { outcome: "RAS." });
  if (extra.medialinkInvoiceId)
    log("followup", D(-45), "Relance facture Medialink", { contactId: "con_medialink_nicolas", invoiceId: extra.medialinkInvoiceId }, { outcome: "Paiement promis sous 15 jours." });
  // Interaction du matin même (avant l'heure d'ancrage).
  log("call", anchor, "Appel entrant — question de facturation", { contactId: "con_orbis_karim" }, { direction: "in", hour: 7, outcome: "Réponse apportée immédiatement." });
  // Événements de changement d'étape récents (timeline des opportunités en cours).
  const stageEvent = (oppId: string, date: ISODate, subject: string) => {
    const o = opportunities.find((x) => x.id === oppId)!;
    salesActivities.push({
      id: `sa_${String(salesActivities.length + 1).padStart(3, "0")}`,
      type: "stage_change",
      date: ts(date, 16),
      subject: `${o.name} : ${subject}`,
      notes: "",
      clientId: o.clientId,
      leadId: null,
      opportunityId: o.id,
      invoiceId: null,
      ownerId: o.ownerId,
      contactId: o.contactId,
      direction: null,
      outcome: "",
      nextStep: "",
      taskId: null,
      done: true,
      createdAt: ts(date, 16),
    });
  };
  stageEvent("opp_nova_multisite", D(-20), "Proposition envoyée → Négociation");
  stageEvent("opp_hexa_ai", D(-6), "En discussion → Proposition envoyée");
  stageEvent("opp_helios_cadrage", D(-12), "À qualifier → En discussion");
  stageEvent("opp_cloudnest_support", D(-5), "À qualifier → En discussion");
  stageEvent("opp_finova_renewal", D(-12), "En discussion → Proposition envoyée");
  stageEvent("opp_green_training", D(-14), "En discussion → Proposition envoyée");

  /* ---------- Missions CRM ---------- */
  const tasks: Task[] = [];
  const mission = (
    title: string,
    type: CrmTaskType,
    due: ISODate,
    link: { contactId?: string; opportunityId?: string },
    opts: {
      time?: string;
      priority?: Priority;
      status?: Task["status"];
      done?: ISODate;
      result?: string;
      owner?: string;
      created?: ISODate;
      description?: string;
      recurrence?: Task["recurrence"];
    } = {},
  ) => {
    const contactId = link.contactId ?? (link.opportunityId ? contactOfOpp(link.opportunityId) : null);
    const status = opts.status ?? (opts.done ? "done" : "todo");
    const created = ts(opts.created ?? addDays(due, -5), 9);
    const completedAt = opts.done ? ts(opts.done, 15) : null;
    tasks.push({
      id: `tsk_crm_${String(tasks.length + 1).padStart(3, "0")}`,
      title,
      description: opts.description ?? "",
      type,
      contactId,
      opportunityId: link.opportunityId ?? null,
      dueTime: opts.time ?? null,
      result: opts.result ?? "",
      assigneeId: opts.owner ?? "emp_sacha",
      priority: opts.priority ?? "normal",
      status,
      complexity: "simple",
      dueDate: due,
      estimateHours: type === "meeting" ? 1 : 0.5,
      actualHours: 0,
      projectId: null,
      clientId: clientOfContact(contactId),
      goalId: null,
      dependsOn: [],
      comments: [],
      recurrence: opts.recurrence ?? "none",
      completedAt,
      createdAt: created,
      updatedAt: completedAt ?? created,
    });
  };

  // En retard.
  mission("Relancer Élodie Blanc — maintenance évolutive", "followup", D(-6), { opportunityId: "opp_horizon_maint" }, { created: D(-20) });
  mission("Relancer Claire Fontaine — validation du devis formation", "followup", D(-3), { opportunityId: "opp_green_training" }, { priority: "high", owner: "emp_camille" });
  mission("Rappeler Laure Simon pour qualifier le besoin", "call", D(-2), { opportunityId: "opp_kerys_portal" }, { owner: "emp_camille" });
  mission("Relancer Anne Leroy suite à l'étude de cas", "email", D(-1), { opportunityId: "opp_vectis_ged" }, { priority: "high" });
  // Aujourd'hui.
  mission("Relancer Marc Lefebvre — proposition module IA", "followup", anchor, { opportunityId: "opp_hexa_ai" }, { time: "10:00", priority: "high" });
  mission("Revue de l'offre multi-sites avec Sophie Garnier", "meeting", anchor, { opportunityId: "opp_nova_multisite" }, { time: "16:00", priority: "high" });
  mission("Appel de découverte — Brasserie Lumen", "call", anchor, { opportunityId: "opp_lumen_shop" }, { time: "14:30", owner: "emp_camille" });
  mission("Envoyer la documentation RGPD à Bruno Lemoine", "email", anchor, { contactId: "con_quartz_bruno" }, { priority: "high" });
  // À venir.
  mission("Négociation tarifaire NovaRetail", "call", D(1), { opportunityId: "opp_nova_multisite" }, { time: "11:00", priority: "high" });
  mission("Qualifier le budget Optimum Immo", "qualification", D(1), { opportunityId: "opp_optimum_portal" });
  mission("Démonstration BDO Flow — TransAlp", "meeting", D(2), { opportunityId: "opp_transalp_tms" }, { time: "14:00", priority: "high" });
  mission("Traiter la demande d'accès API DataSpring", "request", D(2), { contactId: "con_dataspring_yasmine" }, { owner: "emp_lea" });
  mission("Préparer la proposition Maison Solenne", "proposal_prep", D(3), { opportunityId: "opp_solenne_eshop" }, { priority: "high" });
  mission("Attendre le retour juridique NovaRetail", "sales_followup", D(4), { contactId: "con_novaretail_julien" }, { status: "waiting" });
  mission("Premier appel — Quartz Assurances", "call", D(4), { opportunityId: "opp_quartz_crm" }, { time: "09:30", priority: "high" });
  mission("Atelier de cadrage Helios Énergie", "meeting", D(6), { opportunityId: "opp_helios_cadrage" }, { time: "09:30", priority: "critical" });
  mission("Point satisfaction trimestriel Finova", "retention", D(8), { contactId: "con_finova_antoine" });
  mission("Démonstration BDO Analytics — Maison Solenne", "meeting", D(9), { opportunityId: "opp_solenne_eshop" }, { time: "16:00" });
  mission("Envoyer la proposition révisée CloudNest", "proposal_send", D(10), { opportunityId: "opp_cloudnest_support" });
  mission("Suivi du déploiement chatbot LuminaTech", "sales_followup", D(12), { contactId: "con_lumina_benoit" }, { priority: "high" });
  mission("Revue hebdomadaire des comptes clés", "retention", D(3), { contactId: "con_orbis_isabelle" }, { recurrence: "weekly" });
  mission("Relancer Antoine Girard — proposition de renouvellement", "followup", D(2), { opportunityId: "opp_finova_renewal" }, { priority: "high" });
  // Terminées (historique, majoritairement à l'heure).
  const doneOnTime: [string, CrmTaskType, number, { contactId?: string; opportunityId?: string }, string][] = [
    ["Appel de qualification — Kerys Santé", "call", -12, { opportunityId: "opp_kerys_portal" }, "Besoin réel, décision en comité médical."],
    ["Envoyer l'étude de cas à Vectis", "email", -8, { opportunityId: "opp_vectis_ged" }, "Étude de cas envoyée."],
    ["Relancer Sarah Chevalier — support premium", "followup", -5, { opportunityId: "opp_cloudnest_support" }, "Intéressée, demande une proposition révisée."],
    ["Point d'étape Helios", "call", -2, { opportunityId: "opp_helios_cadrage" }, "Atelier confirmé."],
    ["Préparer la proposition module IA", "proposal_prep", -7, { opportunityId: "opp_hexa_ai" }, "Proposition finalisée."],
    ["Envoyer la proposition module IA", "proposal_send", -6, { opportunityId: "opp_hexa_ai" }, "Proposition envoyée."],
    ["Rendez-vous de lancement CloudNest", "meeting", -3, { opportunityId: "opp_cloudnest_backup" }, "Contrat signé, lancement planifié."],
    ["Appel de suivi LuminaTech", "call", -7, { contactId: "con_lumina_benoit" }, "Mise en production réussie."],
    ["Répondre à Agathe Morel sur les délais", "email", -4, { contactId: "con_solenne_agathe" }, "Planning communiqué."],
    ["Revue hebdomadaire des comptes clés", "retention", -4, { contactId: "con_orbis_isabelle" }, "Comptes clés passés en revue."],
    ["Revue trimestrielle NovaRetail", "meeting", -11, { contactId: "con_novaretail_sophie" }, "Engagement 24 mois envisagé."],
    ["Relancer Antoine Girard — rapport d'usage", "followup", -20, { contactId: "con_finova_antoine" }, "Rapport envoyé, retour positif."],
    ["Qualifier le besoin Optimum Immo", "call", -5, { opportunityId: "opp_optimum_portal" }, "Premier contact établi, budget à confirmer."],
    ["Relancer Didier Vasseur", "followup", -9, { opportunityId: "opp_transalp_tms" }, "Démonstration programmée."],
  ];
  for (const [title, type, day, link, result] of doneOnTime) mission(title, type, D(day), link, { done: D(day), result, created: D(day - 6) });
  // Une relance réalisée en retard (ponctualité visible dans les statistiques).
  mission("Relancer Hélène Marchand — nouvelle application", "followup", D(-19), { contactId: "con_bluepeak_helene" }, { done: D(-15), result: "Pas de nouveau besoin.", created: D(-30) });
  // Une mission annulée.
  mission("Relancer Chloé Vidal", "followup", D(-16), { opportunityId: "opp_alto_app" }, { status: "cancelled", created: D(-25) });

  /* ---------- Notes ---------- */
  const note = (id: string, title: string, body: string, link: { contactId?: string; opportunityId?: string; clientId?: string }, date: ISODate): Note => ({
    id,
    title,
    body,
    clientId: link.clientId ?? clientOfContact(link.contactId ?? null) ?? opportunities.find((o) => o.id === link.opportunityId)?.clientId ?? null,
    projectId: null,
    contactId: link.contactId ?? (link.opportunityId ? contactOfOpp(link.opportunityId) : null),
    opportunityId: link.opportunityId ?? null,
    createdAt: ts(date, 17),
    updatedAt: ts(date, 17),
  });
  const notes: Note[] = [
    note(
      "note_001",
      "Négociation NovaRetail",
      "Sophie Garnier souhaite un engagement de 24 mois en échange d'une remise de 8 %. À arbitrer au prochain comité.",
      { opportunityId: "opp_nova_multisite" },
      D(-3),
    ),
    note("note_004", "Contexte Helios", "Projet porté par la direction générale ; trois sites pilotes. Concurrence : un éditeur spécialisé énergie.", { opportunityId: "opp_helios_cadrage" }, D(-12)),
    note("note_005", "Préférences de contact", "Préfère être contacté par e-mail le matin ; éviter les relances le vendredi.", { contactId: "con_vectis_anne" }, D(-15)),
    note("note_006", "Satisfaction GreenPulse", "Délais de support jugés trop longs au dernier comité. Proposer le Support Premium.", { contactId: "con_greenpulse_claire" }, D(-5)),
    note("note_007", "Partenariat Nexus", "Intégrateur intéressé par une revente de BDO Flow. Prévoir une grille de commissions.", { contactId: "con_nexus_thomas" }, D(-25)),
  ];

  return { salesActivities, tasks, notes };
}
