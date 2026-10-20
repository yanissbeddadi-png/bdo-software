---
name: nouveau-client
description: Crée l'installation complète du CRM pour un nouveau client (base Supabase dédiée, tables vérifiées, site Vercel relié au dépôt, variables, déploiement) via les connecteurs Supabase et Vercel. À utiliser quand l'utilisateur demande « crée le site pour le client X », « nouveau client », « livre le CRM à X ».
---

# Nouveau client : base Supabase + site Vercel

Chaque client a **sa propre copie** : un projet Supabase et un projet Vercel à son nom, reliés
au même dépôt GitHub. Guide humain : `NOUVEAU_CLIENT.md`. Réponds en français.

## Repères (compte de l'utilisateur)

| Élément               | Valeur                                                 |
| --------------------- | ------------------------------------------------------ |
| Organisation Supabase | `zigwjkebnzjjaxkptqnw` (« BDO Software and Services ») |
| Compte Vercel         | `team_mEwgP20Gr5j8jphRw7bdLBzC` (slug `yaniss2`)       |
| Dépôt GitHub          | `yanissbeddadi-png/bdo-software`, branche `main`       |
| Région Supabase       | `eu-west-3` (Paris)                                    |

Vercel : les appels `get_project` / `filter_project_envs` avec `teamId` répondent 403 ;
**sans** `teamId`, ils fonctionnent. Les connecteurs doivent être branchés (claude.ai ›
Connecteurs) **avant** l'ouverture de la session.

## Ce que tu ne peux pas faire (dis-le d'emblée, sans contournement)

- Lire la **clé secrète Supabase** (`service_role` / `secret`) : aucun outil ne la donne,
  c'est voulu. L'utilisateur la colle lui-même dans Vercel. Ne la demande **jamais** dans le
  chat et ne cherche pas à la récupérer autrement (fonction Edge, etc.).
- Ouvrir le site déployé : le réseau de la session bloque `*.vercel.app`. Fie-toi à l'état
  du déploiement (`READY`) et dis que la vérification visuelle revient à l'utilisateur.

## Procédure

### 1. Cadrage

- Nom du client → `slug` en minuscules sans accents (ex. « Martin Conseil » → `martin-conseil`).
- `list_projects` (Supabase) : sur l'offre gratuite, **2 projets actifs** maximum en
  général. Si la limite est atteinte, arrête-toi et demande : passer à l'offre payante, ou
  mettre en pause un projet (ex. « CRM Modele vide »). Ne mets rien en pause sans accord.
- Rappelle une fois que l'offre gratuite Vercel est en principe réservée à un usage non
  commercial (à vérifier par l'utilisateur sur vercel.com/pricing).

### 2. Base Supabase

1. `create_project` : nom `CRM <Client>`, organisation ci-dessus, région `eu-west-3`.
   Le serveur gère seul la confirmation de coût. Attends `ACTIVE_HEALTHY` (`get_project`).
2. Applique **dans cet ordre**, avec `apply_migration`, le contenu **exact** des fichiers
   (lis-les avec Read, recopie sans rien changer) :
   1. `supabase/migrations/20261015000001_schema.sql` (nom `20261015000001_schema`)
   2. `supabase/migrations/20261015000002_security.sql`
   3. `supabase/migrations/20261015000003_credit_notes_vat.sql`
   4. `supabase/fresh/20261015000004_crm_schema.sql`
   5. `supabase/fresh/20261015000005_shared_state_final.sql`

   N'applique **pas** `supabase/migrations/…0004`, `…0005`, `…0006` : leurs `delete`,
   `drop table` et `drop policy` font expirer le connecteur (60 s). La variante `fresh/`
   donne exactement le même schéma (vérifié par `npm run test:sql`).
   En cas d'expiration, **vérifie** avec `execute_sql` si la migration est passée (une
   colonne ou table qu'elle crée existe-t-elle ?) avant de réessayer. Ne crée aucun schéma
   de test sur la base du client.

3. **Vérifie l'empreinte** :
   - en local : `PGBIN=/usr/lib/postgresql/16/bin npm run test:sql` affiche
     « Empreinte du schéma de référence : <hash> » (puis `git checkout supabase/seed.sql`,
     régénéré par le test) ;
   - sur Supabase : `execute_sql` avec le contenu de `supabase/tests/fingerprint.sql` ;
   - les deux valeurs doivent être **identiques**. Sinon, ne déploie pas : compare
     colonnes, politiques, contraintes, index, fonctions et droits pour trouver l'écart.
4. `get_publishable_keys` : prends la clé `sb_publishable_…` (non désactivée). Elle est
   publique (destinée au navigateur) : tu peux l'afficher.

### 3. Site Vercel

1. Code d'installation aléatoire :
   `node -e "const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const b=require('crypto').randomBytes(12);let s='';for(const x of b)s+=c[x%c.length];console.log(s.slice(0,4)+'-'+s.slice(4,8)+'-'+s.slice(8))"`
   (préfixe-le du nom court du client, ex. `MARTIN-XXXX-XXXX-XXXX`).
2. `create_project` (Vercel) : nom `crm-<slug>`, `framework: "nextjs"`,
   `gitRepository: { type: "github", repo: "yanissbeddadi-png/bdo-software" }` et :
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co` — `plain`, production + preview + development ;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clé publishable — `plain`, idem ;
   - `BDO_SETUP_CODE` = le code — `sensitive`, production + preview.
3. Ne déploie **pas** encore. Donne à l'utilisateur les deux liens pour la clé secrète :
   - copier : `https://supabase.com/dashboard/project/<ref>/settings/api-keys` (clé _secret_) ;
   - coller : `https://vercel.com/yaniss2/crm-<slug>/settings/environment-variables`,
     nom `SUPABASE_SERVICE_ROLE_KEY`, case « Sensitive » cochée, environnement Production.
4. Quand il confirme : `filter_project_envs` (sans `teamId`) doit lister
   `SUPABASE_SERVICE_ROLE_KEY`. Sinon, redis-le-lui.
5. `create_deployment` : `name` et `project` = le projet, `target: "production"`,
   `gitSource: { type: "github", org: "yanissbeddadi-png", repo: "bdo-software", ref: "main" }`,
   `skipAutoDetectionConfirmation: "1"`. Attends ~2 min (commande `sleep 110` en
   arrière-plan), puis `get_deployment` → `READY` ; `get_project` → domaine
   `crm-<slug>.vercel.app` (sinon `crm-<slug>-yaniss2.vercel.app`).

### 4. Remise à l'utilisateur

Donne :

- le lien `https://crm-<slug>.vercel.app/installation` et le code d'installation ;
- la marche à suivre : « Espace vide », puis Paramètres › Import de fichiers : déposer le
  classeur `Configuration-CRM.xlsx` rempli par le client (et son logo), vérifier l'aperçu,
  Importer ; enfin Utilisateurs et rôles › « Créer les comptes de l'équipe ». Tout reste
  modifiable à la main dans Paramètres ;
- un rappel : le code ne sert qu'une fois ; les mots de passe temporaires ne s'affichent
  qu'une fois ; la vérification visuelle du site revient à l'utilisateur.

Récapitule ce qui a été vérifié (empreinte identique, déploiement `READY`) et ce qui ne
l'a pas été (ouverture du site).
