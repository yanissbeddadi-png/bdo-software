# Règles de gamification — BDO Software CRM

La gamification est une **couche transversale** qui réagit aux données métier. Elle ne
masque jamais les chiffres, ne bloque aucune fonction de gestion et l'**XP n'a aucune
valeur monétaire**.

Code : `src/lib/gamification/` (moteur `engine.ts`, missions `missions.ts`, succès
`achievements.ts`, rangs `ranks.ts`, niveaux `levels.ts`, récompenses `rewards.ts`).

## 1. Principe : réconciliation idempotente

Après **chaque commande métier** (et au chargement de l'application), le moteur
`reconcileGamification` examine l'état et :

1. met à jour le suivi « aucune tâche en retard » ;
2. crée les **défis automatiques** manquants (clé `autoKey` déterministe) puis évalue
   les conditions de tous les défis actifs ;
3. calcule les **récompenses dues** à partir de l'état (missions CRM terminées, appels
   consignés, opportunités qualifiées et gagnées, fiches complètes, semaines rigoureuses…) ;
4. débloque les **succès** dont la condition est remplie ;
5. attribue l'XP **uniquement pour les clés d'idempotence absentes** (et non retirées) ;
6. journalise niveaux, rang d'entreprise et récompenses débloquées (une fois chacun).

Exécuter le moteur deux fois de suite ne change rien (testé).

### Clés d'idempotence

| Événement                                 | Clé                                                           | Date de l'XP                                |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Tâche terminée                            | `task:<id>`                                                   | date de clôture                             |
| Projet terminé                            | `project:<id>`                                                | date de clôture                             |
| Opportunité gagnée                        | `opportunity:<id>`                                            | date de clôture                             |
| Facture intégralement payée               | `invoice:<id>`                                                | date du dernier paiement                    |
| Reprise (facture annulée par avoir)       | `invoice-reversal:<id>`                                       | date de la réconciliation (montant négatif) |
| Nouveau client validé                     | `client:<id>`                                                 | 1re facture soldée ou 1er contrat démarré   |
| Objectif à 50 % / 100 %                   | `goal:<id>:50`, `goal:<id>:100`                               | date du franchissement                      |
| Défi relevé                               | `mission:<id>`                                                | date de validation                          |
| Appel consigné / compte rendu             | `call:<id>` / `meeting-report:<id>`                           | date de saisie                              |
| Opportunité qualifiée / prospect qualifié | `opportunity-qualified:<id>` / `prospect-qualified:<contact>` | date de qualification                       |
| Fiche contact complète                    | `contact-complete:<id>`                                       | date de création                            |
| Semaine de suivi rigoureux                | `week-on-track:<semaine>`                                     | fin de semaine                              |
| Succès débloqué                           | `achievement:<id>`                                            | date de déblocage                           |

En base (Supabase), l'unicité est garantie par l'index `xp_transactions(organization_id, idempotency_key)`.

## 2. Barème (configurable dans Paramètres › Gamification)

| Action commerciale validée                                                     | XP                          | Clé                                                |
| ------------------------------------------------------------------------------ | --------------------------- | -------------------------------------------------- |
| Prospect qualifié (1re opportunité du contact en « En discussion » ou au-delà) | 10                          | `prospect-qualified:<contact>`                     |
| Fiche contact complète (entreprise, fonction, e-mail, téléphone)               | 5                           | `contact-complete:<contact>`                       |
| Appel consigné avec résumé (résultat ou note ≥ 5 caractères)                   | 5                           | `call:<interaction>`                               |
| Relance planifiée réalisée                                                     | 10                          | `task:<mission>`                                   |
| Mission CRM terminée                                                           | 15                          | `task:<mission>`                                   |
| Rendez-vous réalisé avec compte rendu                                          | 20                          | `task:<mission>` ou `meeting-report:<interaction>` |
| Opportunité qualifiée                                                          | 20                          | `opportunity-qualified:<opportunité>`              |
| Conversion (opportunité gagnée)                                                | 50                          | `opportunity:<opportunité>`                        |
| Semaine avec tous les suivis à jour                                            | 40                          | `week-on-track:<semaine ISO>`                      |
| Défi quotidien relevé                                                          | 30 (hebdo ×2, mensuel ×3–4) | `mission:<défi>`                                   |
| Objectif à mi-parcours / atteint (configurable)                                | 50 / 150                    | `goal:<id>:50` / `goal:<id>:100`                   |
| Succès commun / rare / épique / légendaire                                     | 50 / 200 / 300 / 500        | `achievement:<id>`                                 |

Les règles des modules historiques (tâche interne 10/20/40, projet terminé, facture
payée, client validé) restent actives pour ces modules.

## 3. Règles anti-abus

- **Aucune XP pour l'ouverture d'un écran** : seules des transitions d'état validées comptent.
- **Pas de récompense pour du vide** : un contact incomplet ne rapporte rien ; une mission
  CRM terminée sans contact, entreprise ni opportunité ne rapporte rien ; un appel sans
  résumé ne rapporte rien.
- **Interactions répétées plafonnées** : appels récompensés limités par jour
  (`dailyCallXpCap`, 8 par défaut, Paramètres › CRM), comptes rendus de rendez-vous 5/jour,
  fiches complètes 10/jour. Un rendez-vous terminé comme mission n'est pas récompensé une
  seconde fois via son interaction.
- **Conversion unique** : gagner, perdre puis regagner une opportunité ne rapporte qu'une fois.
- **Aucun changement d'étape automatique** : consigner un appel ou terminer une mission
  ne fait jamais gagner ni perdre une opportunité.
