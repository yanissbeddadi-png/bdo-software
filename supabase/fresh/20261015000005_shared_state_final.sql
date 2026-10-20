-- BDO Software CRM — mode multi-utilisateur, installation neuve : état final après
-- 20261020000006_private_state (le document partagé n'est lisible que par le serveur).

alter table public.organization_members
  add column email text not null default '',
  add column employee_id text,
  add column active boolean not null default true;

create table public.app_state (
  organization_id text primary key references public.organizations(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- RLS activée sans aucune politique : ni lecture ni écriture pour anon / authenticated.
alter table public.app_state enable row level security;
revoke all on public.app_state from anon, authenticated;

grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;
