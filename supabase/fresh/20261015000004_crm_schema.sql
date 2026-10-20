-- BDO Software CRM — modèle relation client, installation neuve : schéma seul.
-- Équivalent de supabase/migrations/20261015000004_crm.sql sur une base vide (la reprise
-- des prospects historiques, la table temporaire et ses suppressions sont sans objet).

update public.permissions set label = 'Entreprises & contacts' where key = 'clients.write';
update public.permissions set label = 'Pipeline, opportunités, interactions' where key = 'crm.write';
update public.permissions set label = 'Missions et tâches' where key = 'tasks.write';
update public.permissions set label = 'Défis' where key = 'missions.write';

update public.levels set title = v.title
from (values (1, 'Débutant'), (5, 'Prospecteur'), (10, 'Négociateur'), (20, 'Gestionnaire de comptes'), (35, 'Expert relation client'), (50, 'Stratège commercial'), (75, 'Maître du CRM'), (100, 'Maître du CRM'))
  as v(level, title)
where public.levels.level = v.level;

alter table public.clients
  add column relation text not null default 'customer' check (relation in ('prospect', 'customer', 'former', 'partner', 'archived')),
  add column size text not null default '',
  add column country text not null default 'France',
  add column owner_id text references public.employees(id) on delete set null,
  add column source text not null default '';
create index clients_org_relation_idx on public.clients(organization_id, relation);

alter table public.contacts
  add column relation text not null default 'prospect' check (relation in ('prospect', 'customer', 'former', 'partner', 'archived')),
  add column owner_id text references public.employees(id) on delete set null,
  add column source text not null default '',
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  add column archived_at timestamptz,
  add check ((relation = 'archived') = (archived_at is not null));
create index contacts_org_relation_idx on public.contacts(organization_id, relation);
create index contacts_org_email_idx on public.contacts(organization_id, lower(email)) where email <> '';

create table public.contact_links (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  url text not null check (url ~* '^https?://'),
  added_at timestamptz not null default now()
);
create index contact_links_contact_idx on public.contact_links(contact_id);

comment on table public.leads is 'Obsolète depuis la migration CRM : les prospects sont des contacts (relation = prospect). Conservée pour l''historique.';

alter table public.opportunities drop constraint if exists opportunities_stage_check;
alter table public.opportunities drop constraint if exists opportunities_check;
alter table public.opportunities
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  add column qualified_at timestamptz,
  add column archived_at timestamptz;
alter table public.opportunities
  add constraint opportunities_stage_check check (stage in ('new', 'qualify', 'discussion', 'proposal', 'negotiation', 'won', 'lost')),
  add constraint opportunities_link_check check (client_id is not null or contact_id is not null or lead_id is not null);

alter table public.tasks
  add column type text not null default 'internal' check (type in ('call', 'email', 'followup', 'meeting', 'qualification', 'proposal_prep', 'proposal_send', 'sales_followup', 'retention', 'request', 'other', 'internal')),
  add column contact_id text references public.contacts(id) on delete set null,
  add column opportunity_id text references public.opportunities(id) on delete set null,
  add column due_time text check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column result text not null default '';
create index tasks_org_type_due_idx on public.tasks(organization_id, type, status, due_date);
create index tasks_contact_idx on public.tasks(contact_id);
create index tasks_opportunity_idx on public.tasks(opportunity_id);

alter table public.sales_activities drop constraint if exists sales_activities_type_check;
alter table public.sales_activities
  add constraint sales_activities_type_check check (type in ('call', 'email', 'meeting', 'demo', 'message', 'followup', 'note', 'stage_change', 'task_done')),
  add column contact_id text references public.contacts(id) on delete set null,
  add column direction text check (direction in ('in', 'out')),
  add column outcome text not null default '',
  add column next_step text not null default '',
  add column task_id text references public.tasks(id) on delete set null;
create index sales_activities_contact_idx on public.sales_activities(contact_id, date desc);
create index sales_activities_opportunity_idx on public.sales_activities(opportunity_id, date desc);

alter table public.notes
  add column contact_id text references public.contacts(id) on delete cascade,
  add column opportunity_id text references public.opportunities(id) on delete set null;
create index notes_contact_idx on public.notes(contact_id);

alter table public.contact_links enable row level security;
create policy contact_links_select on public.contact_links for select to authenticated using (app.is_member(organization_id));
create policy contact_links_insert on public.contact_links for insert to authenticated with check (app.has_permission(organization_id, 'clients.write'));
create policy contact_links_delete on public.contact_links for delete to authenticated using (app.has_permission(organization_id, 'clients.write'));
