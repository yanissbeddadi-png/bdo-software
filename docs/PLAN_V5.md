# Plan v5 — améliorations du CRM

Plan de travail de la version 5 (branche d'intégration `ameliorations-v5`). Chaque chantier
est développé sur sa propre branche `v5/<chantier>` à partir de `ameliorations-v5`, puis
fusionné après revue. Les consignes communes s'appliquent à tous les chantiers.

## Déjà fait (commit « Fondations v5 »)

- Types v5 : `Settings.ai`, `Settings.customFields`, `Settings.emailTemplates`,
  `custom?: CustomValues` sur Contact / Client / Opportunity, module `assistant`.
- Migration v5 (`src/lib/database/migrations.ts`), finances masquées sur un espace client neuf.
- Commandes `updateAiSettings`, `updateCustomFields`, `updateEmailTemplates`
  (`src/lib/domain/commands/settings.ts`).
- Moteur de l'assistant (`src/lib/assistant` : `risk`, `forecast`, `drafts`, `briefing`,
  `templates`).
- IA générative côté serveur uniquement (`src/lib/ai` : `claude.ts`, `context.ts`,
  `actions.ts`), appelant `src/lib/cloud/caller.ts`.
- En-têtes de sécurité (`next.config.ts`), fonctions Vercel à Paris (`vercel.json`).

## Consignes communes (non négociables)

- **Mise en place** : `npm ci` si `node_modules` est absent. Lire `README.md`, `AGENTS.md`
  et les fichiers touchés avant de les modifier. Next.js 16 a des changements incompatibles :
  consulter `node_modules/next/dist/docs/` en cas de doute.
- **Interface en français**, ton existant. Respecter le style, le nommage et la densité de
  commentaires du code voisin.
