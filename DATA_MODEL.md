# Modèle de données — BDO Software

> Toutes les données livrées sont **fictives** (jeu de démonstration). Les adresses
> e-mail utilisent le domaine réservé `.example`.

Deux représentations partagent les mêmes règles :

| Représentation | Fichier | Usage |
| --- | --- | --- |
| Types TypeScript (agrégat `AppData`) | `src/lib/domain/types.ts` | Mode démo (navigateur) et couche de commandes |
| Schéma PostgreSQL / Supabase | `supabase/migrations/*.sql` | Cible de production (RLS, contraintes, index) |

## 1. Conventions

* **Montants** : centimes entiers (`Cents` / `bigint`). Aucun calcul monétaire en euros flottants.
* **TVA** : points de base (`2000` = 20 %), paramétrable par organisation et par ligne.
* **Dates** : `yyyy-MM-dd` pour les dates calendaires, ISO 8601 pour les horodatages.
* **Identifiants** : chaînes stables préfixées (`cli_…`, `inv_…`, `tsk_…`). Les missions
  automatiques ont un identifiant déterministe dérivé de leur clé (`mis_auto_<hash>`).
* **Rattachement** : chaque table métier porte `organization_id` (multi-entreprise).
* **Horodatage** : `created_at` / `updated_at` (trigger `app.touch_updated_at`).

## 2. Entités

### Organisation et accès
| Table | Rôle | Points clés |
| --- | --- | --- |
| `organizations` | Entreprise | `settings` (jsonb : société, TVA, règles, gamification), `is_demo` |
| `organization_members` | Lien utilisateur ↔ organisation | `role` (`app_role`), PK (org, user) |
| `roles`, `permissions`, `role_permissions` | Matrice d'autorisation | Miroir de `src/lib/permissions/index.ts` |

### CRM et ventes
| Table | Relations | Règles |
| --- | --- | --- |
| `clients` | — | Nom unique par organisation (insensible à la casse) ; suppression `restrict` si factures, devis, projets ou contrats |
| `client_documents` | → clients | Références uniquement (aucun fichier stocké en démo) |
| `contacts` | → clients / leads | Un seul contact principal par client (index partiel) |
| `leads` | → clients (`converted_client_id`) | Doublons refusés (entreprise, e-mail) ; conversion uniquement si « qualifié » |
| `opportunities` | → clients ou leads, contacts, employees | `closed_at` renseigné ⇔ étape gagnée/perdue ; jamais compté comme CA |
| `sales_activities` | → clients, leads, opportunities, invoices | `done = false` = rappel planifié |
| `products` | — | Référence (`sku`) unique ; prix en centimes |
| `quotes`, `quote_items` | → clients, opportunities, invoices | Lignes à prix figés ; transitions de statut contrôlées |

