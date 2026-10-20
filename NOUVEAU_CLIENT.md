# Livrer le CRM à un nouveau client

Chaque client reçoit **sa propre copie** de l'application : un site Vercel et une base
Supabase rien qu'à lui. Les données de deux clients ne se croisent jamais. Le code est le
même pour tous (ce dépôt) : une amélioration poussée sur `main` profite à tous les sites
reliés au dépôt.

Comptez environ 15 minutes par client.

## Avant de commencer

**Comptes et abonnements**

- **Supabase** : l'offre gratuite limite en général le nombre de projets actifs (souvent
  2). Au-delà, passez à l'offre payante ou mettez en pause un projet inutilisé.
- **Vercel** : l'offre gratuite est en principe réservée à un usage non commercial ; pour
  un site livré à un client, prévoyez l'offre Pro (vérifiez sur vercel.com/pricing).
- **GitHub** : accès au dépôt `yanissbeddadi-png/bdo-software`.

**Informations du client** : envoyez-lui `docs/Questionnaire-nouveau-client.docx`
(3 pages, ~15 minutes). Il y renseigne :

- entreprise : nom commercial, raison sociale, secteur, coordonnées ;
- identité visuelle : **logo** (PNG, SVG, JPEG ou WebP, 300 Ko max, horizontal, fond
  transparent) et **couleur principale** (`#RRGGBB`) ;
- **directeur commercial** : prénom, nom, fonction, e-mail ;
- **équipe** : prénom, nom, fonction, e-mail et rôle de chaque utilisateur ;
- **cycle de vente** : libellés et probabilités des 7 étapes, sources de contacts,
  délais de relance, jours travaillés ;
- **modules** souhaités.

## Procédure assistée (recommandée)

Dans une session Claude Code sur ce dépôt, **avec les connecteurs Supabase et Vercel
branchés** (claude.ai › Connecteurs, avant d'ouvrir la session), écrivez :

> Crée le site pour le client « Martin Conseil »

ou lancez `/nouveau-client`. Claude suit `.claude/skills/nouveau-client/SKILL.md` :

1. **Claude** crée la base Supabase (Paris), installe les tables et vérifie qu'elles sont
   identiques à la référence (empreinte du schéma) ;
2. **Claude** crée le site Vercel `crm-<client>` relié au dépôt, avec 3 des 4 variables, et
   génère le code d'installation ;
3. **Vous (1 minute)** copiez la clé secrète Supabase dans Vercel — Claude vous donne les
   deux liens directs ; aucun outil ne lui donne accès à cette clé ;
4. **Claude** déploie et vous donne le lien `https://crm-<client>.vercel.app/installation` ;
5. **Vous** faites l'installation (étape 3 ci-dessous) puis la configuration (étape 4) avec
   les réponses du questionnaire.

Sans assistant, suivez les étapes 1 à 5 ci-dessous.

## 1. Base de données (Supabase)

1. Sur [supabase.com](https://supabase.com) : **New project**, au nom du client, région
   Europe (Paris, Francfort, Londres…). Notez le mot de passe de la base en lieu sûr.
2. **SQL Editor › New query** : collez tout le contenu de `supabase/install.sql`, puis **Run**.
3. **Authentication › Sign In / Providers** : décochez « Allow new users to sign up »
   (les comptes sont créés par le directeur commercial depuis l'application).
4. **Project Settings › API Keys** : gardez l'onglet ouvert, vous copierez l'URL du projet,
   la clé publique (_publishable_ ou _anon_) et la clé secrète (_secret_ ou _service_role_).

## 2. Site (Vercel)

1. **Add New › Project** › importez ce dépôt GitHub. Donnez au projet le nom du client
   (ex. `crm-martin-conseil`) : l'adresse sera `crm-martin-conseil.vercel.app`.
2. **Environment Variables**, avant le premier déploiement :

   | Nom                             | Valeur                                                               |
   | ------------------------------- | -------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | URL du projet Supabase du client                                     |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publique (_publishable_)                                         |
   | `SUPABASE_SERVICE_ROLE_KEY`     | clé secrète — cochez **Sensitive**                                   |
   | `BDO_SETUP_CODE`                | un code d'installation que vous inventez (ex. `MARTIN-2026-INSTALL`) |

3. **Deploy**. (Si les variables sont ajoutées après coup : _Deployments › Redeploy_.)

Ne collez jamais la clé secrète dans un e-mail, un chat ou le dépôt.

## 3. Installation (2 minutes)

Ouvrez `https://<adresse-du-client>/installation` :

- **Code d'installation** : la valeur de `BDO_SETUP_CODE` ;
- **Contenu de départ** : **Espace vide** (vrai client) ou **Données de démonstration**
  (présentation commerciale) ;
- nom de l'entreprise cliente, nom et fonction du **directeur commercial**, son e-mail et
  son mot de passe.

Le compte créé est celui du **directeur commercial** : administrateur de l'espace, il voit
toutes les données et règle tout. Vous pouvez faire l'installation vous-même puis lui
transmettre l'accès, ou la faire avec lui.

## 4. Configuration (Paramètres)

| Onglet                    | Ce que vous réglez                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entreprise**            | Identité visuelle : logo (PNG, JPEG, WebP ou SVG, 300 Ko max), couleur principale, marque BDO ou initiales. Coordonnées, TVA.                 |
| **CRM**                   | Libellés et probabilités des 7 étapes du pipeline, sources de contacts, délais de relance, jours ouvrés.                                      |
| **Modules**               | Propositions, Finances, Analyses, Projets et tâches internes, Produits, Objectifs, Opérations, Bureaux 3D, Gamification : activés ou masqués. |
| **Utilisateurs et rôles** | Comptes de connexion (voir ci-dessous).                                                                                                       |
| **Données**               | Sauvegarde JSON, import, chargement de la démonstration, « Vider l'espace ».                                                                  |

### Équipe et comptes

1. **Équipe** (Paramètres › CRM › Autres modules › Équipe, ou `/equipe`) : « Nouveau
   collaborateur » pour chaque commercial, avec son e-mail professionnel.
2. **Paramètres › Utilisateurs et rôles** : « Créer les comptes de l'équipe » crée d'un
   coup un compte pour chaque fiche qui a un e-mail, ou « Nouveau compte » un par un.
   Les mots de passe temporaires ne s'affichent qu'une fois : transmettez-les à chacun,
   qui pourra le changer (menu du profil › Changer mon mot de passe).
3. Rôles : **Commercial** (ne voit que son portefeuille), **Collaborateur** (lecture et
   missions), **Directeur commercial** (tout).

Chaque commercial voit uniquement les contacts, entreprises, opportunités et missions dont
il est responsable. Pour lui confier des contacts : Contacts › cocher › « Attribuer à… ».

## 5. Après la livraison

- Le client se connecte sur `https://<adresse-du-client>/connexion` (logo et couleur de
  son entreprise).
- Mot de passe oublié : le directeur commercial génère un nouveau mot de passe
  (Paramètres › Utilisateurs et rôles).
- Une démonstration a été chargée par erreur ? Paramètres › Données › « Vider l'espace »
  (réglages, identité, équipe et comptes conservés).

## Limites actuelles

- Pas d'envoi d'e-mails (invitations, mots de passe oubliés) : les accès se transmettent à la main.
- Une installation = un client. Il n'y a pas de console centrale listant tous vos clients.
- Les étapes du pipeline sont toujours au nombre de 7 (renommables, pas supprimables).
