-- BDO Software CRM — modèle relation client (miroir de src/lib/database/migrations.ts, migrateToV3).
-- Aucune donnée n'est supprimée sans être reprise :
--   * prospects historiques (leads) → entreprises « prospect » + contacts (la table leads est conservée) ;
--   * étapes contacted / qualification / meeting → qualify / qualify / discussion ;
--   * activités planifiées (done = false) → missions CRM (tasks), puis retirées du journal des interactions.

update public.permissions set label = 'Entreprises & contacts' where key = 'clients.write';
update public.permissions set label = 'Pipeline, opportunités, interactions' where key = 'crm.write';
update public.permissions set label = 'Missions et tâches' where key = 'tasks.write';
update public.permissions set label = 'Défis' where key = 'missions.write';

update public.levels set title = v.title
from (values (1, 'Débutant'), (5, 'Prospecteur'), (10, 'Négociateur'), (20, 'Gestionnaire de comptes'), (35, 'Expert relation client'), (50, 'Stratège commercial'), (75, 'Maître du CRM'), (100, 'Maître du CRM'))
  as v(level, title)
where public.levels.level = v.level;

/* ------------------------------------------------------------------ */
/* Entreprises                                                         */
/* ------------------------------------------------------------------ */

alter table public.clients
  add column relation text not null default 'customer' check (relation in ('prospect', 'customer', 'former', 'partner', 'archived')),
  add column size text not null default '',
  add column country text not null default 'France',
  add column owner_id text references public.employees(id) on delete set null,
  add column source text not null default '';
update public.clients set relation = 'former' where status = 'churned';
create index clients_org_relation_idx on public.clients(organization_id, relation);

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

alter table public.contacts
  add column relation text not null default 'prospect' check (relation in ('prospect', 'customer', 'former', 'partner', 'archived')),
  add column owner_id text references public.employees(id) on delete set null,
  add column source text not null default '',
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  add column archived_at timestamptz,
  add check ((relation = 'archived') = (archived_at is not null));
update public.contacts c set relation = cl.relation, source = cl.source, archived_at = case when cl.relation = 'archived' then now() end
from public.clients cl where cl.id = c.client_id;
create index contacts_org_relation_idx on public.contacts(organization_id, relation);
-- Détection des doublons (avertissement applicatif, jamais de fusion automatique).
create index contacts_org_email_idx on public.contacts(organization_id, lower(email)) where email <> '';