### Finance
| Table | Relations | Règles |
| --- | --- | --- |
| `invoices` | → clients, projects, quotes, subscriptions | Statut **stocké** : `draft` / `issued` / `cancelled`. Numéro unique ; une échéance d'abonnement facturée une seule fois (index unique partiel) |
| `invoice_items` | → invoices, products | Prix et TVA figés ; modifiables uniquement si la facture est brouillon (RLS) |
| `payments` | → invoices (`restrict`) | Distincts des factures ; montant > 0 ; plusieurs paiements par facture ; interdits dans une période de TVA déclarée (trigger) |
| `credit_notes`, `credit_note_items` | → invoices (`restrict`), clients | Avoir sur facture émise : numéro `AV-AAAA-NNNN`, lignes positives figées, motif obligatoire ; documents immuables (RLS : lecture + création) ; Σ avoirs ≤ TTC de la facture |
| `refunds` | → invoices, credit_notes | Remboursement d'un trop-perçu après avoir ; montant ≤ trop-perçu (`record_refund()`) ; décaissement |
| `vat_returns` | → organizations | Une déclaration par période `AAAA-MM` ; montants figés (trigger) ; `declared` → `paid` uniquement ; `credit` ⇔ net ≤ 0 ; permission `vat.write` |
| `expenses` | → expense_categories, projects | `paid` ⇔ `paid_date` |
| `expense_categories` | — | Drapeau `recurring` utilisé par les prévisions |
| `subscriptions` | → clients, products | Résiliation = statut `cancelled` + date de fin |
| Vues `invoice_totals`, `credit_note_totals`, `invoice_balances` | — | Totaux HT/TVA/TTC, avoirs, net dû, encaissé net, trop-perçu et statut **calculé** (même règle que l'application) |

### Projets, tâches, équipe, objectifs
| Table | Règles |
| --- | --- |
| `projects`, `project_members`, `project_milestones` | Code unique ; `completed_at` ⇔ statut `done` ; suppression bloquée si tâches / pièces |
| `tasks`, `task_dependencies`, `task_comments` | `completed_at` ⇔ `done` ; pas d'auto-dépendance ; cycles refusés par la couche de commandes |
| `employees`, `skills`, `employee_skills` | Coût mensuel estimé ; compétences 1–5 (ludiques) |
| `goals`, `goal_key_results` | `metric` automatique ou `manual` ; cible ≠ valeur initiale |

### Gamification
| Table | Règles |
| --- | --- |
| `xp_transactions` | **Clé d'idempotence unique** par organisation ; écriture réservée au serveur |
| `retired_xp_keys` | Clés consommées avant une réinitialisation (jamais réattribuées) |
| `achievements`, `user_achievements` | Définitions + déblocages (une ligne par succès et organisation) |
| `missions`, `mission_progress` | `auto_key` unique (missions automatiques idempotentes) ; historique |
| `levels`, `company_progress`, `progression_entries` | Titres, niveau/rang annoncés, journal (clé unique) |

### Transverse
`notifications` (clé de déduplication unique), `activity_events`, `audit_logs`, `notes`.

## 3. Règles de suppression

* `on delete restrict` pour préserver l'historique financier : un client ayant des
  factures, une facture ayant des paiements, un projet ayant des tâches.
* `on delete set null` pour les liens optionnels (opportunité d'un projet, produit d'une ligne…).
* `on delete cascade` pour les enfants sans existence propre (lignes, jalons, commentaires).
* Côté application, les commandes appliquent les mêmes règles et proposent une
  alternative (statut « Perdu », « Annulé », annulation de facture).

## 4. Indicateurs (définitions)

Implémentation : `src/lib/calculations/*`. Les mêmes fonctions alimentent tableaux,
KPI et graphiques.

| # | Indicateur | Définition |
| --- | --- | --- |
| 1 | **CA facturé (HT)** | Somme HT des factures `issued` dont la date d'émission est dans la période (hors brouillons et annulations), **moins** les avoirs HT émis dans la période (à leur propre date) |
| 2 | **CA encaissé (TTC)** | Paiements datés dans la période − remboursements datés dans la période |
| 3 | **MRR** | Σ des abonnements actifs ramenés au mois (trimestriel ÷ 3, annuel ÷ 12) ; exclut `paused`, contrats non démarrés ou terminés |
| — | **ARR** | MRR × 12 — estimation annualisée, pas du CA réalisé |
| 4 | **Pipeline** | Σ montants des opportunités ouvertes ; **pondéré** = Σ montant × probabilité |
| 5 | **Prévisions** | `buildForecast` : scénarios prudent / central / optimiste avec hypothèses explicites (affichées dans l'UI) |
| 6 | **Dépenses engagées (HT)** | Dépenses datées dans la période, payées ou non |
| 7 | **Décaissements (TTC)** | Dépenses payées (date de paiement dans la période) + TVA reversée (déclarations payées dans la période) |
| 8 | **Résultat opérationnel estimé** | CA facturé HT − dépenses engagées HT (estimation de gestion, pas un résultat comptable) |
| — | **Marge opérationnelle** | Résultat ÷ CA facturé ; `null` (non calculable) si CA nul |
| 9 | **Trésorerie disponible** | Solde d'ouverture + paiements − remboursements − dépenses payées TTC − TVA reversée, jusqu'à la date. Jamais « factures − dépenses » |
| — | **TVA déclarée à payer** | Σ net des déclarations au statut `declared` |
| — | **Créances** | Soldes restants des factures émises ; **échues** si échéance dépassée |
| — | **Dettes fournisseurs** | Dépenses non payées (TTC) |

### Règles de calcul détaillées

* **TVA** : HT de ligne arrondi au centime (`quantité × PU`), puis TVA calculée **par taux**
  sur la somme des bases HT de ce taux, arrondie au centime (demi-unité éloignée de zéro).
* **Statut de facture** : `cancelled`/`draft` prioritaires ; `credited` (« annulée par
  avoir ») si les avoirs couvrent tout le TTC ; `paid` si encaissé net ≥ net dû (TTC − avoirs) ;
  `overdue` si solde > 0 et échéance dépassée ; `partially_paid` si 0 < encaissé < net dû ;
  sinon `issued`. Un paiement partiel ne rend jamais une facture « payée ».
* **Paiement** : refusé s'il dépasse le solde net dû, s'il est daté dans le futur ou avant
  l'émission, si la facture n'est pas émise, ou si sa date tombe dans une période de TVA déclarée.
* **Avoir** : uniquement sur facture émise ; date entre l'émission de la facture et
  aujourd'hui ; TTC > 0 et ≤ montant restant créditable. Si l'encaissé dépasse le net dû, la
  différence est un **trop-perçu** à rembourser (alerte, prévision à 15 jours). L'annulation
  « directe » est réservée aux factures émises par erreur, sans paiement ni avoir.
* **Remboursement** : ≤ trop-perçu, non futur, hors période de TVA déclarée.

### TVA (`src/lib/calculations/vat.ts`)

* **Régime** : TVA sur les **encaissements** (prestations de services), déclaration **mensuelle**.
* **Collectée** du mois = Σ paiements × (TVA ÷ TTC de la facture) − Σ remboursements × même part.
* **Déductible** du mois = TVA des dépenses **payées** dans le mois.
* **Net** = collectée − déductible − crédit reporté ; un net ≤ 0 devient un **crédit**
  reporté sur la période suivante (statut `credit`, aucun remboursement de crédit demandé).
* **Échéance** : jour `vatDueDay` (24 par défaut, 1–28) du mois suivant.
* **Déclarations séquentielles** : seule la plus ancienne période complète non déclarée peut
  l'être ; les montants sont figés et la période est **clôturée** (aucun paiement,
  remboursement ou dépense payée ne peut plus y être daté, créé, modifié ou supprimé).
* **Paiement** : uniquement d'une déclaration `declared`, daté après la fin de la période
  et au plus tard aujourd'hui ; c'est un décaissement de trésorerie.
* **Prévisions** : déclarations à payer à leur échéance, périodes complètes non déclarées,
  puis TVA nette estimée du mois en cours (réalisé + flux prévus) et des mois suivants
  (TVA contenue dans chaque flux prévu), avec report de crédit.
* `vatTrackingStart` : premier mois suivi ; verrouillé dès qu'une déclaration existe.
* **Progression de projet** : 70 % part d'effort (heures estimées) des tâches terminées +
  30 % jalons atteints ; plafonnée à 99 % tant que le projet n'est pas clôturé.
* **Coût réel de projet** : dépenses rattachées (HT) + heures saisies × coût horaire du
  responsable (coût mensuel ÷ 151,67 h). Jamais déduit du budget prévisionnel.
* **Objectifs** : progression = (actuel − initial) ÷ (cible − initial), bornée à [0, 100] ;
  fonctionne pour les objectifs de réduction. Statut « en risque » si le temps écoulé
  dépasse la progression de plus de 25 points.

### Bureaux virtuels (`src/lib/calculations/office.ts`)

* Zones fixes (plan 32 × 22 m) rattachées aux services ; les alertes sont réparties par
  type (finance, commercial, projets, développement, direction).
* Présence **simulée et déterministe** : journée 9 h – 18 h (fuseau de l'entreprise),
  réunions / démos du jour en salle de réunion (60 min), appels au poste (30 min),
  déjeuner d'une heure et pause café de 15 min à heures stables par personne, sinon
  travail sur la tâche ouverte la plus prioritaire. Aucune donnée de suivi réel des personnes.
* Surcharge : heures restantes des tâches dues sous 14 jours > `workloadHoursThreshold`.

## 5. Hypothèses et limites de la simulation

* Les déclarations de TVA sont un **outil de gestion** : aucune télédéclaration ni
  télépaiement n'est effectué ; seul le régime mensuel sur les encaissements est simulé
  (pas d'autoliquidation, d'acomptes, de TVA sur les débits ni de demande de remboursement de crédit).
* Le solde d'ouverture est une donnée fictive ; aucune connexion bancaire.
* Le module est un outil de gestion interne, **pas un logiciel comptable certifié**.

## 6. Seed

* `src/lib/database/seed.ts` : générateur déterministe (graine fixe) relatif à une date
  d'ancrage ; 15 clients, 22 contacts, 12 prospects, 14 opportunités, 10 produits,
  12 projets, 47 tâches, ~120 factures, ~100 paiements, ~80 dépenses, 10 devis,
  6 collaborateurs, 9 objectifs, missions, succès, notifications, activité.
* Version 2 : 2 avoirs (partiel ; total sur une échéance d'abonnement suivi d'un
  remboursement), déclarations de TVA mensuelles déclarées le 12 et payées le 18 jusqu'à
  M−2, la dernière période complète restant à déclarer.
* Les données locales v1 sont **migrées** sans perte (`src/lib/database/migrations.ts`) :
  ajout des collections vides, suivi de TVA démarrant au mois précédent.
* `npm run seed:sql [-- AAAA-MM-JJ]` produit `supabase/seed.sql` à partir du même générateur.
