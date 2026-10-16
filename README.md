# BDO Software — Business Simulator

ERP gamifié permettant de piloter **BDO Software**, une entreprise **fictive** de services
numériques (SaaS, développement, maintenance, conseil), depuis un centre de commandement :
finances, CRM, clients, projets, tâches, équipe, catalogue, opérations, analyses, objectifs —
avec une couche de progression (XP, niveaux, missions, succès, rangs) liée à des
événements métier réels.

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

| Commande | Rôle |
| --- | --- |
| `npm run dev` / `build` / `start` | Développement, build de production, serveur de production |
| `npm run lint` | ESLint (config Next.js + TypeScript) |
| `npm run typecheck` | Contrôle TypeScript strict |
| `npm test` | Tests unitaires et d'intégration (Vitest) |
| `npm run test:e2e` | Build puis parcours Playwright (desktop + mobile) |
| `npm run test:sql` | Valide migrations Supabase, seed SQL et politiques RLS sur un PostgreSQL local (`PGBIN` = dossier des binaires) |
| `npm run seed:sql -- 2026-10-15` | Génère `supabase/seed.sql` depuis le même générateur que le mode démo |

## Variables d'environnement

Toutes optionnelles — voir `.env.example`.

| Variable | Effet |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Détectées et affichées dans Paramètres › Données. **La synchronisation applicative n'est pas encore branchée** : l'application reste en stockage local et l'indique (voir « Supabase » ci-dessous). |
| `PLAYWRIGHT_CHROMIUM_PATH` | Chromium à utiliser pour les tests e2e (sinon celui de Playwright). |

Aucun secret n'est requis ni présent dans le dépôt ; aucune clé `service_role` ne doit être exposée au navigateur.

## Architecture

