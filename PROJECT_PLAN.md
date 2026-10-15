# BDO Software — Business Simulator · Plan de projet

> ERP gamifié permettant de piloter une entreprise fictive de services numériques
> (BDO Software) depuis un « centre de commandement ». Toutes les données livrées
> sont **fictives** et servent à la démonstration.

## 1. État initial du dépôt

Le dépôt était vide. Le projet a été initialisé avec `create-next-app` (Next.js 16,
App Router, TypeScript strict, Tailwind CSS v4, ESLint).

## 2. Décisions techniques

| Sujet | Décision | Justification |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 | Imposé par le cahier des charges. |
| Langage | TypeScript `strict` | Fiabilité des calculs métier. |
| Styles | Tailwind CSS v4 + tokens CSS (`src/app/globals.css`) | Palette centralisée et ajustable. |
| Composants | Composants « shadcn/ui » écrits dans `src/components/ui` sur les primitives `radix-ui` | Même approche que shadcn (code copié dans le dépôt) sans dépendre du registre distant. |
| Icônes | `lucide-react` | Imposé. |
| Graphiques | `recharts` | Imposé. |
| Formulaires | `react-hook-form` + `zod` | Validation partagée client / couche de commandes. |
| Dates | `date-fns` (+ locale `fr`) | Typée, modulaire. |
| État / persistance démo | `zustand` + `persist` (localStorage) | Jeu de données < 1 Mo, simple et fiable. Isolé derrière un « repository ». |
| Notifications UI | `sonner` | Toasts accessibles. |
| Recherche globale | `cmdk` | Palette de commandes clavier (Ctrl/Cmd + K). |
| Tests | Vitest (unitaires / intégration), Playwright (parcours) | Imposé. |
| Cible production | Supabase (PostgreSQL, Auth, RLS) | Migrations SQL versionnées dans `supabase/migrations`. |

### 2.1 Architecture en couches

```
UI (src/app, src/components, src/features/*/components)
   │  lit l'état via des sélecteurs, déclenche des commandes
   ▼
Commandes métier (src/lib/domain/commands/*)      ← validation Zod + permissions + audit
   │  fonctions pures : (état, entrée, contexte) → nouvel état + événements
   ▼
Moteur de gamification (src/lib/gamification/engine.ts)
   │  réagit aux événements métier (XP idempotente, missions, succès, rangs)
   ▼
Repository (src/lib/database/*)  ──  DemoRepository (localStorage)  |  SupabaseRepository (cible)
```

* **Une seule implémentation de la logique métier.** Les commandes sont des fonctions
  pures qui ne savent pas où les données sont stockées. Le mode démo et le mode
  Supabase utilisent les mêmes commandes et les mêmes calculs.
* **Calculs centralisés** dans `src/lib/calculations` (montants en centimes entiers,
  TVA, statuts de facture, MRR, trésorerie, pipeline, progression…). Toutes les pages
  et tous les graphiques passent par ces fonctions.
* **Gamification transversale** : chaque commande émet des événements métier ; le
  moteur attribue l'XP avec une clé d'idempotence et réévalue missions, succès,
  objectifs, rang d'entreprise et notifications.

### 2.2 Mode démonstration vs mode Supabase

* Sans variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  l'application fonctionne en **mode démo local** : données dans le navigateur
  (localStorage), aucune authentification, permissions simulées par un sélecteur de
  rôle. Ce mode **n'est pas sécurisé** et l'interface l'indique.
* Le schéma PostgreSQL, les politiques RLS et le seed SQL sont fournis
  (`supabase/`). La synchronisation applicative avec Supabase est décrite dans le
  README ; elle n'est pas activée tant qu'aucune instance n'est configurée.

## 3. Modules

| # | Module | Route | Contenu principal |
| --- | --- | --- | --- |
| 1 | Command Center | `/` | KPI, graphiques, alertes, missions du jour, activité, actions rapides |
| 2 | Centre de missions | `/missions` | Missions quotidiennes/hebdo/mensuelles/stratégiques/perso |
| 3 | Finances | `/finances`, `/finances/factures`, `/finances/factures/[id]`, `/finances/depenses`, `/finances/tresorerie`, `/finances/abonnements` | Factures, paiements, dépenses, trésorerie, MRR/ARR |
| 4 | Ventes & CRM | `/crm`, `/crm/prospects`, `/crm/devis`, `/crm/devis/[id]`, `/crm/activites` | Pipeline Kanban, prospects, devis, activités |
| 5 | Clients | `/clients`, `/clients/[id]` | Base clients, fiche à onglets, contacts |
| 6 | Projets | `/projets`, `/projets/[id]` | Liste / Kanban / calendrier, jalons, rentabilité |
| 7 | Tâches | `/taches` | Liste / Kanban / calendrier, aujourd'hui, en retard, temps, commentaires |
| 8 | Équipe | `/equipe` | Collaborateurs, charge, compétences |
| 9 | Produits & services | `/catalogue` | Catalogue alimentant devis et factures |
| 10 | Opérations | `/operations` | Calendrier global, échéances, risques, notes |
| 11 | Analyses | `/analyses` | Rapports financiers, commerciaux, projets + exports CSV |
| 12 | Objectifs (OKR) | `/objectifs` | Objectifs, résultats clés, progression automatique ou manuelle |
| 13 | Progression | `/progression` | Niveau, rangs, succès, récompenses, journal, siège virtuel |
| 14 | Notifications | `/notifications` | Centre de notifications filtrable |
| 15 | Paramètres | `/parametres` | Entreprise, TVA, préférences, gamification, données, rôles |

## 4. Phases

1. **Fondations** — scaffold, design system, layout (sidebar, top bar), store, seed, README.
2. **Command Center** — KPI, graphiques, alertes, missions du jour, activité, actions rapides.
3. **Gestion métier** — CRUD clients, contacts, prospects, opportunités, devis, factures,
   paiements, dépenses, abonnements, catalogue, projets, tâches, équipe, objectifs.
4. **Gamification** — XP, niveaux, missions automatiques idempotentes, succès, rangs,
   récompenses, journal.
5. **Analyses & opérations** — rapports filtrables, trésorerie prévisionnelle,
   calendrier, risques, recherche globale, exports, notifications.
6. **Finitions** — responsive, accessibilité, états vides / erreurs, tests, docs.

## 5. Suivi

L'état réel d'avancement (fonctionnalités livrées, limites, reste à faire) est tenu à
jour dans la section « Bilan » du `README.md`.