- **Aucune intégration simulée** (pas de faux envoi d'e-mail, paiement, agenda). `mailto:`,
  copie et téléchargement sont permis. Ce qui n'est pas configuré l'affiche clairement.
- **Aucun secret** dans le dépôt ni dans le navigateur : la clé de service Supabase et
  `ANTHROPIC_API_KEY` restent côté serveur.
- Pas de bouton mort. Respect de `prefers-reduced-motion`. Accessibilité (libellés,
  clavier, focus, aria).
- Ne pas supprimer de données sans stratégie de migration. La logique métier passe par des
  **commandes** (`src/lib/domain/commands`), rejouées côté serveur en mode partagé : elles
  restent déterministes (identifiants par `newId` sous `withIdSeed`, temps par `ctx.now` /
  `ctx.today`, nombre d'appels à `newId` indépendant des données invisibles à l'utilisateur).
- **Cloisonnement** : un commercial ne voit et ne modifie que son portefeuille
  (`src/lib/cloud/scope.ts`) ; le directeur commercial (rôle `dirigeant`) voit tout. Ne jamais
  l'affaiblir. Le navigateur exécute les commandes sur la projection, le serveur sur le
  document complet : le résultat doit être identique.
- Changements ciblés ; préférer de nouveaux fichiers ; petites modifications dans les
  fichiers partagés (`settings.tsx`, `crm.ts`, `types.ts`, `schemas.ts`, `app-store.ts`,
  `nav.ts`, `seed.ts`) pour faciliter la fusion avec les autres chantiers.
- **Tests** Vitest pour toute nouvelle logique. Ne pas lancer Playwright ni `next build`
  (fait à l'intégration). Lancer `npx tsc --noEmit`, `npx vitest run`,
  `npx eslint <chemins modifiés>` : tout doit passer. Ne rapporter que des résultats réels.
- **Enregistrer souvent** : après chaque point terminé et vert, commit puis push :
  ```
  git add -A && git -c user.email=yanissbeddadi@gmail.com -c user.name="BDO Software" commit -m "<message en français>

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LHM9bLdLjJgrdZ7pjFSNxV"
  git push -u origin HEAD:v5/<chantier>
  ```
  Si la branche distante `v5/<chantier>` existe déjà (reprise après interruption), partir
  d'elle (`git fetch origin v5/<chantier> && git reset --hard origin/v5/<chantier>`) et
  continuer sans refaire le travail. Ne jamais pousser sur `main` ni sur `ameliorations-v5`.
- **Fin** : relecture critique de tout le diff (`git diff origin/ameliorations-v5..HEAD`) —
  bugs, cloisonnement, déterminisme, boutons morts, accessibilité, français — corrections,
  commit, push. Rapport final : branche, commits, résumé, fichiers, résultats exacts des
  tests, notes de fusion, points non faits.

---

## Vague 1

### A1 — Intégrité serveur et cloisonnement (`v5/a1-isolation`)

1. `scope.ts` : un commercial peut rattacher son contact ou son opportunité à l'entreprise
   d'un collègue (le périmètre suit les liens), puis la modifier ou la réaffecter. Dans
   `scopeViolation` (périmètre AVANT vs APRÈS) : un commercial ne peut rattacher un contact ou
   une opportunité qu'à une entreprise déjà dans son périmètre avant la commande (ou créée
   dans la même commande) ; `updateClient` / `deleteClient` exigent que l'entreprise soit
   dans son périmètre avant ; changer le responsable d'un élément qui ne lui appartient pas
   est refusé. Le directeur reste sans restriction.
2. `projectForUser` divulgue des identifiants d'éléments de collègues via `retiredXpKeys`
   (`contact-complete:<id>`…). N'envoyer que les clés des éléments du périmètre, sans que la
   gamification ne redonne de l'XP côté navigateur.
3. Notifications et défis hors périmètre : « Tout marquer comme lu » sans identifiants marque
   toute l'organisation ; `setMissionStatus` accepté sur n'importe quel défi ; le défi
   personnel d'un commercial disparaît de sa projection. Un utilisateur ne modifie que les
   notifications et défis qui lui sont visibles ; la barre du haut
   (`src/components/layout/topbar.tsx`) envoie les identifiants visibles ; un défi personnel
   reçoit un propriétaire (`ownerEmployeeId` optionnel sur `Mission`) et reste visible de son
   auteur ; les défis d'équipe sont visibles de tous mais seul le directeur change leur statut.
4. Validation des références : helper `assertRefs` dans `commands/core.ts`, utilisé par
   `createOpportunity`, `updateOpportunity`, `scheduleAction`, `createNote`,
   `logInteraction`, `createContact` / `updateContact` (`clientId`), `createTask`.
5. Réutilisation de graine : refuser dans `runSharedCommand` tout résultat contenant des
   identifiants en double dans une collection (« Requête invalide. »).
6. `createProspect` dédoublonne l'entreprise sur le document complet côté serveur mais sur la
   projection côté navigateur (identifiants divergents, rattachement à l'entreprise cachée
   d'un collègue). La détection de doublons (entreprise dans `createProspect`, contacts dans
   `createContact` / `updateContact`) ne porte que sur les éléments visibles de l'utilisateur
   (`computeScope` hors accès complet) : même résultat des deux côtés, et plus de fuite des
   noms de contacts des collègues dans les messages d'erreur.
7. Valider les champs non validés : `moveOpportunity.lostReason` et
   `archiveOpportunity.reason` (≤ 500), `setMissionStatus.note` (≤ 500),
   `markNotificationRead.read` (booléen), `addClientDocument` nom / type (≤ 200 / ≤ 60).
8. `runSharedCommand` : refuser un document de plus de 8 Mo (message clair).
9. `pullRemote` : lire d'abord la seule version, les données seulement si elle a changé.
10. `installOrganization` : comparaison du code en temps constant (`timingSafeEqual`), code
    d'au moins 12 caractères (sinon message demandant un `BDO_SETUP_CODE` plus long),
    limitation des échecs (en mémoire, 10 par 15 min et par instance) et délai ~800 ms.
11. `updateMember` : vérifier le résultat du bannissement / débannissement Auth et qu'une
    ligne de membre a bien été trouvée.
12. Mettre à jour la section « Mode multi-utilisateur » du README si le comportement change.

### A2 — Fiabilité côté navigateur et justesse (`v5/a2-robustness`)

1. `app-store.ts` (mode partagé) : quand `runRemote` échoue sans renvoyer de données, la
   modification optimiste n'est jamais annulée. Forcer une resynchronisation qui ignore la
   version ; afficher « Non enregistré » dans l'indicateur de la barre du haut jusqu'à la
   resynchronisation ; avertissement `beforeunload` tant que des écritures sont en attente ;
   session expirée → redirection vers `/connexion?suite=<chemin>` au lieu d'un message toutes
   les 20 s ; `.catch` avec message sur `replaceRemote` / `resetRemote`.
2. Fuseau horaire : valider les fuseaux IANA dans `updateCompanySettings` et l'import Excel
   (« Fuseau horaire ») ; `clock()` (`src/lib/store/clock.ts`) se replie sur Europe/Paris en
   cas de `RangeError`.
3. L'acceptation d'un devis lié à une opportunité ouverte (`commands/finance.ts`) passe par
   `moveOpportunity` (conversion prospect → client, interaction de changement d'étape,
   `qualifiedAt`, activité, audit).
4. Redirection ouverte après connexion (`src/features/auth/auth-pages.tsx`) : n'accepter que
   des chemins commençant par un seul « / » suivi d'un caractère autre que « / » ou « \ ».
5. Journal d'audit en ajout seul : vider l'espace, recharger la démo, remplacer par une
   sauvegarde et importer conservent les entrées précédentes et ajoutent la leur ; un import
   conserve les entrées d'audit de ses sous-commandes.
6. Mode démo : ne jamais réinitialiser des données d'une version plus récente que
   `SEED_VERSION` (erreur explicite proposant l'export) ; `replaceAll` vérifie `canMigrate` ;
   erreurs de quota du localStorage signalées avec suggestion d'export.
7. Passage de minuit : `useClock` (`src/lib/store/hooks.ts`) se recalcule à minuit local.
8. `bulkUpdateContacts` : une seule entrée d'audit pour un archivage groupé.
9. Dates métier sûres vis-à-vis du fuseau : `localDateOf(iso, timeZone)` dans
   `src/lib/calculations/dates.ts` (reprendre `localDateMinute` de `calculations/office.ts`),
   utilisé pour le contrôle « date future » de `logInteraction`, les dates de réalisation et
   les regroupements par jour ; le formulaire d'interaction (`crm-forms.tsx`) construit des
   horodatages cohérents. Tests à heure fixe (Montréal le soir, Paris 0 h–2 h).
10. Formulaires : une nouvelle opportunité prend la probabilité de l'étape choisie
    (`settings.crm.stages`) tant que l'utilisateur ne la modifie pas ; la source par défaut
    est la première source configurée (plus de « Site web » codé en dur).
11. `DataTable` : la sélection est réduite aux lignes visibles quand la recherche ou les
    filtres changent ; l'export CSV des contacts exporte ce qui est affiché.
12. Site web d'entreprise (`companies.tsx`) : normaliser le lien (https:// ajouté, seuls
    http / https acceptés).

### B — Interface de l'assistant commercial (`v5/b-assistant-ui`)

1. Route `/assistant` (page mince) rendant `src/features/assistant/assistant-page.tsx` ;
   entrée de navigation « Assistant » (icône Sparkles) après « Vue d'ensemble » dans
   `nav.ts`, masquée si `settings.modules.assistant` est faux.
2. « Rapport du matin » : salutation (prénom + date longue) ; `briefing.headline` ; bascule
   « Mon portefeuille / Toute l'équipe » (équipe réservée aux accès complets ; défaut = moi
   si l'utilisateur a une fiche collaborateur) ; sections : « Depuis <jour> », « Agenda du
   jour », « Priorités » (raisons + actions rapides, alignées sur le centre d'action du
   tableau de bord), « Affaires à risque » (score, facteurs, ouvrir, planifier une relance),
   « Brouillons à valider », « Prévision » (3 mois + dates dépassées + plus tard, liens),
   « Qualité des données » (compteurs avec liens filtrés quand c'est possible).
3. Brouillons : destinataire, objet et corps modifiables, raison ; « Ouvrir dans ma
   messagerie » (`mailtoHref`), « Copier », « Consigner l'envoi » (`logInteraction` e-mail
   sortant, `taskId` pour terminer la relance, option « Planifier une relance dans N jours
   ouvrés »), « Ignorer pour aujourd'hui » (localStorage par utilisateur et par jour, en
   try/catch), « Améliorer avec l'IA » (styles + consigne) via `aiImproveDraft`, actif
   seulement si `aiStatus().available`, sinon affichage de la raison.
