-- BDO Software CRM — historique des versions du document partagé (points de restauration).
--
-- Copies de `app_state.data` prises par le serveur : automatiquement (au plus une par heure,
-- état PRÉCÉDENT un enregistrement), à la demande du directeur commercial, et avant chaque
-- import, remplacement, réinitialisation ou restauration. Lues et écrites UNIQUEMENT par les
-- Server Actions (clé de service) : RLS activée sans aucune politique, aucun droit pour les
-- navigateurs. La rétention (48 h complètes, puis un par jour sur 30 jours, points nommés
-- 90 jours, 200 lignes au plus) est appliquée par le serveur.

create table public.app_state_history (
  id bigint generated always as identity primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  version bigint not null,
  data jsonb not null,
  kind text not null check (kind in ('auto', 'manual', 'before_import', 'before_reset', 'before_replace', 'before_restore')),
  label text check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index app_state_history_org_created_idx on public.app_state_history (organization_id, created_at desc);

alter table public.app_state_history enable row level security;
revoke all on public.app_state_history from anon, authenticated;