-- Liens documentaires (URL saisies par l'utilisateur ; aucun fichier stocké).
create table public.contact_links (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  url text not null check (url ~* '^https?://'),
  added_at timestamptz not null default now()
);
create index contact_links_contact_idx on public.contact_links(contact_id);

/* ------------------------------------------------------------------ */
/* Reprise des prospects historiques                                   */
/* ------------------------------------------------------------------ */

-- Une entreprise par prospect non rattaché (le nom existant est réutilisé : index unique lower(name)).
insert into public.clients (id, organization_id, name, sector, status, relation, source, notes, created_at, updated_at)
select 'cli_' || regexp_replace(l.id, '^lead_', ''), l.organization_id, l.company, l.sector, 'active',
       case when l.status = 'unqualified' then 'archived' else 'prospect' end, l.source, l.notes, l.created_at, l.updated_at
from public.leads l
where l.converted_client_id is null
on conflict do nothing;

create temporary table lead_company as
select l.id as lead_id, coalesce(l.converted_client_id, c.id) as client_id, l.*
from public.leads l
left join public.clients c on c.organization_id = l.organization_id and lower(c.name) = lower(l.company);

update public.contacts ct set client_id = lc.client_id,
  relation = case lc.status when 'converted' then 'customer' when 'unqualified' then 'archived' else 'prospect' end,
  archived_at = case when lc.status = 'unqualified' then now() else null end,
  priority = lc.priority, source = lc.source
from lead_company lc
where ct.lead_id = lc.lead_id and ct.client_id is null;

insert into public.contacts (id, organization_id, client_id, lead_id, first_name, last_name, email, phone, relation, source, priority, archived_at, is_primary, notes, created_at, updated_at)
select 'con_' || regexp_replace(lc.lead_id, '^lead_', '') || '_m', lc.organization_id, lc.client_id, lc.lead_id,
       split_part(lc.contact_name, ' ', 1), coalesce(nullif(substr(lc.contact_name, length(split_part(lc.contact_name, ' ', 1)) + 2), ''), '—'),
       lc.email, lc.phone,
       case lc.status when 'converted' then 'customer' when 'unqualified' then 'archived' else 'prospect' end,
       lc.source, lc.priority, case when lc.status = 'unqualified' then now() else null end,
       not exists (select 1 from public.contacts p where p.client_id = lc.client_id and p.is_primary), lc.notes, lc.created_at, lc.updated_at
from lead_company lc
where lc.contact_name <> '' and lc.client_id is not null
  and not exists (select 1 from public.contacts x where x.lead_id = lc.lead_id or x.client_id = lc.client_id);

comment on table public.leads is 'Obsolète depuis la migration CRM : les prospects sont des contacts (relation = prospect). Conservée pour l''historique.';

/* ------------------------------------------------------------------ */
/* Opportunités : nouvelles étapes                                     */
/* ------------------------------------------------------------------ */

alter table public.opportunities drop constraint opportunities_stage_check;
alter table public.opportunities drop constraint opportunities_check;
update public.opportunities o set client_id = lc.client_id from lead_company lc where o.client_id is null and o.lead_id = lc.lead_id;
update public.opportunities o set contact_id = (
  select c.id from public.contacts c where c.client_id = o.client_id order by c.is_primary desc, c.created_at limit 1
) where o.contact_id is null and o.client_id is not null;

alter table public.opportunities
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  add column qualified_at timestamptz,
  add column archived_at timestamptz;
update public.opportunities set stage = case stage when 'contacted' then 'qualify' when 'qualification' then 'qualify' when 'meeting' then 'discussion' else stage end;
update public.opportunities set qualified_at = updated_at where stage in ('discussion', 'proposal', 'negotiation', 'won');
alter table public.opportunities
  add constraint opportunities_stage_check check (stage in ('new', 'qualify', 'discussion', 'proposal', 'negotiation', 'won', 'lost')),
  add constraint opportunities_link_check check (client_id is not null or contact_id is not null or lead_id is not null);

/* ------------------------------------------------------------------ */
/* Missions CRM (tasks)                                                */
/* ------------------------------------------------------------------ */

alter table public.tasks
  add column type text not null default 'internal' check (type in ('call', 'email', 'followup', 'meeting', 'qualification', 'proposal_prep', 'proposal_send', 'sales_followup', 'retention', 'request', 'other', 'internal')),
  add column contact_id text references public.contacts(id) on delete set null,
  add column opportunity_id text references public.opportunities(id) on delete set null,
  add column due_time text check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column result text not null default '';
create index tasks_org_type_due_idx on public.tasks(organization_id, type, status, due_date);
create index tasks_contact_idx on public.tasks(contact_id);
create index tasks_opportunity_idx on public.tasks(opportunity_id);

-- Prochaine action texte d'un prospect historique → mission de relance datée.
insert into public.tasks (id, organization_id, title, description, type, client_id, contact_id, priority, status, complexity, due_date)
select 'tsk_mig_' || lc.lead_id, lc.organization_id, lc.next_action, 'Prochaine action reprise du prospect historique.', 'followup', lc.client_id,
       (select c.id from public.contacts c where c.client_id = lc.client_id order by c.is_primary desc limit 1), lc.priority, 'todo', 'simple', lc.next_action_date
from lead_company lc
where lc.status not in ('converted', 'unqualified') and lc.next_action <> '' and lc.next_action_date is not null;

-- Activités planifiées → missions (la date reste celle prévue ; l'heure est convertie dans le fuseau de l'organisation).
insert into public.tasks (id, organization_id, title, description, type, client_id, contact_id, opportunity_id, assignee_id, priority, status, complexity, due_date, due_time)
select 'tsk_mig_' || a.id, a.organization_id, a.subject, a.notes,
       case a.type when 'call' then 'call' when 'email' then 'email' when 'meeting' then 'meeting' when 'demo' then 'meeting' when 'followup' then 'followup' else 'other' end,
       coalesce(a.client_id, lc.client_id),
       (select o.contact_id from public.opportunities o where o.id = a.opportunity_id),
       a.opportunity_id, a.owner_id, 'normal', 'todo', 'simple',
       (a.date at time zone coalesce(org.settings->'company'->>'timezone', 'Europe/Paris'))::date,
       to_char(a.date at time zone coalesce(org.settings->'company'->>'timezone', 'Europe/Paris'), 'HH24:MI')
from public.sales_activities a
join public.organizations org on org.id = a.organization_id
left join lead_company lc on lc.lead_id = a.lead_id
where a.done = false;
delete from public.sales_activities where done = false and exists (select 1 from public.tasks t where t.id = 'tsk_mig_' || sales_activities.id);

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

alter table public.sales_activities drop constraint sales_activities_type_check;
alter table public.sales_activities
  add constraint sales_activities_type_check check (type in ('call', 'email', 'meeting', 'demo', 'message', 'followup', 'note', 'stage_change', 'task_done')),
  add column contact_id text references public.contacts(id) on delete set null,
  add column direction text check (direction in ('in', 'out')),
  add column outcome text not null default '',
  add column next_step text not null default '',
  add column task_id text references public.tasks(id) on delete set null;
update public.sales_activities a set client_id = lc.client_id from lead_company lc where a.client_id is null and a.lead_id = lc.lead_id;
create index sales_activities_contact_idx on public.sales_activities(contact_id, date desc);
create index sales_activities_opportunity_idx on public.sales_activities(opportunity_id, date desc);

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

alter table public.notes
  add column contact_id text references public.contacts(id) on delete cascade,
  add column opportunity_id text references public.opportunities(id) on delete set null;
create index notes_contact_idx on public.notes(contact_id);

/* ------------------------------------------------------------------ */
/* Paramètres CRM (seuils d'automatisation, jours ouvrés)              */
/* ------------------------------------------------------------------ */

update public.organizations
set settings = jsonb_set(settings, '{crm}', coalesce(settings->'crm', '{"inactivityDays": 45, "proposalPendingDays": 10, "newProspectDays": 7, "workingDays": [1, 2, 3, 4, 5], "dailyCallXpCap": 8}'::jsonb));

/* ------------------------------------------------------------------ */
/* Sécurité                                                            */
/* ------------------------------------------------------------------ */

alter table public.contact_links enable row level security;
create policy contact_links_select on public.contact_links for select to authenticated using (app.is_member(organization_id));
create policy contact_links_insert on public.contact_links for insert to authenticated with check (app.has_permission(organization_id, 'clients.write'));
create policy contact_links_delete on public.contact_links for delete to authenticated using (app.has_permission(organization_id, 'clients.write'));

drop table lead_company;