4. Fiche contact : carte « Synthèse IA » (`src/features/assistant/account-summary.tsx`) qui
   appelle `aiAccountSummary` sur clic uniquement ; badge de risque de l'opportunité
   principale.
5. Pipeline : indicateur de risque (score, niveau, facteurs en infobulle) sur les cartes et la
   fiche opportunité, calculé avec `dealRisk` + `stageChangeIndex` une seule fois (useMemo).
6. Tableau de bord : carte « Assistant » compacte (titre + compteurs) vers `/assistant`.
7. Paramètres : onglet « Assistant » (`src/features/settings/assistant-tab.tsx`) : IA
   générative (état clé / activation / modèle, interrupteur `updateAiSettings` pour le
   directeur, explication : textes envoyés à Anthropic (Claude), clé serveur requise, mode
   démo non concerné) ; éditeur des modèles d'e-mails (liste, édition, ajout, suppression,
   valeurs par défaut, variables cliquables, aperçu avec `renderTemplate`) enregistré par
   `updateEmailTemplates`.
8. Tests `src/lib/assistant/assistant.test.ts` (facteurs de risque, prévision, sélection des
   brouillons, périmètre et titre du rapport, `renderTemplate`, `previousWorkingDay`).
9. `.env.example` : `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL` optionnel) ; section README
   « Assistant commercial et IA générative ».