```
src/
  app/                      Routes (App Router) — pages minces qui rendent les features
  features/<domaine>/       Écrans métier (finance, crm, clients, projects, tasks, team,
                            catalog, operations, analytics, goals, missions, progression,
                            notifications, settings, dashboard)
  components/
    ui/                     Primitives « shadcn/ui » (Radix) : bouton, dialogue, onglets…
    layout/                 Shell, sidebar, barre supérieure, recherche Ctrl+K
    shared/ tables/ forms/  Cartes KPI, DataTable, filtres, formulaires Zod, calendrier, kanban
    charts/ gamification/   Graphiques Recharts, cartes de missions/succès, toasts XP
  lib/
    domain/                 Types, commandes métier (validation, permissions, audit), runtime
    calculations/           Calculs centralisés : TVA, factures, finance, MRR, pipeline,
                            projets, objectifs, trésorerie prévisionnelle, alertes
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

* **Une seule implémentation de la logique métier.** Les commandes (`src/lib/domain/commands`)
  sont des fonctions pures `(état, entrée, contexte) → nouvel état`. Elles revalident
  l'entrée avec les **mêmes schémas Zod** que les formulaires, vérifient les **permissions**
  du rôle, journalisent les opérations sensibles et sont exécutées « tout ou rien ».
* **Calculs centralisés et testés** (`src/lib/calculations`) : montants en centimes,
  TVA par taux, statuts de facture calculés, distinction CA facturé / encaissé / récurrent /
  pipeline / prévisions / dépenses engagées / payées / trésorerie (voir `DATA_MODEL.md`).
* **Gamification par réconciliation idempotente** après chaque commande (voir `GAMIFICATION.md`).
* **Mode démo isolé** derrière l'interface `DataRepository` ; rendu métier côté client.
* **Design system** : tokens CSS centralisés (`src/app/globals.css`), palette de graphiques
  validée (daltonisme, contraste), `prefers-reduced-motion` respecté.

## Routes

| Route | Contenu |
| --- | --- |
| `/` | Command Center : progression, 10 KPI avec comparaison et définition, alertes, missions du jour, 7 graphiques, activité, actions rapides |
| `/missions` | Centre de missions (auto + personnalisées, filtres, historique) |
| `/bureaux` | Bureaux 3D (three.js) : zones par service avec indicateurs et alertes, collaborateurs animés selon leurs tâches et rendez-vous, horloge en direct / ×60 / heure choisie, zones débloquées par le rang |
| `/finances` | Synthèse financière, échéancier des créances |
| `/finances/factures`, `/finances/factures/[id]` | Factures : CRUD, émission, duplication, paiements, avoirs, remboursements, relances, impression |
| `/finances/avoirs`, `/finances/avoirs/[id]` | Avoirs émis, trop-perçus à rembourser, avoir imprimable |
| `/finances/tva` | Périodes de TVA (collectée, déductible, crédit), déclaration, paiement, estimation du mois, export |
| `/finances/depenses` | Dépenses : CRUD, catégories, paiement, export |
| `/finances/tresorerie` | Réalisé + scénarios prudent / central / optimiste (TVA à reverser incluse), hypothèses, revue hebdo |
| `/finances/abonnements` | MRR / ARR, contrats, facturation idempotente des échéances |
| `/crm` | Pipeline Kanban (glisser-déposer + sélecteur accessible), fiche opportunité |
| `/crm/prospects`, `/crm/devis`, `/crm/devis/[id]`, `/crm/activites` | Prospection & conversion, devis imprimables → facture, activités |
| `/clients`, `/clients/[id]` | Base clients, fiche à 11 onglets |
| `/projets`, `/projets/[id]` | Liste / Kanban / calendrier, jalons, rentabilité, charge |
| `/taches` | Liste / Kanban / calendrier / équipe ; aujourd'hui, en retard, vue personnelle ; temps et commentaires |
| `/equipe` | Collaborateurs, charge, compétences (ludiques) |
| `/catalogue` | Produits et services |
| `/operations` | Calendrier global, échéances, actions en attente, risques, notes |
| `/analyses` | Rapports financiers, commerciaux, projets ; filtres réels ; CSV ; impression PDF |
| `/objectifs` | Objectifs / OKR (mesures automatiques ou manuelles) |
| `/progression` | Niveau, rang, siège virtuel SVG, succès, récompenses, rangs, journal |
| `/notifications` | Centre de notifications et préférences |
| `/parametres` | Entreprise & TVA, préférences (date simulée), gamification & règles, données, rôles, audit |

Recherche globale : **Ctrl/Cmd + K**. Création rapide : bouton **+ Créer**.

## Mode démonstration — limites

* Données stockées **en clair dans le localStorage** du navigateur, sans authentification :
  toute personne utilisant ce navigateur y accède ; elles peuvent être effacées.
* Les **rôles** se changent librement (Paramètres › Utilisateurs et rôles) pour démontrer
  les permissions ; ils sont appliqués par la couche de commandes, **pas par un serveur**.
* **Aucun paiement réel, aucune connexion bancaire, aucun envoi d'e-mail** : une
  « relance » est consignée dans le CRM, un paiement est une saisie de gestion.
* Les documents clients sont des **références** (nom, type), aucun fichier n'est stocké.
* Les déclarations de TVA sont des **saisies de gestion** : aucune télédéclaration ni
  télépaiement n'est effectué (régime mensuel sur les encaissements uniquement).

## Supabase

Le dossier `supabase/` contient la cible de production, **validée sur PostgreSQL 16**
(`npm run test:sql`) :

* schéma relationnel complet (organisations, membres, rôles/permissions, toutes les
  entités métier, gamification), contraintes, index, triggers `updated_at` ;
* vues `invoice_totals` / `credit_note_totals` / `invoice_balances` (mêmes règles de TVA,
  d'avoir et de statut que l'app) ;
* avoirs immuables, remboursements, déclarations de TVA figées et **clôture des périodes
  déclarées** par triggers (paiements, remboursements, dépenses payées) ;
* **RLS** : lecture réservée aux membres de l'organisation, écriture selon la matrice
  `role_permissions` ; tables de gamification et d'audit en lecture seule pour les clients ;
* `record_payment()` / `record_refund()` : paiement et remboursement **transactionnels**
  (verrou, contrôle du solde ou du trop-perçu, permission) ;
  `app.award_xp()` : attribution d'XP idempotente côté serveur.

Mise en place : créer un projet Supabase, appliquer les migrations (`supabase db push` ou
l'éditeur SQL), puis `supabase/seed.sql`, et rattacher les utilisateurs à `org_demo` via
`organization_members`.

**Non réalisé dans cette version** : l'adaptateur applicatif `SupabaseRepository`
(chargement/écriture via `@supabase/supabase-js`, écran de connexion, exécution des
commandes en Server Actions). Tant qu'il n'est pas branché, l'application **n'utilise pas**
Supabase même si les variables sont définies, et le signale dans Paramètres › Données.

## Tests

* **Vitest** (94 tests) : TVA et arrondis, statuts et soldes de factures, paiements
  partiels/intégraux/trop-perçus, avoirs partiels/totaux et remboursements, déclarations de
  TVA (calcul, ordre, clôture, crédit, paiement, trésorerie, prévision, alerte, mission),
  reprise d'XP, migration v1 → v2, bureaux virtuels (postes, emploi du temps, fuseau, zones), MRR/ARR, pipeline pondéré, encaissements/décaissements,
  trésorerie et prévisions, niveaux (y compris multi-niveaux), XP idempotente, plafonds
  anti-abus, succès, missions automatiques, objectifs, réinitialisation, commandes métier
  (devis → facture, doublons, dépendances de tâches, récurrence, permissions, audit), seed.
* **Playwright** (16 parcours) : navigation, Command Center, recherche globale (avec et
  sans résultat), création de client + erreurs de validation, facture + paiements,
  avoir total + remboursement, déclaration et paiement de TVA, bureaux 3D (zones, collaborateurs, zone verrouillée, heure simulée),
  opportunité + déplacement, devis → facture, tâche + XP, objectif, filtres, permissions,
  navigation mobile sans débordement horizontal.
* **SQL** : migrations + seed + tests RLS/transactions (dont clôture de période de TVA,
  déclaration figée, droits sur avoirs et TVA) sur PostgreSQL local.

## Documentation

* `PROJECT_PLAN.md` — décisions techniques, modules, phases
* `DATA_MODEL.md` — modèle de données, définitions des indicateurs, hypothèses
* `GAMIFICATION.md` — règles de progression, barème, anti-abus, missions, succès, rangs

## Bilan et suite

**Réalisé** : l'ensemble des modules listés ci-dessus en mode démonstration, avec CRUD,
calculs centralisés, gamification complète, analyses filtrables, exports CSV / JSON,
impression PDF, recherche globale, notifications dédupliquées, responsive et accessibilité
clavier (lien d'évitement, focus visibles, alternative clavier au glisser-déposer).
Phase 7 : avoirs, remboursements, déclarations et paiements de TVA intégrés à la
trésorerie, aux prévisions, aux alertes et à la gamification.

**Reste à développer** :
1. Adaptateur `SupabaseRepository` + authentification + Server Actions (le schéma et les RLS sont prêts).
2. Envoi réel d'e-mails (relances, devis, avoirs) via un service configuré.
3. Téléversement de documents (Supabase Storage).
4. Bureaux : vrai direct multi-utilisateurs (Supabase Realtime, présence des personnes connectées).
5. Rapprochement bancaire (import de relevés CSV) avec les paiements, remboursements et TVA.
6. Internationalisation et thème clair (l'interface est en français, thème sombre).
