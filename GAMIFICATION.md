# Règles de gamification — BDO Software

La gamification est une **couche transversale** qui réagit aux données métier. Elle ne
masque jamais les chiffres, ne bloque aucune fonction de gestion et l'**XP n'a aucune
valeur monétaire**.

Code : `src/lib/gamification/` (moteur `engine.ts`, missions `missions.ts`, succès
`achievements.ts`, rangs `ranks.ts`, niveaux `levels.ts`, récompenses `rewards.ts`).

## 1. Principe : réconciliation idempotente

Après **chaque commande métier** (et au chargement de l'application), le moteur
`reconcileGamification` examine l'état et :

1. met à jour le suivi « aucune tâche en retard » ;
2. crée les **missions automatiques** manquantes (clé `autoKey` déterministe) puis évalue
   les conditions de toutes les missions actives ;
3. calcule les **récompenses dues** à partir de l'état (tâches terminées, projets livrés,
   factures soldées…) ;
4. débloque les **succès** dont la condition est remplie ;
5. attribue l'XP **uniquement pour les clés d'idempotence absentes** (et non retirées) ;
6. journalise niveaux, rang d'entreprise et récompenses débloquées (une fois chacun).

Exécuter le moteur deux fois de suite ne change rien (testé).

### Clés d'idempotence

| Événement | Clé | Date de l'XP |
| --- | --- | --- |
| Tâche terminée | `task:<id>` | date de clôture |
| Projet terminé | `project:<id>` | date de clôture |
| Opportunité gagnée | `opportunity:<id>` | date de clôture |
| Facture intégralement payée | `invoice:<id>` | date du dernier paiement |
| Nouveau client validé | `client:<id>` | 1re facture soldée ou 1er contrat démarré |
| Objectif à 50 % / 100 % | `goal:<id>:50`, `goal:<id>:100` | date du franchissement |
| Mission terminée | `mission:<id>` | date de validation |
| Succès débloqué | `achievement:<id>` | date de déblocage |

En base (Supabase), l'unicité est garantie par l'index `xp_transactions(organization_id, idempotency_key)`.

## 2. Barème (configurable dans Paramètres › Gamification)

| Action validée | XP |
| --- | --- |
| Tâche simple / standard / complexe terminée | 10 / 20 / 40 |
| Mission quotidienne terminée | 30 (hebdo ×2, mensuelle ×3–4, stratégique ×5) |
| Objectif à mi-parcours / atteint | 50 / 150 |
| Projet terminé | 100 |
| Nouveau client validé | 75 |
| Opportunité gagnée | 100 |
| Facture payée intégralement | 30 |
| Succès commun / rare / épique / légendaire | 50 / 200 / 300 / 500 |

## 3. Règles anti-abus

* **Aucune XP pour l'ouverture d'un écran** : seules des transitions d'état validées comptent.
* **Une seule récompense par entité** : rouvrir/refermer une tâche, faire passer une
  opportunité de gagnée à perdue puis gagnée, supprimer/ressaisir un paiement → aucune XP en plus.
* **Client validé** uniquement après une **facture réellement soldée** ou un **contrat
  démarré** — créer puis supprimer des clients ne rapporte rien.
* **Factures** : XP uniquement si TTC > 0 et intégralement payée ; les **échéances
  d'abonnement** (flux automatique) ne rapportent pas d'XP ; **plafond quotidien**
  (10 factures/jour par défaut).
* **Tâches** : plafond de 20 tâches récompensées par jour.
* **Missions personnalisées** : 30 XP maximum chacune, 3 récompensées par jour au plus.
* **Missions automatiques** : jamais validables manuellement ; elles se terminent quand
  leur condition métier est remplie. Les missions mensuelles ne sont générées que si elles
  constituent un vrai défi (MRR > 0, tâches en retard existantes).
* **Factures annulées** : impossible d'annuler une facture payée ; une facture annulée ne
  peut pas être soldée, donc pas récompensée.
* **Début de progression** : seuls les événements datés après `progressionStart`
  rapportent de l'XP (le jeu de démo démarre 75 jours avant la date d'ancrage).

## 4. Niveaux du dirigeant

* XP requise pour passer du niveau N à N+1 : **100 + 25 × (N − 1)**.
* Le niveau n'est **jamais stocké** : il est recalculé depuis l'XP totale (`levelFromXp`).
  Seul le dernier niveau annoncé est mémorisé pour journaliser chaque passage, y compris
  lorsqu'une action fait franchir plusieurs niveaux.