### C — Champs personnalisés (`v5/c-custom-fields`)

1. Onglet « Champs personnalisés » (`src/features/settings/custom-fields-tab.tsx`) : champs
   par fiche (Contacts, Entreprises, Opportunités), ajout / modification (libellé, type,
   valeurs d'une liste), ordre, suppression avec confirmation (valeurs conservées et
   masquées), enregistrement par `updateCustomFields` ; lecture seule hors directeur.
2. Schémas zod avec `custom` optionnel ; commandes de création / modification : nettoyage
   selon les définitions (identifiants inconnus retirés, nombre fini, date AAAA-MM-JJ, valeur
   de liste autorisée, booléen, texte ≤ 500, vide → retiré), sans effacer les valeurs des
   champs absents de la saisie ; `createProspect` aussi.
3. Formulaires contact, entreprise, opportunité : saisie des champs, préremplie en édition.
4. Affichage sur la fiche contact, la fiche entreprise et la fiche opportunité.
5. Listes et exports : colonnes de champs personnalisés (menu « Colonnes », masquées par
   défaut) ; champs inclus dans les exports CSV.
6. Recherche Ctrl+K sur les valeurs texte / liste.
7. Import Excel : feuille « Champs personnalisés » (Fiche, Libellé, Type, Valeurs séparées
   par ;) ; sur Contacts / Entreprises clientes / Opportunités, toute colonne dont l'en-tête
   correspond à un libellé de champ est importée, avec signalement des valeurs invalides.
   Régénérer les modèles (`npm run modeles`) et mettre à jour les tests d'import.
8. Démo : 3 champs d'exemple (Entreprise « Logiciel de gestion actuel » liste [Sage 100, EBP,
   Cegid, Excel, Autre] ; Contact « Canal préféré » liste [E-mail, Téléphone, LinkedIn] ;
   Opportunité « Concurrent principal » texte) avec valeurs déterministes ; `demoInWorkspace`
   fusionne les définitions de la démo avec celles de l'espace.
9. Tests (nettoyage, commandes, import, migration).

### D — Historique des versions et restauration (`v5/d-history`)

1. Migration `supabase/migrations/20261022000007_state_history.sql` ET copie identique dans
   `supabase/fresh/` (sans `delete` ni `drop`) : table `public.app_state_history` (id
   identité, `organization_id` → organizations en cascade, `version`, `data` jsonb, `kind`
   parmi auto / manual / before_import / before_reset / before_replace / before_restore,
   `label`, `created_at`, `created_by` → auth.users), index (organisation, date décroissante),
   RLS sans politique, `revoke all` pour anon et authenticated. Mettre à jour
   `supabase/fresh/README.md`, régénérer `supabase/install.sql`
   (`npm run supabase:install-sql`), `PGBIN=/usr/lib/postgresql/16/bin npm run test:sql` doit
   passer (puis `git checkout supabase/seed.sql`), mettre à jour
   `.claude/skills/nouveau-client/SKILL.md` et `NOUVEAU_CLIENT.md`.
2. Capture (`src/lib/cloud/history.ts`, serveur) : instantané automatique de l'état
   PRÉCÉDENT au plus une fois par heure lors d'un enregistrement (sans casser les tests de
   `engine.ts`) ; instantanés explicites avant `importWorkspace`, `replaceRemote`,
   `resetRemote` et une restauration. Un échec d'instantané ne bloque jamais l'enregistrement ;
   table absente → « Historique non disponible : appliquez la migration 0007 ».
3. Rétention (fonction pure testée, `src/lib/cloud/retention.ts`) : tout sur 48 h, puis un par
   jour sur 30 jours, les instantanés nommés 90 jours, 200 lignes au plus ; purge par le
   client supabase-js (`.delete().in('id', ids)`).
