# BDO Software CRM — Customer Relationship Command Center

CRM gamifié pour suivre les prospects et clients de **BDO Software**, une entreprise
**fictive** de services numériques : pipeline commercial en 7 étapes, contacts et
entreprises, fiche contact 360°, missions et relances, calendrier, journal des
interactions, statistiques — avec une couche de progression (XP, niveaux, séries, défis,
succès, rangs) qui ne récompense que des actions commerciales réelles.

Les modules de l'ancienne version « Business Simulator » (finances, projets, tâches
internes, équipe, catalogue, opérations, analyses, objectifs, bureaux 3D) sont
**conservés avec leurs données** mais retirés de la navigation principale : ils restent
accessibles depuis **Paramètres › CRM › Modules historiques**. Le plan de refonte est
décrit dans `CRM_REFACTOR_PLAN.md`.

> ⚠️ **Données de démonstration.** Toutes les entreprises, personnes, montants et
> coordonnées sont inventés (e-mails en `.example`). Le module financier est un outil de
> gestion interne, **pas un logiciel comptable certifié** ; aucune conformité fiscale n'est
> garantie. L'XP est une unité ludique sans valeur monétaire.

## Démarrage rapide

Prérequis : Node.js ≥ 20 (testé avec Node 22) et npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production :

```bash
npm run build
npm run start        # http://localhost:3000
```

Au premier chargement, un jeu de démonstration cohérent est généré **dans le navigateur**
(localStorage) avec des dates relatives au jour courant. Paramètres › Données permet de
l'exporter (JSON / CSV), de l'importer ou de le réinitialiser.

## Scripts

| Commande                          | Rôle                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Développement, build de production, serveur de production                                                       |
| `npm run lint`                    | ESLint (config Next.js + TypeScript)                                                                            |
| `npm run typecheck`               | Contrôle TypeScript strict                                                                                      |
| `npm test`                        | Tests unitaires et d'intégration (Vitest)                                                                       |
| `npm run test:e2e`                | Build puis parcours Playwright (desktop + mobile)                                                               |
| `npm run test:sql`                | Valide migrations Supabase, seed SQL et politiques RLS sur un PostgreSQL local (`PGBIN` = dossier des binaires) |
| `npm run seed:sql -- 2026-10-15`  | Génère `supabase/seed.sql` depuis le même générateur que le mode démo                                           |

## Variables d'environnement

Toutes optionnelles — voir `.env.example`.

| Variable                                                    | Effet                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Détectées et affichées dans Paramètres › Données. **La synchronisation applicative n'est pas encore branchée** : l'application reste en stockage local et l'indique (voir « Supabase » ci-dessous). |
| `PLAYWRIGHT_CHROMIUM_PATH`                                  | Chromium à utiliser pour les tests e2e (sinon celui de Playwright).                                                                                                                                 |

Aucun secret n'est requis ni présent dans le dépôt ; aucune clé `service_role` ne doit être exposée au navigateur.

## Architecture

```
src/
  app/                      Routes (App Router) — pages minces qui rendent les features
  features/<domaine>/       Écrans métier : crm (pipeline, contacts, entreprises, fiche 360°,
                            missions, calendrier, activités, statistiques), dashboard,
                            progression (dont défis), settings, notifications, et modules
                            historiques (finance, projects, tasks, team, catalog…)
  components/
    ui/                     Primitives « shadcn/ui » (Radix) : bouton, dialogue, onglets…
    layout/                 Shell, sidebar, barre supérieure, recherche Ctrl+K
    crm/                    Badges de suivi, avatars, actions rapides, ligne de mission, timeline
    shared/ tables/ forms/  Cartes KPI, DataTable (sélection multiple), filtres, formulaires Zod
                            (dont formulaires CRM), calendrier, kanban
    charts/ gamification/   Graphiques Recharts, cartes de missions/succès, toasts XP
  lib/
    domain/                 Types, commandes métier (validation, permissions, audit), runtime
    crm/                    Vues calculées (état de suivi, prochaine action, dernière
                            interaction), centre d'action, automatisations, séries,
                            statistiques, doublons, vocabulaire
    calculations/           Calculs centralisés : pipeline, objectifs, alertes, TVA,
                            factures, finance, MRR, trésorerie prévisionnelle
    gamification/           Moteur idempotent, niveaux, rangs, succès, missions, récompenses
    database/               Repository (mode démo localStorage), seed déterministe
    store/                  Store zustand + hooks (useData, useCommand, usePeriod…)
    permissions/ validation/ formatters/ export/
supabase/
  migrations/               Schéma PostgreSQL, contraintes, index, vues, RLS, fonctions
  seed.sql                  Données de démo (générées)
  tests/                    Bootstrap auth simulé + tests RLS
e2e/                        Parcours Playwright
```

