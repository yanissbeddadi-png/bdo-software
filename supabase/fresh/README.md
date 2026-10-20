# Installation neuve via le connecteur Supabase

Variante **sans instruction destructive** (`delete`, `drop table`, `drop policy`) des
migrations, pour une base **vide** : le connecteur Supabase (MCP) bloque sur ces
instructions. Le schéma obtenu est **identique** à celui de `supabase/migrations/`
(vérifié par `npm run test:sql`, empreinte colonnes / politiques / contraintes / index /
fonctions).

Ordre d'application :

1. `supabase/migrations/20261015000001_schema.sql`
2. `supabase/migrations/20261015000002_security.sql`
3. `supabase/migrations/20261015000003_credit_notes_vat.sql`
4. `supabase/fresh/20261015000004_crm_schema.sql` (reprise des données historiques retirée : sans objet sur une base vide)
5. `supabase/fresh/20261015000005_shared_state_final.sql` (état final après la migration 0006)

Pour une installation manuelle (SQL Editor), utilisez plutôt `supabase/install.sql`.