4. Server Actions (`src/lib/cloud/history-actions.ts`, directeur uniquement via `admin()`) :
   `listSnapshots`, `createSnapshot(label)`, `restoreSnapshot(id)` (instantané
   before_restore puis remplacement par le même chemin que `replaceSharedState`, contrôle de
   version, entrée d'audit), `downloadSnapshot(id)`.
5. Interface `src/features/settings/history-panel.tsx` dans l'onglet « Données » : liste,
   « Créer un point de restauration », « Télécharger », « Restaurer » avec confirmation ;
   rechargement du store après restauration ; en mode démo, explication et renvoi vers
   l'export JSON.
6. Tests (rétention, logique testable sans Supabase) ; scénario e2e-cloud si possible.

### E — Fonctions avancées (`v5/e-crm-extras`)

1. Fusion des doublons : `mergeContacts` / `mergeCompanies` (rattacher interactions,
   missions, opportunités, notes, devis, liens, contacts ; compléter les champs vides sans
   écraser ; fusionner les valeurs personnalisées ; concaténer les notes ; supprimer le
   doublon ; activité + audit ; cas d'erreur) ; en mode partagé les deux fiches doivent être
   dans le périmètre (test dans `scope.test.ts`). Panneau « Doublons probables » sur
   `/contacts` et `/entreprises` (`duplicates.ts` étendu : e-mail, nom + entreprise ; pour les
   entreprises nom normalisé ou domaine du site) avec comparaison et « Fusionner ».
2. Transfert de portefeuille (directeur) : `transferPortfolio({fromEmployeeId, toEmployeeId,
   includeCompanies, includeOpenMissions, includeOpenOpportunities})`, audité ; dialogue
   « Transférer le portefeuille… » avec aperçu des volumes (Équipe ou Utilisateurs et rôles).
3. Export agenda : fichier `.ics` (RFC 5545, heures Europe/Paris, échappement, repli des
   lignes, UID stable) pour une mission / un rendez-vous, et « Exporter ma semaine (.ics) » sur
   `/calendrier`. Téléchargement uniquement. Générateur pur `src/lib/export/ics.ts` testé.
4. `/statistiques` : carte « Prévision des ventes » (`forecastByMonth`), filtres existants
   respectés, graphique Recharts dans la palette existante.
5. CSV pour Excel français et sûrs (`src/lib/export/csv.ts`) : BOM UTF-8, « ; », CRLF,
   guillemets, neutralisation des formules (=, +, -, @, tabulation, retour chariot) ; tests.
6. Tests de chaque commande et générateur.

---

## Vague 2 (après fusion de la vague 1)

### F — Cycle de vie des missions (`v5/f-missions`)

`updateMission`, `cancelMission` (motif), `deleteMission` ; responsable choisi
(`scheduleAction`, relance de `logInteraction`, formulaire « Attribuée à » ; un commercial ne
peut attribuer qu'à lui-même en mode partagé) ; annulation des missions ouvertes proposée à
l'archivage d'un contact ou à la perte d'une opportunité ; réattribution d'un contact avec
missions et opportunités ouvertes (aperçu) ; actions « Modifier / Annuler / Supprimer » sur les
missions, actions groupées sur `/missions` ; bouton « Appel » de la fiche contact lié à la
mission en attente ; Kanban des missions sans réouverture silencieuse ; « +N autres » du
calendrier ouvre la vue jour ; `updateInteraction` + « Modifier » dans la chronologie ; tests.

### G — Performances (`v5/g-performance`)

Cache `buildCrmIndex` (WeakMap partagée), regroupements linéaires, `computeCrmStats` linéaire,
pagination des longues listes de missions, tables de correspondance mémorisées pour les
activités, générateur de gros jeux de données déterministe + `npm run bench`, aucun
changement de comportement (test d'égalité des résultats).

### H — Cohérence métier et gamification (`v5/h-coherence`)

`isTouchpoint` (échanges réels) distinct des notes internes et événements système, utilisé
partout ; centre d'action : missions en attente échues, fenêtre prioritaire en jours ouvrés,
inactivité au niveau de l'entreprise, nouvelles règles (affaire sans prochaine mission, date de
signature dépassée) ; jours fériés français + fermetures (`settings.crm.closedDays`) ;
intégrité de la gamification (séries sur `createdAt`, XP gagné / qualifié seulement via
`moveOpportunity`, défis du jour, rangs, semaines ISO complètes) ; seuil d'inactivité unique ;
statistiques (trous pour les mois sans clôture, tous les commerciaux, écarts vs période
précédente, tri par urgence) ; code mort supprimé ; tests.

### I — Intelligence commerciale (`v5/i-intelligence`)

Historique structuré des étapes (`fromStage` / `toStage`, reprise dans la migration v5),
entonnoir et vélocité ; séquences de relance par étape (`settings.crm.playbooks`, missions
créées à l'entrée dans l'étape, éditeur dans Paramètres › CRM) ; motifs de perte configurables
et obligatoires + graphique ; moteur d'enseignements `src/lib/crm/insights.ts` (garde n ≥ 10)
affiché dans l'assistant et les statistiques ; score des prospects explicable
(`src/lib/crm/scoring.ts`) dans la liste des contacts et la fiche ; tests.
