-- BDO Software CRM — mode multi-utilisateur (comptes, sessions, données partagées).
--
-- L'état métier d'une organisation est conservé dans un document versionné (`app_state`)
-- et modifié UNIQUEMENT côté serveur : chaque action passe par une Server Action qui
-- authentifie l'utilisateur, lit son rôle dans `organization_members`, exécute la commande
-- métier (mêmes règles et permissions qu'en démonstration) puis enregistre la nouvelle
-- version avec un contrôle de concurrence optimiste. Les navigateurs n'ont qu'un droit de
-- lecture (RLS) ; la clé de service n'est jamais exposée au client.

alter table public.organization_members
  add column email text not null default '',
  -- Identifiant du collaborateur (fiche Équipe) associé au compte, pour « Mes prospects », « Mes missions »…
  add column employee_id text,
  add column active boolean not null default true;

create table public.app_state (
  organization_id text primary key references public.organizations(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_state enable row level security;
-- Lecture réservée aux membres actifs de l'organisation ; aucune écriture directe.
create policy app_state_select on public.app_state for select to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = app_state.organization_id and m.user_id = auth.uid() and m.active
  ));

revoke insert, update, delete on public.app_state from anon, authenticated;
grant select on public.app_state to authenticated;

-- Les Server Actions écrivent avec le rôle `service_role` : il doit pouvoir utiliser le
-- type `app.app_role` (rôles des membres) et les fonctions du schéma `app`.
grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;
