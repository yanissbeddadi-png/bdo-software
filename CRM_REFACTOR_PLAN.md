# BDO Software CRM — plan de refonte

> Transformation de « BDO Software — Business Simulator » en **BDO Software CRM —
> Customer Relationship Command Center**. Le dépôt est conservé et modifié
> progressivement ; aucune réinitialisation.

## 1. Architecture actuelle (audit)

| Couche       | Emplacement                                                                                                                                                                                 | Constat                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Framework    | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict                                                                                                                             | Conservé                                    |
| UI           | Tailwind v4 (tokens CSS sombres dans `globals.css`), composants maison `components/ui` (radix-ui), Lucide, Recharts, sonner, cmdk                                                           | Conservé — identité visuelle sombre premium |
| Formulaires  | react-hook-form + zod (`EntityForm` piloté par schéma)                                                                                                                                      | Conservé                                    |
| Domaine      | `lib/domain/types.ts` (agrégat `AppData`), commandes pures `lib/domain/commands/*` (`(data, input, ctx) → {data, result}`), `execute()` → `finalize()` (alertes + gamification idempotente) | Conservé, étendu                            |
| Calculs      | `lib/calculations/*` (pipeline, finances, TVA, projets, alertes, bureaux)                                                                                                                   | Conservé ; nouveau module `lib/crm/*`       |
| Persistance  | `LocalDemoRepository` (localStorage, versionné + migrations `lib/database/migrations.ts`) ; cible Supabase (`supabase/migrations`, RLS, testée sur PostgreSQL 16)                           | Conservé ; migration v2 → v3 + SQL `000004` |
| Gamification | Réconciliation idempotente depuis l'état (`lib/gamification/engine.ts`) : clés d'XP uniques, plafonds quotidiens, succès, niveaux, rangs, missions automatiques                             | Conservé, réorienté CRM                     |
| Tests        | Vitest (94), Playwright (16), tests SQL/RLS                                                                                                                                                 | Étendus                                     |

Modules existants : Command Center, missions (gamification), finances (factures, avoirs,
TVA, trésorerie, abonnements), CRM (pipeline 8 étapes, prospects, devis, activités),
clients (fiche 11 onglets), projets, tâches, équipe, catalogue, opérations, analyses,
objectifs, progression, bureaux 3D, notifications, paramètres.

## 2. Définitions du modèle CRM