### Décisions principales

- **Une seule implémentation de la logique métier.** Les commandes (`src/lib/domain/commands`)
  sont des fonctions pures `(état, entrée, contexte) → nouvel état`. Elles revalident
  l'entrée avec les **mêmes schémas Zod** que les formulaires, vérifient les **permissions**
  du rôle, journalisent les opérations sensibles et sont exécutées « tout ou rien ».
- **Calculs centralisés et testés** (`src/lib/calculations`) : montants en centimes,
  TVA par taux, statuts de facture calculés, distinction CA facturé / encaissé / récurrent /
  pipeline / prévisions / dépenses engagées / payées / trésorerie (voir `DATA_MODEL.md`).
- **Gamification par réconciliation idempotente** après chaque commande (voir `GAMIFICATION.md`).
- **Mode démo isolé** derrière l'interface `DataRepository` ; rendu métier côté client.
- **Design system** : tokens CSS centralisés (`src/app/globals.css`), palette de graphiques
  validée (daltonisme, contraste), `prefers-reduced-motion` respecté.

## Routes

| Route                               | Contenu                                                                                                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                 | Vue d'ensemble : indicateurs cliquables (relances en retard, missions du jour, nouveaux prospects, rendez-vous, propositions, pipeline, conversions), centre d'action du jour expliqué (« Pourquoi : … ») avec actions rapides, pipeline compact, activité récente, progression  |
| `/pipeline`                         | Kanban 7 étapes (glisser-déposer + sélecteur accessible), vue liste, 9 vues enregistrées, recherche et filtres (étape, responsable, source, priorité, suivi, création, dernière interaction, échéance, missions en retard, sans prochaine action, inactivité), fiche opportunité |
| `/contacts`, `/contacts/[id]`       | Base de contacts (relation, étape, suivi, relance…), recherche, tri, filtres, pagination, sélection multiple et actions groupées sûres, export CSV ; fiche 360° (résumé de la relation, onglets Vue d'ensemble, Activités, Missions, Opportunités, Notes, Documents, Historique) |
| `/entreprises`, `/entreprises/[id]` | Entreprises (prospects, clients, anciens clients, partenaires) ; fiche avec contacts, opportunités, missions, historique, propositions, notes                                                                                                                                    |
| `/missions`                         | Missions CRM : aujourd'hui, en retard, à venir, semaine, terminées, annulées ; regroupement par contact / responsable / type / priorité ; liste ou Kanban ; clôture avec résultat, note et suite                                                                                 |
| `/calendrier`                       | Jour, semaine, mois, liste ; contexte de l'événement, clôture, replanification, relance (rappels internes uniquement)                                                                                                                                                            |
| `/activites`                        | Journal des interactions (appels entrants/sortants, e-mails envoyés/reçus, rendez-vous, messages, notes, relances, changements d'étape, missions terminées), filtres, export CSV                                                                                                 |
| `/statistiques`                     | Indicateurs CRM documentés (définition au survol), graphiques hebdomadaires et mensuels, performance par source et par responsable, filtres réels                                                                                                                                |
| `/progression`                      | Niveau, rang, série de suivi, défis, succès, récompenses, journal ; lien vers les bureaux 3D                                                                                                                                                                                     |
| `/parametres`                       | Règles CRM (seuils, jours ouvrés, plafond d'XP des appels), état réel des intégrations, modules historiques, entreprise, préférences, gamification, données, rôles, audit                                                                                                        |
| `/notifications`                    | Notifications dédupliquées (automatisations CRM) et préférences                                                                                                                                                                                                                  |

Anciennes routes redirigées : `/crm` → `/pipeline`, `/crm/prospects` → `/contacts`,
`/crm/activites` → `/activites`, `/clients[/:id]` → `/entreprises[/:id]`.

Modules historiques (hors navigation) : `/finances/*`, `/crm/devis` (propositions),
`/projets`, `/taches` (tâches internes), `/equipe`, `/catalogue`, `/operations`,
`/analyses`, `/objectifs`, `/bureaux`.

Recherche globale : **Ctrl/Cmd + K** (contacts, entreprises, opportunités, missions,
activités, notes, puis modules historiques). Création rapide : bouton **+ Créer**.

### Notions du CRM

- **Étape commerciale** (opportunité) : Nouveaux prospects, À qualifier, En discussion,
  Proposition envoyée, Négociation, Gagné, Perdu / archivé. Jamais modifiée
  automatiquement par un appel ou une mission.
- **État de suivi** (calculé) : En retard > À relancer (aujourd'hui) > En attente de
  réponse > À traiter (nouveau prospect) > Sans prochaine action > Suivi à jour.
- **Statut de relation** (contact / entreprise) : prospect, client actif, ancien client,
  partenaire, archivé.
- **Mission** : action datée à réaliser (appel, relance, rendez-vous…). **Interaction** :
  fait passé consigné. La prochaine action est toujours une mission ouverte ; la dernière
  interaction est la plus récente interaction réelle.

## Mode démonstration — limites

- Données stockées **en clair dans le localStorage** du navigateur, sans authentification :
  toute personne utilisant ce navigateur y accède ; elles peuvent être effacées.
- Les **rôles** se changent librement (Paramètres › Utilisateurs et rôles) pour démontrer
  les permissions ; ils sont appliqués par la couche de commandes, **pas par un serveur**.
- **Aucun paiement réel, aucune connexion bancaire, aucun envoi d'e-mail, aucun agenda
  externe** : une interaction est consignée après coup, un rappel reste interne à
  l'application, un paiement est une saisie de gestion. Les liens `mailto:` / `tel:`
  ouvrent simplement la messagerie ou le téléphone de l'utilisateur.
- Les documents sont des **références** (nom et lien saisis), aucun fichier n'est stocké.
- Les déclarations de TVA sont des **saisies de gestion** : aucune télédéclaration ni
  télépaiement n'est effectué (régime mensuel sur les encaissements uniquement).

## Supabase

Le dossier `supabase/` contient la cible de production, **validée sur PostgreSQL 16**
(`npm run test:sql`) :

- schéma relationnel complet (organisations, membres, rôles/permissions, toutes les
  entités métier, gamification), contraintes, index, triggers `updated_at` ;
- vues `invoice_totals` / `credit_note_totals` / `invoice_balances` (mêmes règles de TVA,
  d'avoir et de statut que l'app) ;
- avoirs immuables, remboursements, déclarations de TVA figées et **clôture des périodes
  déclarées** par triggers (paiements, remboursements, dépenses payées) ;
- **RLS** : lecture réservée aux membres de l'organisation, écriture selon la matrice
  `role_permissions` ; tables de gamification et d'audit en lecture seule pour les clients ;
- `record_payment()` / `record_refund()` : paiement et remboursement **transactionnels**
  (verrou, contrôle du solde ou du trop-perçu, permission) ;
  `app.award_xp()` : attribution d'XP idempotente côté serveur.

Mise en place : créer un projet Supabase, appliquer les migrations (`supabase db push` ou
l'éditeur SQL), puis `supabase/seed.sql`, et rattacher les utilisateurs à `org_demo` via
`organization_members`.

## Mode multi-utilisateur (comptes et mots de passe)

Dès que Supabase est configuré, l'application passe en **mode multi-utilisateur** :

- chaque collaborateur se connecte avec **son e-mail et son mot de passe** (`/connexion`) ;
  sans session, toutes les pages redirigent vers la connexion ;
- **chaque collaborateur ne voit que son portefeuille** : les contacts dont il est
  responsable, leurs entreprises et opportunités, les missions qui lui sont attribuées, les
  interactions, notes, propositions, notifications et XP liées. Le filtrage est fait **par
  le serveur** : les données des autres ne sont jamais envoyées à son navigateur (un lien
  direct vers le contact d'un collègue affiche « Contact introuvable ») ;
- un collaborateur ne modifie que son portefeuille : modifier, supprimer ou réaffecter
  l'élément d'un collègue est refusé par le serveur, et ce qu'il crée lui est attribué ;
- le **directeur commercial** (rôle `dirigeant`) est l'**administrateur** : il voit et
  modifie toutes les données de l'équipe, réaffecte les portefeuilles, accède aux modules
  historiques (finances, équipe, projets, objectifs…, refusés aux autres comptes) et gère
  les comptes ;
- les données sont rafraîchies automatiquement (toutes les 20 s et au retour sur
  l'onglet) ; l'indicateur « Enregistré » de la barre supérieure confirme chaque
  enregistrement ;
- Paramètres › Utilisateurs et rôles (directeur commercial) : créer un compte (mot de passe
  temporaire affiché une seule fois), changer le rôle, réinitialiser un mot de passe,
  désactiver un compte, créer d'un clic les **comptes de test** de tous les collaborateurs ;
  menu du profil : changer son mot de passe, se déconnecter.

**Fonctionnement** (`src/lib/cloud/`) : l'état de l'organisation est un document versionné
(`app_state`). Une action s'exécute immédiatement dans le navigateur, puis la même
commande métier est **rejouée par une Server Action** qui authentifie l'utilisateur (cookies
Supabase), lit son rôle en base, réutilise la même graine d'identifiants, **vérifie que
l'action ne touche que le portefeuille de l'utilisateur** (`scope.ts`) et enregistre avec
un contrôle de concurrence optimiste (rejeu automatique en cas d'écriture simultanée). Le
serveur ne renvoie à chaque utilisateur que la **projection** de ses données. En cas de
refus, l'écran revient à l'état du serveur avec un message. La lecture directe de
`app_state` est fermée aux navigateurs (seules les Server Actions y accèdent, avec la clé
de service qui ne quitte jamais le serveur).

### Mise en place (une fois, ~15 minutes)

1. **Supabase** — créer un projet sur [supabase.com](https://supabase.com) (région UE).
   Puis _SQL Editor › New query_ : coller le contenu de `supabase/install.sql` et cliquer
   _Run_. Recommandé : _Authentication › Sign In / Providers_ → désactiver « Allow new users
   to sign up » (les comptes sont créés par l'administrateur).
2. **Clés** — _Project Settings › API_ : noter l'URL du projet, la clé publique (_anon_ ou
   _publishable_) et la clé secrète (_service_role_ ou _secret_).
3. **Vercel** — _Project › Settings › Environment Variables_, ajouter :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (secrète) et `BDO_SETUP_CODE` (un code que vous inventez). Puis _Deployments › Redeploy_.
   Ne collez jamais ces clés dans une conversation ni dans le dépôt.
4. **Installation** — ouvrir `https://<votre-app>/installation`, saisir le code, votre nom,
   votre e-mail et un mot de passe : l'espace est créé et vous êtes connecté en
   **directeur commercial** (administrateur). Les données de démonstration sont réparties
   entre les autres collaborateurs, entreprise par entreprise.
5. **Comptes de test** — _Paramètres › Utilisateurs et rôles › Créer les comptes de test_ :
   un compte « Commercial » par collaborateur de démonstration, chacun avec son propre
   portefeuille et son mot de passe temporaire, à copier immédiatement.

Sans ces variables, l'application reste en **mode démonstration** (données dans le
navigateur, sans connexion).

**Limites de la version de test** : pas d'e-mail de réinitialisation (le directeur
commercial génère un nouveau mot de passe), niveau et succès communs à l'équipe (l'XP
affichée à un collaborateur ne porte que sur son portefeuille), détection de doublons
faite sur toute la base (un collaborateur peut être averti qu'un contact existe déjà chez
un collègue), données de démonstration fictives — ne pas y saisir de vraies données
clients.

## Tests

- **Vitest** (113 tests) dont 20 tests CRM (`src/lib/crm/crm.test.ts`) : création de
  prospect (entreprise + contact + opportunité + mission), doublons signalés sans fusion,
  gain → statut client, interaction sans effet sur l'étape, date future refusée, mission
  terminée par une interaction, clôture de mission (résultat, note, suite), états de suivi,
  centre d'action, alertes idempotentes, séries (jours ouvrés), semaines rigoureuses, taux
  de conversion, plafonds anti-abus (appels, missions non rattachées, conversion unique,
  fiche complète), actions groupées, migration v2 → v3 idempotente. Plus : TVA, factures,
  paiements, avoirs, trésorerie, bureaux virtuels, niveaux, XP idempotente, succès, défis,
  objectifs, commandes métier, seed (références valides, états variés).
- **Playwright** (23 parcours, bureau + mobile) : navigation CRM et redirections, vue
  d'ensemble (centre d'action expliqué, compteurs vers vues filtrées), recherche globale,
  nouveau contact avec avertissement de doublon, fiche 360° (appel consigné + suite),
  clôture de mission, changement d'étape et motif de perte, calendrier (contexte +
  clôture), statistiques filtrées, entreprise + validation, modules historiques (factures,
  avoirs, TVA, devis, tâche, objectif, permissions), bureaux 3D, absence de débordement
  horizontal sur 9 pages CRM en mobile.
- **Mode multi-utilisateur** : 14 tests Vitest (`src/lib/cloud/*.test.ts` : rejeu serveur,
  rôles, concurrence, portefeuilles disjoints, refus de modifier ou réaffecter l'élément
  d'un collègue, modules réservés) et 4 parcours Playwright contre un Supabase local
  (`npm run test:e2e:cloud`) : installation, comptes de test, deux commerciaux aux
  portefeuilles séparés et directeur commercial qui voit tout, désactivation.
- **SQL** (`npm run test:sql`) : migrations + seed + RLS, et **reprise de données legacy**
  par la migration CRM (prospects → entreprises/contacts, étapes, activités planifiées →
  missions) sur PostgreSQL 16 local.

## Documentation

- `PROJECT_PLAN.md` — décisions techniques, modules, phases
- `DATA_MODEL.md` — modèle de données, définitions des indicateurs, hypothèses
- `GAMIFICATION.md` — règles de progression, barème, anti-abus, séries, défis, succès, rangs
- `CRM_REFACTOR_PLAN.md` — audit, définitions CRM, composants, migrations, avancement

## Bilan et suite

**Réalisé** : refonte CRM complète en mode démonstration — navigation à 10 entrées avec
compteurs calculés, pipeline Kanban 7 étapes, contacts et entreprises, fiche 360°,
missions et relances, calendrier, journal des activités, vue d'ensemble avec centre
d'action explicable, statistiques documentées, recherche globale, automatisations
locales idempotentes, gamification CRM (barème configurable, titres, 19 succès, séries
sur jours ouvrés, défis), migration locale v2 → v3 et migration Supabase `000004_crm.sql`.

**Reste à développer** :

1. Écriture relationnelle table par table (le mode multi-utilisateur stocke aujourd'hui un document versionné par organisation) et progression XP individuelle.
2. Intégrations réelles (messagerie, agenda, téléphonie) : les points d'extension sont
   documentés dans `src/lib/crm/automations.ts` ; rien n'est simulé tant qu'elles ne sont pas configurées.
3. Téléversement de documents (Supabase Storage) — aujourd'hui des liens.
4. Fusion assistée de doublons (aujourd'hui : avertissement et confirmation explicite).
5. Multi-utilisateurs réel (attribution, vues « Mes prospects » par utilisateur connecté).
6. Internationalisation (interface en français) et, si besoin, variante sombre de la charte.
7. Remplacer le logotype typographique par le fichier officiel du logo BDO fourni par la
   communication du groupe, dans le respect de ses règles d'usage.