- **Une seule récompense par entité** : rouvrir/refermer une tâche, faire passer une
  opportunité de gagnée à perdue puis gagnée, supprimer/ressaisir un paiement → aucune XP en plus.
- **Client validé** uniquement après une **facture réellement soldée** ou un **contrat
  démarré** — créer puis supprimer des clients ne rapporte rien.
- **Factures** : XP uniquement si TTC > 0 et intégralement payée ; les **échéances
  d'abonnement** (flux automatique) ne rapportent pas d'XP ; **plafond quotidien**
  (10 factures/jour par défaut).
- **Tâches** : plafond de 20 tâches récompensées par jour.
- **Missions personnalisées** : 30 XP maximum chacune, 3 récompensées par jour au plus.
- **Missions automatiques** : jamais validables manuellement ; elles se terminent quand
  leur condition métier est remplie. Les missions mensuelles ne sont générées que si elles
  constituent un vrai défi (MRR > 0, tâches en retard existantes).
- **Factures annulées** : impossible d'annuler une facture payée ; une facture annulée ne
  peut pas être soldée, donc pas récompensée. Une facture **intégralement annulée par
  avoir** après avoir été récompensée reçoit une transaction **négative** du même montant
  (`invoice-reversal:<id>`, une seule fois) : payer puis créditer ne rapporte rien.
- **Début de progression** : seuls les événements datés après `progressionStart`
  rapportent de l'XP (le jeu de démo démarre 75 jours avant la date d'ancrage).

## 4. Niveaux

- XP requise pour passer du niveau N à N+1 : **100 + 25 × (N − 1)**.
- Le niveau n'est **jamais stocké** : il est recalculé depuis l'XP totale (`levelFromXp`).
  Seul le dernier niveau annoncé est mémorisé pour journaliser chaque passage, y compris
  lorsqu'une action fait franchir plusieurs niveaux.
- Titres (purement ludiques) : 1 Débutant · 5 Prospecteur · 10 Négociateur ·
  20 Gestionnaire de comptes · 35 Expert relation client · 50 Stratège commercial ·
  75 Maître du CRM.

## 5. Rangs de l'entreprise

Un rang est atteint quand **tous ses critères** (et ceux des rangs précédents) sont remplis.

| Rang | Nom                       | Critères                                                                         |
| ---- | ------------------------- | -------------------------------------------------------------------------------- |
| 1    | Startup commerciale       | —                                                                                |
| 2    | Portefeuille naissant     | 3 clients actifs, 1 opportunité gagnée                                           |
| 3    | Équipe commerciale rodée  | 6 clients actifs, 3 gagnées, pipeline actif 150 k€                               |
| 4    | Machine commerciale       | 10 clients, 5 gagnées, 30 missions CRM terminées, 1 objectif atteint             |
| 5    | Référence relation client | 12 clients, conversion ≥ 40 %, satisfaction ≥ 4/5, 2 semaines de suivi rigoureux |
| 6    | Acteur reconnu            | 20 clients, 15 gagnées, 5 objectifs, meilleure série ≥ 14 jours                  |
| 7    | Leader du marché          | 35 clients, 30 gagnées, pipeline 1 M€, meilleure série ≥ 30 jours                |

« Client actif » = entreprise `relation = customer` et statut actif. La page Progression
affiche les critères manquants pour le rang suivant.

## 6. Séries, semaines rigoureuses et défis

**Série de suivi** (`src/lib/crm/streak.ts`) : nombre de jours ouvrés consécutifs avec au
moins une action CRM réelle (interaction consignée, mission terminée, changement d'étape,
fiche complète créée). Ouvrir l'application ne compte pas. Les jours non ouvrés
(paramétrables, lundi–vendredi par défaut) n'interrompent jamais une série ; une action
ces jours-là compte en bonus. Aujourd'hui sans action n'interrompt pas encore la série.
Paliers de succès : 3, 7, 14 et 30 jours.

**Semaine de suivi rigoureux** : semaine ISO terminée comportant au moins 3 missions de
suivi (relance, appel, e-mail) à échéance, toutes réalisées au plus tard le jour prévu.

**Défis** (anciennement « missions » de gamification ; les missions sont désormais les
actions CRM) — générés automatiquement, jamais validables manuellement :

| Règle                                       | Clé                                   | Condition de réussite                      |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Boucler la journée                          | `journee:<jour>`                      | Toutes les missions CRM du jour terminées  |
| Opportunité inactive (> 14 j, configurable) | `opportunite:<id>:<date interaction>` | Nouvelle interaction ou changement d'étape |
| Prospection hebdomadaire                    | `prospection:<semaine>`               | N contacts prospects créés (configurable)  |
| Interactions hebdomadaires                  | `interactions:<semaine>`              | 5 interactions consignées                  |
| Qualification hebdomadaire                  | `qualification:<semaine>`             | 2 opportunités qualifiées                  |
| Zéro relance en retard                      | `zero-relance:<mois>`                 | Aucune mission CRM en retard               |

Les défis personnalisés restent possibles (30 XP max, 3 récompensés par jour). Lors de la
migration v3, les défis ouverts non CRM (trésorerie, TVA, budget, MRR…) sont annulés,
leur historique est conservé.

## 7. Succès (19)

Premier prospect · Premier appel consigné · Première relance effectuée · Première
opportunité qualifiée · Première proposition envoyée · Premier client gagné · Compte
rendu exemplaire · Carnet d'adresses qualifié (10 contacts complets) · Dix missions
accomplies · Zéro relance en retard · Journée bouclée · Comptes prioritaires sous contrôle ·
Pipeline ambitieux (seuil configurable) · Cinq conversions · Semaine de suivi rigoureux ·
Séries de 3, 7, 14 et 30 jours.

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