| Notion          | Entité (table)                            | Définition                                                                                                                                                                                       |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Entreprise**  | `Client` (`clients`)                      | Toute organisation suivie : prospect, client actif, ancien client, partenaire. Champ `relation`. Les factures/projets existants y restent rattachés.                                             |
| **Contact**     | `Contact` (`contacts`)                    | Personne physique, rattachée à 0 ou 1 entreprise (`clientId`). Porte le type de relation, la priorité, le responsable, la source.                                                                |
| **Prospect**    | — (vue)                                   | Contact dont la relation est `prospect`. Pas d'entité séparée : l'ancienne entité `Lead` est **migrée** (entreprise prospect + contact) puis dépréciée.                                          |
| **Opportunité** | `Opportunity` (`opportunities`)           | Affaire du pipeline : entreprise + contact principal, montant, étape commerciale. Une entreprise cliente peut avoir de nouvelles opportunités.                                                   |
| **Mission**     | `Task` (`tasks`, champ `type ≠ internal`) | Action à réaliser (appel, relance, rendez-vous, proposition…) liée à un contact / une entreprise / une opportunité, avec échéance. Les **rappels** et **relances planifiées** sont des missions. |
| **Interaction** | `SalesActivity` (`sales_activities`)      | Fait passé consigné (appel, e-mail, rendez-vous, note, changement d'étape, mission terminée). Jamais une planification.                                                                          |
| **Défi**        | `Mission` (`missions`)                    | Ancienne « mission » de gamification, renommée « défi » dans l'interface (onglet Progression).                                                                                                   |

Trois notions distinctes (§7 du cahier des charges) :

1. **Étape commerciale** — portée par l'opportunité : `new`, `qualify`, `discussion`, `proposal`, `negotiation`, `won`, `lost`.
2. **État de suivi** — calculé : à traiter, en attente de réponse, à relancer, en retard, à jour, sans prochaine action.
3. **Statut de relation** — porté par le contact et l'entreprise : prospect, client actif, ancien client, partenaire, archivé.

Prochaine action = mission ouverte la plus proche du contact (jamais un texte libre).
Dernière interaction = interaction consignée la plus récente (distincte de la prochaine action).

## 3. Composants

**Conservés tels quels** : design system (`components/ui`, tokens), `DataTable`, `FilterBar`,
`EntityForm`, `FormDialog`, `KanbanBoard`, `MonthCalendar`, `MetricCard`, graphiques,
`useConfirm`, recherche Ctrl+K (cmdk), notifications, paramètres, moteur de gamification,
persistance et migrations, bureaux 3D (accessibles depuis Progression).

**Modifiés** : navigation (sidebar + compteurs), Command Center → tableau de bord commercial,
pipeline (7 étapes, cartes riches, filtres, vues enregistrées), fiche client → fiche
entreprise, page Missions (missions CRM ; défis déplacés dans Progression), recherche
globale (contacts, entreprises, opportunités, missions, interactions, notes), progression
(titres, succès CRM, séries d'activité), paramètres (seuils CRM, jours ouvrés, barème XP).

**Nouveaux** : `lib/crm/*` (vues contact/affaire, suivi, centre d'action, alertes CRM,
statistiques, séries), pages Contacts, fiche contact 360°, Entreprises, Calendrier,
Activités, Statistiques ; formulaires prospect / contact / mission / interaction /
relance ; dialogues « terminer une mission » et « enregistrer un appel ».

**Retirés de la navigation (routes conservées, accessibles depuis Paramètres › Modules
historiques)** : Finances (factures, avoirs, TVA, trésorerie, abonnements), Projets,
Tâches internes, Équipe, Catalogue, Opérations, Analyses financières, Objectifs (objectif
en cours affiché sur la vue d'ensemble et la progression), Bureaux 3D (lien depuis Progression). Les devis restent accessibles
comme « Propositions » depuis le pipeline et les fiches.

**Supprimés (remplacés, pas de logique concurrente)** : page Prospects et commandes
`Lead` (remplacées par Contacts), ancien pipeline 8 étapes, missions de gamification
non CRM (trésorerie, TVA, budget, projets, MRR) dans le générateur de défis.

## 4. Migrations de données

**Local (v2 → v3, `lib/database/migrations.ts`)**, sans perte :

- `Client` : `relation` (`customer` si statut actif/inactif, `former` si perdu), `size`, `country`, `ownerId`, `source`.
- `Lead` → entreprise `relation: prospect` (ou rattachement à l'entreprise convertie) + contact ; `opportunities.leadId` / `salesActivities.leadId` / contacts → `clientId` ; `leads` vidé.
- `Contact` : `relation`, `ownerId`, `source`, `priority`, `links`, `archivedAt`.
- `Opportunity` : étapes `contacted|qualification → qualify`, `meeting → discussion` ; `priority`, `qualifiedAt`, `archivedAt`.
- `Task` : `type` (`internal` pour les tâches existantes), `contactId`, `opportunityId`, `dueTime`, `result`.
- `SalesActivity` : `direction`, `contactId`, `outcome`, `taskId` ; les activités **planifiées** (`done=false`) deviennent des missions.
- `Note` : `contactId`, `opportunityId`. Paramètres CRM et barème XP CRM ajoutés.
- Défis ouverts non CRM annulés (historique conservé).

**Supabase (`000004_crm.sql`)** : colonnes ci-dessus, contrainte d'étapes mise à jour avec
reprise des valeurs, conversion SQL des `leads` en entreprises + contacts, index de
suivi, aucune table supprimée.

## 5. Ordre d'implémentation

1. Audit et plan (ce document).
2. Modèle v3, migration locale, seed CRM, commandes métier.
3. Couche `lib/crm` (vues, suivi, centre d'action, statistiques, automatisations).
4. Navigation, redirections, pipeline Kanban.
5. Contacts, entreprises, fiche contact 360° et timeline.
6. Missions, relances, calendrier, journal des activités.
7. Tableau de bord commercial.
8. Gamification CRM (barème, titres, succès, séries, défis).
9. Statistiques, recherche globale, automatisations.
10. Migration SQL, tests, documentation.

## 6. Avancement

| Étape                                        | État | Vérification                                                                                       |
| -------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| 1. Audit et plan                             | Fait | Ce document                                                                                        |
| 2. Navigation et routes                      | Fait | 10 entrées, compteurs calculés, redirections `next.config.ts`, modules historiques dans Paramètres |
| 3. Pipeline Kanban                           | Fait | 7 étapes, glisser-déposer + sélecteur, liste, 9 vues enregistrées, filtres, motif de perte         |
| 4. Contacts et entreprises                   | Fait | Tableau, filtres, tri, pagination, sélection multiple, actions groupées, CSV, doublons signalés    |
| 5. Fiche contact 360°                        | Fait | Résumé, 7 onglets, timeline, liens documentaires, archivage                                        |
| 6. Missions, relances, calendrier, activités | Fait | Vues, Kanban, clôture avec résultat et suite, jour/semaine/mois/liste, journal filtrable           |
| 7. Vue d'ensemble                            | Fait | Indicateurs cliquables, centre d'action expliqué, pipeline compact, activité, progression          |
| 8. Gamification CRM                          | Fait | Barème, titres, 19 succès, séries, défis, rangs                                                    |
| 9. Statistiques, recherche, automatisations  | Fait | KPI documentés, graphiques, Ctrl+K groupé, alertes idempotentes                                    |
| 10. Tests, migrations, docs                  | Fait | Vitest 113, Playwright 23, SQL (dont reprise legacy), README, DATA_MODEL, GAMIFICATION             |

Points restants : voir « Bilan et suite » du README (adaptateur Supabase, intégrations
réelles, stockage de fichiers, fusion assistée de doublons, multi-utilisateurs).