* Titres (purement ludiques) : 1 Fondateur · 5 Gestionnaire · 10 Entrepreneur ·
  20 Stratège · 35 Directeur · 50 Visionnaire · 75 Magnat du numérique ·
  100 Légende entrepreneuriale.

## 5. Rangs de l'entreprise

Distincts du niveau du dirigeant. Un rang est atteint quand **tous ses critères** (et ceux
des rangs précédents) sont remplis — jamais sur la seule base du chiffre d'affaires.

| Rang | Nom | Critères |
| --- | --- | --- |
| 1 | Startup | — |
| 2 | Studio numérique | 3 clients actifs, 1 projet livré |
| 3 | Agence en croissance | 6 clients, MRR 3 k€, 3 projets |
| 4 | Société structurée | 10 clients, MRR 8 k€, 5 projets, 1 objectif atteint, trésorerie ≥ 2 mois de charges fixes |
| 5 | Entreprise rentable | 12 clients, MRR 15 k€, marge 3 mois ≥ 10 %, satisfaction ≥ 4/5, trésorerie ≥ 3 mois |
| 6 | Acteur reconnu | 20 clients, MRR 30 k€, 15 projets, marge ≥ 15 %, 5 objectifs |
| 7 | Groupe numérique | 35 clients, MRR 60 k€, 30 projets, marge ≥ 20 %, trésorerie ≥ 6 mois |

La page Progression affiche les critères manquants pour le rang suivant ; le siège
virtuel (SVG) gagne un bâtiment par rang.

## 6. Missions automatiques

| Règle | Clé | Condition de réussite |
| --- | --- | --- |
| Facture échue | `relance:<invoice>` | Relance consignée (activité « Relance ») ou facture soldée |
| Opportunité inactive (> 14 j, configurable) | `opportunite:<id>:<date interaction>` | Nouvelle interaction ou changement d'étape |
| Tâche critique due sous 2 j / en retard | `tache-critique:<id>` | Tâche terminée |
| Projet en dépassement budgétaire | `budget:<project>` | Validation manuelle après analyse |
| Revue de trésorerie hebdomadaire | `revue-tresorerie:<semaine>` | Revue validée sur la page Trésorerie |
| Prospection hebdomadaire | `prospection:<semaine>` | N prospects créés (configurable) |
| Activités commerciales | `activites:<semaine>` | 5 activités réalisées |
| Progression du MRR (+5 %) | `mrr:<mois>` | MRR atteint |
| Zéro tâche en retard | `zero-retard:<mois>` | Aucune tâche en retard |
| Projets prioritaires | `projets-prioritaires:<trimestre>` | Tous terminés |

Une mission dont l'entité disparaît est annulée ; une mission quotidienne automatique
échue depuis plus de 7 jours expire.

## 7. Succès (24)

Premier client · Premier devis · Première vente · Premier paiement reçu · Facture soldée ·
Dix clients actifs · Premier contrat récurrent · Premier projet livré · Atelier rodé (5 projets) ·
Usine à livraisons (10 projets) · Premier objectif atteint · Semaine sans retard ·
Trésorerie solide (3 fins de mois positives) · Premier mois rentable · Pipeline ambitieux
(seuil configurable) · Équipe complète · Croissance récurrente · Cap des 10 k€ de MRR ·
Gestionnaire rigoureux · Expert de la relation client · Stratège commercial ·
Maître des tâches · Quart de million · Bâtisseur d'entreprise (rang 4).

Chaque succès possède nom, description, icône, catégorie, rareté (commun, rare, épique,
légendaire — distinction ludique, pas une mesure comptable), condition, XP et date d'obtention.

## 8. Récompenses

Purement cosmétiques : **titres**, **thèmes d'accent** (Émeraude niv. 5, Améthyste niv. 10,
Or impérial niv. 20, Cyan orbital via un succès), **cadres de profil**, **bâtiments du siège
virtuel**. Aucune information financière ni fonction de gestion n'est verrouillée.

## 9. Réinitialisation

Paramètres › Gamification › « Réinitialiser la progression » (confirmation, journal d'audit) :
XP, niveau et journal repartent de zéro ; les clés déjà consommées sont placées dans
`retiredXpKeys` (jamais réattribuées) ; les succès restent acquis.
