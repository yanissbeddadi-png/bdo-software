-- BDO Software CRM — installation complète de la base Supabase (fichier généré).
-- À exécuter UNE fois dans un projet Supabase neuf : Dashboard › SQL Editor › New query,
-- coller tout le contenu puis « Run ». Source : supabase/migrations/*.sql.
-- ===== 20261015000001_schema.sql =====
-- BDO Software — schéma relationnel cible (PostgreSQL / Supabase)
-- Montants : centimes entiers (bigint). Taux de TVA : points de base (2000 = 20 %).
-- Toutes les données métier sont rattachées à une organisation (multi-entreprise).

create extension if not exists pgcrypto;
create schema if not exists app;

create type app.app_role as enum ('admin', 'dirigeant', 'finance', 'commercial', 'chef_projet', 'collaborateur');

-- Horodatage automatique de updated_at
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

/* ------------------------------------------------------------------ */
/* Organisation, membres, rôles et permissions                         */
/* ------------------------------------------------------------------ */

create table public.organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(name) between 1 and 200),
  settings jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app.app_role not null default 'collaborateur',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

create table public.permissions (
  key text primary key,
  label text not null
);

create table public.roles (
  role app.app_role primary key,
  label text not null
);

create table public.role_permissions (
  role app.app_role not null references public.roles(role) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);

/* ------------------------------------------------------------------ */
/* Clients, contacts, prospects                                        */
/* ------------------------------------------------------------------ */

create table public.clients (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  sector text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive', 'churned')),
  city text not null default '',
  website text not null default '',
  satisfaction smallint check (satisfaction between 1 and 5),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Doublons évidents : un nom normalisé unique par organisation.
create unique index clients_org_name_uniq on public.clients(organization_id, lower(name));
create index clients_org_status_idx on public.clients(organization_id, status);

create table public.client_documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  name text not null,
  kind text not null default 'Autre',
  created_at timestamptz not null default now()
);

create table public.leads (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  company text not null,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  sector text not null default '',
  source text not null default '',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'unqualified', 'converted')),
  next_action text not null default '',
  next_action_date date,
  converted_client_id text references public.clients(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_org_status_idx on public.leads(organization_id, status);
create index leads_next_action_idx on public.leads(organization_id, next_action_date);

create table public.contacts (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  client_id text references public.clients(id) on delete cascade,
  lead_id text references public.leads(id) on delete set null,
  first_name text not null,
  last_name text not null,
  job_title text not null default '',
  email text not null default '',
  phone text not null default '',
  is_primary boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_client_idx on public.contacts(client_id);
create unique index contacts_primary_uniq on public.contacts(client_id) where is_primary;

/* ------------------------------------------------------------------ */
/* Équipe                                                              */
/* ------------------------------------------------------------------ */

create table public.employees (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  job_title text not null,
  department text not null check (department in ('direction', 'development', 'sales', 'marketing', 'finance', 'support', 'operations')),
  email text not null,
  hire_date date not null,
  status text not null default 'active' check (status in ('active', 'leave', 'left')),
  monthly_cost bigint not null default 0 check (monthly_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.skills (
  key text primary key,
  label text not null
);

create table public.employee_skills (
  employee_id text not null references public.employees(id) on delete cascade,
  skill text not null references public.skills(key) on delete cascade,
  level smallint not null check (level between 1 and 5),
  primary key (employee_id, skill)
);

/* ------------------------------------------------------------------ */
/* Ventes                                                              */
/* ------------------------------------------------------------------ */

create table public.opportunities (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  client_id text references public.clients(id) on delete set null,
  lead_id text references public.leads(id) on delete set null,
  contact_id text references public.contacts(id) on delete set null,
  amount bigint not null default 0 check (amount >= 0),
  probability smallint not null default 10 check (probability between 0 and 100),
  stage text not null default 'new' check (stage in ('new', 'contacted', 'qualification', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close_date date not null,
  source text not null default '',
  owner_id text references public.employees(id) on delete set null,
  last_interaction_at timestamptz not null default now(),
  next_action text not null default '',
  notes text not null default '',
  closed_at timestamptz,
  lost_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or lead_id is not null),
  check ((stage in ('won', 'lost')) = (closed_at is not null))
);
create index opportunities_org_stage_idx on public.opportunities(organization_id, stage);

create table public.products (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text not null,
  description text not null default '',
  type text not null check (type in ('saas', 'license', 'custom_dev', 'maintenance', 'consulting', 'integration', 'support')),
  category text not null default '',
  unit_price bigint not null check (unit_price >= 0),
  unit_cost bigint not null check (unit_cost >= 0),
  billing_mode text not null check (billing_mode in ('one_time', 'monthly', 'yearly', 'daily', 'hourly')),
  vat_rate integer not null default 2000 check (vat_rate between 0 and 10000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table public.quotes (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  number text not null,
  client_id text not null references public.clients(id) on delete restrict,
  opportunity_id text references public.opportunities(id) on delete set null,
  issue_date date not null,
  expiry_date date not null check (expiry_date >= issue_date),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'refused', 'expired')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

-- Les lignes figent prix et TVA : modifier le catalogue ne réécrit pas l'historique.
create table public.quote_items (
  id text primary key default gen_random_uuid()::text,
  quote_id text not null references public.quotes(id) on delete cascade,
  position smallint not null default 0,
  product_id text references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price bigint not null,
  vat_rate integer not null check (vat_rate between 0 and 10000)
);
create index quote_items_quote_idx on public.quote_items(quote_id);

create table public.sales_activities (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'meeting', 'demo', 'followup', 'note')),
  date timestamptz not null,
  subject text not null,
  notes text not null default '',
  client_id text references public.clients(id) on delete cascade,
  lead_id text references public.leads(id) on delete cascade,
  opportunity_id text references public.opportunities(id) on delete set null,
  invoice_id text,
  owner_id text references public.employees(id) on delete set null,
  done boolean not null default true,
  created_at timestamptz not null default now()
);
create index sales_activities_org_date_idx on public.sales_activities(organization_id, date desc);

/* ------------------------------------------------------------------ */
/* Projets & tâches                                                    */
/* ------------------------------------------------------------------ */

create table public.projects (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  client_id text not null references public.clients(id) on delete restrict,
  opportunity_id text references public.opportunities(id) on delete set null,
  description text not null default '',
  manager_id text references public.employees(id) on delete set null,
  start_date date not null,
  due_date date not null check (due_date >= start_date),
  budget bigint not null default 0 check (budget >= 0),
  sale_price bigint not null default 0 check (sale_price >= 0),
  estimated_cost bigint not null default 0 check (estimated_cost >= 0),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'planned' check (status in ('to_plan', 'planned', 'in_progress', 'on_hold', 'at_risk', 'done', 'cancelled')),
  risks text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check ((status = 'done') = (completed_at is not null))
);
create index projects_org_status_idx on public.projects(organization_id, status);

create table public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  employee_id text not null references public.employees(id) on delete cascade,
  primary key (project_id, employee_id)
);

create table public.project_milestones (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  due_date date not null,
  done boolean not null default false,
  done_at timestamptz
);

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

create table public.subscriptions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  client_id text not null references public.clients(id) on delete restrict,
  product_id text references public.products(id) on delete set null,
  offer text not null,
  amount bigint not null check (amount > 0),
  periodicity text not null check (periodicity in ('monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  renewal_terms text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'cancelled' or end_date is not null)
);
create index subscriptions_org_status_idx on public.subscriptions(organization_id, status);

create table public.invoices (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  number text not null,
  client_id text not null references public.clients(id) on delete restrict,
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  -- Statut stocké ; « payée », « partiellement payée » et « en retard » sont calculés (vue invoice_balances).
  base_status text not null default 'draft' check (base_status in ('draft', 'issued', 'cancelled')),
  project_id text references public.projects(id) on delete set null,
  quote_id text references public.quotes(id) on delete set null,
  subscription_id text references public.subscriptions(id) on delete set null,
  notes text not null default '',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);
create index invoices_org_issue_idx on public.invoices(organization_id, issue_date desc);
create index invoices_org_due_idx on public.invoices(organization_id, due_date) where base_status = 'issued';
-- Idempotence de la facturation récurrente : une échéance d'abonnement n'est facturée qu'une fois.
create unique index invoices_subscription_period_uniq on public.invoices(subscription_id, issue_date) where subscription_id is not null and base_status <> 'cancelled';

alter table public.sales_activities add constraint sales_activities_invoice_fk foreign key (invoice_id) references public.invoices(id) on delete set null;
alter table public.quotes add column invoice_id text references public.invoices(id) on delete set null;

create table public.invoice_items (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references public.invoices(id) on delete cascade,
  position smallint not null default 0,
  product_id text references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price bigint not null,
  vat_rate integer not null check (vat_rate between 0 and 10000)
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);

create table public.payments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  invoice_id text not null references public.invoices(id) on delete restrict,
  date date not null,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('transfer', 'card', 'direct_debit', 'check', 'cash')),
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments(invoice_id);
create index payments_org_date_idx on public.payments(organization_id, date);

create table public.expense_categories (
  key text primary key,
  label text not null,
  recurring boolean not null default false
);

create table public.expenses (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  label text not null,
  supplier text not null,
  category text not null references public.expense_categories(key),
  date date not null,
  amount_ht bigint not null check (amount_ht > 0),
  vat_rate integer not null default 2000 check (vat_rate between 0 and 10000),
  paid boolean not null default false,
  paid_date date,
  due_date date not null,
  project_id text references public.projects(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid = (paid_date is not null))
);
create index expenses_org_date_idx on public.expenses(organization_id, date);
create index expenses_unpaid_idx on public.expenses(organization_id, due_date) where not paid;

create table public.tasks (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id text references public.employees(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting', 'done', 'cancelled')),
  complexity text not null default 'standard' check (complexity in ('simple', 'standard', 'complex')),
  due_date date,
  estimate_hours numeric(8, 2) not null default 0 check (estimate_hours >= 0),
  actual_hours numeric(8, 2) not null default 0 check (actual_hours >= 0),
  project_id text references public.projects(id) on delete restrict,
  client_id text references public.clients(id) on delete set null,
  goal_id text,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null))
);
create index tasks_org_status_due_idx on public.tasks(organization_id, status, due_date);
create index tasks_project_idx on public.tasks(project_id);
create index tasks_assignee_idx on public.tasks(assignee_id);

create table public.task_dependencies (
  task_id text not null references public.tasks(id) on delete cascade,
  depends_on_id text not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create table public.task_comments (
  id text primary key default gen_random_uuid()::text,
  task_id text not null references public.tasks(id) on delete cascade,
  author text not null,
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Objectifs                                                           */
/* ------------------------------------------------------------------ */

create table public.goals (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  title text not null,
  description text not null default '',
  type text not null check (type in ('financial', 'commercial', 'operational', 'customer', 'growth', 'team')),
  period_label text not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  owner_id text references public.employees(id) on delete set null,
  metric text not null default 'manual',
  start_value numeric not null,
  target_value numeric not null check (target_value <> start_value),
  manual_value numeric not null default 0,
  unit text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks add constraint tasks_goal_fk foreign key (goal_id) references public.goals(id) on delete set null;

create table public.goal_key_results (
  id text primary key default gen_random_uuid()::text,
  goal_id text not null references public.goals(id) on delete cascade,
  title text not null,
  target numeric not null,
  current numeric not null default 0,
  unit text not null default ''
);

/* ------------------------------------------------------------------ */
/* Gamification                                                        */
/* ------------------------------------------------------------------ */

create table public.levels (
  level smallint primary key check (level between 1 and 100),
  title text not null
);

create table public.achievements (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  condition text not null,
  icon text not null
);

create table public.user_achievements (
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (organization_id, achievement_id)
);

create table public.missions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null,
  type text not null check (type in ('daily', 'weekly', 'monthly', 'strategic', 'custom')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'epic')),
  priority text not null default 'normal',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  start_date date not null,
  due_date date not null,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  condition jsonb not null default '{"kind":"manual"}'::jsonb,
  entity_type text,
  entity_id text,
  source text not null check (source in ('auto', 'custom', 'seed')),
  auto_key text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Idempotence des missions automatiques : une même situation ne recrée pas la mission.
create unique index missions_auto_key_uniq on public.missions(organization_id, auto_key) where auto_key is not null;

create table public.mission_progress (
  id bigint generated always as identity primary key,
  mission_id text not null references public.missions(id) on delete cascade,
  at timestamptz not null default now(),
  text text not null
);

create table public.xp_transactions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  at timestamptz not null,
  amount integer not null check (amount > 0),
  reason text not null,
  source text not null,
  entity_type text,
  entity_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);
-- Garantie forte : une récompense par clé d'idempotence.
create unique index xp_transactions_key_uniq on public.xp_transactions(organization_id, idempotency_key);

create table public.retired_xp_keys (
  organization_id text not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  retired_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);

create table public.company_progress (
  organization_id text primary key references public.organizations(id) on delete cascade,
  announced_level smallint not null default 1,
  announced_rank smallint not null default 1,
  progression_start date not null default current_date,
  no_late_task_since date,
  last_cash_review_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.progression_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  at timestamptz not null,
  kind text not null check (kind in ('xp', 'level_up', 'mission', 'achievement', 'rank', 'reward')),
  message text not null,
  key text not null,
  unique (organization_id, key)
);

/* ------------------------------------------------------------------ */
/* Notifications, activité, audit, notes                               */
/* ------------------------------------------------------------------ */

create table public.notifications (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  key text not null,
  category text not null check (category in ('finance', 'commercial', 'projet', 'taches', 'objectifs', 'gamification', 'systeme')),
  severity text not null check (severity in ('info', 'success', 'warning', 'danger')),
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.activity_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null,
  description text not null,
  entity_type text,
  entity_id text
);
create index activity_events_org_at_idx on public.activity_events(organization_id, at desc);

create table public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,
  actor text not null,
  role app.app_role not null,
  action text not null,
  entity_type text,
  entity_id text,
  details text not null default ''
);
create index audit_logs_org_at_idx on public.audit_logs(organization_id, at desc);

create table public.notes (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  title text not null,
  body text not null default '',
  client_id text references public.clients(id) on delete cascade,
  project_id text references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Déclencheurs updated_at
do $$
declare t text;
begin
  foreach t in array array['organizations', 'organization_members', 'clients', 'leads', 'contacts', 'employees', 'opportunities', 'products', 'quotes', 'projects', 'subscriptions', 'invoices', 'expenses', 'tasks', 'goals', 'notes'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* Vues de calcul                                                      */
/* ------------------------------------------------------------------ */

-- Totaux par facture : HT ligne arrondi, TVA arrondie par taux (même règle que src/lib/calculations/money.ts).
create view public.invoice_totals with (security_invoker = true) as
with lines as (
  select invoice_id, vat_rate, sum(round(quantity * unit_price)) as base_ht
  from public.invoice_items group by invoice_id, vat_rate
)
select i.id as invoice_id, i.organization_id,
  coalesce(sum(l.base_ht), 0)::bigint as total_ht,
  coalesce(sum(round(l.base_ht * l.vat_rate / 10000.0)), 0)::bigint as total_vat,
  (coalesce(sum(l.base_ht), 0) + coalesce(sum(round(l.base_ht * l.vat_rate / 10000.0)), 0))::bigint as total_ttc
from public.invoices i left join lines l on l.invoice_id = i.id
group by i.id, i.organization_id;

create view public.invoice_balances with (security_invoker = true) as
select i.id as invoice_id, i.organization_id, t.total_ttc,
  coalesce(p.paid, 0)::bigint as paid,
  case when i.base_status = 'issued' then greatest(t.total_ttc - coalesce(p.paid, 0), 0) else 0 end::bigint as balance,
  case
    when i.base_status in ('draft', 'cancelled') then i.base_status
    when t.total_ttc > 0 and coalesce(p.paid, 0) >= t.total_ttc then 'paid'
    when i.due_date < current_date then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partially_paid'
    else 'issued'
  end as status
from public.invoices i
join public.invoice_totals t on t.invoice_id = i.id
left join (select invoice_id, sum(amount) as paid from public.payments group by invoice_id) p on p.invoice_id = i.id;

-- ===== 20261015000002_security.sql =====
-- BDO Software — rôles, permissions et politiques Row Level Security.
-- Les permissions sont appliquées côté serveur : un rôle ne peut écrire que dans
-- les tables autorisées par la matrice role_permissions (miroir de src/lib/permissions).

insert into public.roles (role, label) values
  ('admin', 'Administrateur'), ('dirigeant', 'Dirigeant'), ('finance', 'Finance'),
  ('commercial', 'Commercial'), ('chef_projet', 'Chef de projet'), ('collaborateur', 'Collaborateur');

insert into public.permissions (key, label) values
  ('clients.write', 'Clients & contacts'), ('crm.write', 'Prospects, opportunités, activités'), ('quotes.write', 'Devis'),
  ('invoices.write', 'Factures'), ('payments.write', 'Paiements'), ('expenses.write', 'Dépenses'),
  ('subscriptions.write', 'Abonnements'), ('products.write', 'Catalogue'), ('projects.write', 'Projets'),
  ('tasks.write', 'Tâches'), ('team.write', 'Équipe'), ('goals.write', 'Objectifs'), ('missions.write', 'Missions'),
  ('notes.write', 'Notes'), ('settings.write', 'Paramètres'), ('data.admin', 'Réinitialisation / import');

insert into public.role_permissions (role, permission)
select r.role, p.key from public.roles r cross join public.permissions p where r.role in ('admin', 'dirigeant');
insert into public.role_permissions (role, permission) values
  ('finance', 'clients.write'), ('finance', 'invoices.write'), ('finance', 'payments.write'), ('finance', 'expenses.write'),
  ('finance', 'subscriptions.write'), ('finance', 'products.write'), ('finance', 'quotes.write'), ('finance', 'tasks.write'),
  ('finance', 'goals.write'), ('finance', 'missions.write'), ('finance', 'notes.write'),
  ('commercial', 'clients.write'), ('commercial', 'crm.write'), ('commercial', 'quotes.write'), ('commercial', 'tasks.write'),
  ('commercial', 'missions.write'), ('commercial', 'notes.write'),
  ('chef_projet', 'projects.write'), ('chef_projet', 'tasks.write'), ('chef_projet', 'expenses.write'),
  ('chef_projet', 'missions.write'), ('chef_projet', 'notes.write'),
  ('collaborateur', 'tasks.write'), ('collaborateur', 'missions.write'), ('collaborateur', 'notes.write');

insert into public.expense_categories (key, label, recurring) values
  ('salaries', 'Salaires', true), ('software', 'Logiciels', true), ('hosting', 'Hébergement', true),
  ('marketing', 'Marketing', false), ('contractors', 'Prestataires', false), ('hardware', 'Matériel', false),
  ('office', 'Locaux', true), ('travel', 'Déplacements', false), ('bank_fees', 'Frais bancaires', true), ('misc', 'Divers', false);

insert into public.skills (key, label) values
  ('development', 'Développement'), ('sales', 'Vente'), ('project_management', 'Gestion de projet'),
  ('support', 'Support'), ('finance', 'Finance'), ('communication', 'Communication'), ('analysis', 'Analyse');

insert into public.levels (level, title) values
  (1, 'Fondateur'), (5, 'Gestionnaire'), (10, 'Entrepreneur'), (20, 'Stratège'), (35, 'Directeur'),
  (50, 'Visionnaire'), (75, 'Magnat du numérique'), (100, 'Légende entrepreneuriale');

/* ------------------------------------------------------------------ */
/* Fonctions d'autorisation (security definer, search_path figé)       */
/* ------------------------------------------------------------------ */

create or replace function app.is_member(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m where m.organization_id = org and m.user_id = auth.uid());
$$;

create or replace function app.has_permission(org text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = org and m.user_id = auth.uid() and rp.permission = perm
  );
$$;

revoke all on function app.is_member(text) from public;
revoke all on function app.has_permission(text, text) from public;
grant usage on schema app to authenticated;
grant execute on function app.is_member(text) to authenticated;
grant execute on function app.has_permission(text, text) to authenticated;

/* ------------------------------------------------------------------ */
/* Politiques RLS                                                      */
/* ------------------------------------------------------------------ */

alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select to authenticated using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated using (app.has_permission(id, 'settings.write')) with check (app.has_permission(id, 'settings.write'));

alter table public.organization_members enable row level security;
create policy members_select on public.organization_members for select to authenticated using (app.is_member(organization_id));
create policy members_admin on public.organization_members for all to authenticated using (app.has_permission(organization_id, 'settings.write')) with check (app.has_permission(organization_id, 'settings.write'));

-- Tables de référence : lecture pour tout utilisateur authentifié, écriture réservée au service.
do $$
declare t text;
begin
  foreach t in array array['roles', 'permissions', 'role_permissions', 'expense_categories', 'skills', 'levels', 'achievements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Tables métier portant organization_id : lecture par les membres, écriture selon la permission.
do $$
declare
  rec record;
begin
  for rec in select * from (values
    ('clients', 'clients.write'), ('client_documents', 'clients.write'), ('contacts', 'clients.write'),
    ('leads', 'crm.write'), ('opportunities', 'crm.write'), ('sales_activities', 'crm.write'),
    ('products', 'products.write'), ('quotes', 'quotes.write'),
    ('invoices', 'invoices.write'), ('payments', 'payments.write'), ('expenses', 'expenses.write'),
    ('subscriptions', 'subscriptions.write'), ('projects', 'projects.write'), ('tasks', 'tasks.write'),
    ('employees', 'team.write'), ('goals', 'goals.write'), ('missions', 'missions.write'), ('notes', 'notes.write')
  ) as v(tbl, perm) loop
    execute format('alter table public.%I enable row level security', rec.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', rec.tbl || '_select', rec.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.has_permission(organization_id, %L))', rec.tbl || '_insert', rec.tbl, rec.perm);
    execute format('create policy %I on public.%I for update to authenticated using (app.has_permission(organization_id, %L)) with check (app.has_permission(organization_id, %L))', rec.tbl || '_update', rec.tbl, rec.perm, rec.perm);
    execute format('create policy %I on public.%I for delete to authenticated using (app.has_permission(organization_id, %L))', rec.tbl || '_delete', rec.tbl, rec.perm);
  end loop;
end $$;

-- Tables enfants sans organization_id : contrôle via la ligne parente.
alter table public.quote_items enable row level security;
create policy quote_items_select on public.quote_items for select to authenticated using (exists (select 1 from public.quotes q where q.id = quote_id and app.is_member(q.organization_id)));
create policy quote_items_write on public.quote_items for all to authenticated using (exists (select 1 from public.quotes q where q.id = quote_id and app.has_permission(q.organization_id, 'quotes.write'))) with check (exists (select 1 from public.quotes q where q.id = quote_id and app.has_permission(q.organization_id, 'quotes.write')));

alter table public.invoice_items enable row level security;
create policy invoice_items_select on public.invoice_items for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id and app.is_member(i.organization_id)));
-- Les lignes d'une facture émise sont figées : seule une facture brouillon peut voir ses lignes modifiées.
create policy invoice_items_write on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.base_status = 'draft' and app.has_permission(i.organization_id, 'invoices.write')))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.base_status = 'draft' and app.has_permission(i.organization_id, 'invoices.write')));

alter table public.project_members enable row level security;
create policy project_members_select on public.project_members for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and app.is_member(p.organization_id)));
create policy project_members_write on public.project_members for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and app.has_permission(p.organization_id, 'projects.write'))) with check (exists (select 1 from public.projects p where p.id = project_id and app.has_permission(p.organization_id, 'projects.write')));

alter table public.project_milestones enable row level security;
create policy project_milestones_select on public.project_milestones for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and app.is_member(p.organization_id)));
create policy project_milestones_write on public.project_milestones for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and app.has_permission(p.organization_id, 'projects.write'))) with check (exists (select 1 from public.projects p where p.id = project_id and app.has_permission(p.organization_id, 'projects.write')));

alter table public.task_dependencies enable row level security;
create policy task_dependencies_select on public.task_dependencies for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and app.is_member(t.organization_id)));
create policy task_dependencies_write on public.task_dependencies for all to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and app.has_permission(t.organization_id, 'tasks.write'))) with check (exists (select 1 from public.tasks t where t.id = task_id and app.has_permission(t.organization_id, 'tasks.write')));

alter table public.task_comments enable row level security;
create policy task_comments_select on public.task_comments for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and app.is_member(t.organization_id)));
create policy task_comments_insert on public.task_comments for insert to authenticated with check (exists (select 1 from public.tasks t where t.id = task_id and app.has_permission(t.organization_id, 'tasks.write')));

alter table public.goal_key_results enable row level security;
create policy goal_key_results_select on public.goal_key_results for select to authenticated using (exists (select 1 from public.goals g where g.id = goal_id and app.is_member(g.organization_id)));
create policy goal_key_results_write on public.goal_key_results for all to authenticated using (exists (select 1 from public.goals g where g.id = goal_id and app.has_permission(g.organization_id, 'goals.write'))) with check (exists (select 1 from public.goals g where g.id = goal_id and app.has_permission(g.organization_id, 'goals.write')));

alter table public.employee_skills enable row level security;
create policy employee_skills_select on public.employee_skills for select to authenticated using (exists (select 1 from public.employees e where e.id = employee_id and app.is_member(e.organization_id)));
create policy employee_skills_write on public.employee_skills for all to authenticated using (exists (select 1 from public.employees e where e.id = employee_id and app.has_permission(e.organization_id, 'team.write'))) with check (exists (select 1 from public.employees e where e.id = employee_id and app.has_permission(e.organization_id, 'team.write')));

alter table public.mission_progress enable row level security;
create policy mission_progress_select on public.mission_progress for select to authenticated using (exists (select 1 from public.missions m where m.id = mission_id and app.is_member(m.organization_id)));

-- Gamification, notifications, activité, audit : lecture par les membres ; écriture
-- uniquement par le serveur (service role / fonctions security definer) afin
-- qu'un client ne puisse pas s'attribuer de l'XP ou falsifier le journal d'audit.
do $$
declare t text;
begin
  foreach t in array array['xp_transactions', 'retired_xp_keys', 'user_achievements', 'company_progress', 'progression_entries', 'activity_events', 'audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', t || '_select', t);
  end loop;
end $$;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (app.is_member(organization_id));
create policy notifications_mark_read on public.notifications for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));

/* ------------------------------------------------------------------ */
/* Opérations financières transactionnelles                             */
/* ------------------------------------------------------------------ */

-- Enregistre un paiement de façon atomique : verrouille la facture, vérifie le
-- statut, le solde (pas de trop-perçu) et la permission, puis journalise.
create or replace function public.record_payment(p_invoice_id text, p_date date, p_amount bigint, p_method text, p_reference text default '', p_notes text default '')
returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  v_balance bigint;
  v_payment public.payments;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Facture introuvable' using errcode = 'P0002'; end if;
  if not app.has_permission(inv.organization_id, 'payments.write') then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  if inv.base_status <> 'issued' then raise exception 'La facture doit être émise et non annulée'; end if;
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;
  if p_date > current_date or p_date < inv.issue_date then raise exception 'Date de paiement invalide'; end if;
  select balance into v_balance from public.invoice_balances where invoice_id = inv.id;
  if p_amount > v_balance then raise exception 'Le paiement dépasse le solde restant (%)', v_balance; end if;
  insert into public.payments (organization_id, invoice_id, date, amount, method, reference, notes)
  values (inv.organization_id, inv.id, p_date, p_amount, p_method, coalesce(p_reference, ''), coalesce(p_notes, ''))
  returning * into v_payment;
  insert into public.audit_logs (organization_id, actor_id, actor, role, action, entity_type, entity_id, details)
  select inv.organization_id, auth.uid(), coalesce(m.display_name, ''), m.role, 'payment.record', 'payment', v_payment.id, inv.number || ' · ' || p_amount
  from public.organization_members m where m.organization_id = inv.organization_id and m.user_id = auth.uid();
  return v_payment;
end $$;

-- Attribution idempotente d'XP (appelée par le serveur après un événement métier validé).
create or replace function app.award_xp(p_org text, p_user uuid, p_key text, p_amount integer, p_reason text, p_source text, p_entity_type text, p_entity_id text, p_at timestamptz)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.retired_xp_keys where organization_id = p_org and idempotency_key = p_key) then
    return false;
  end if;
  insert into public.xp_transactions (organization_id, user_id, at, amount, reason, source, entity_type, entity_id, idempotency_key)
  values (p_org, p_user, p_at, p_amount, p_reason, p_source, p_entity_type, p_entity_id, p_key)
  on conflict (organization_id, idempotency_key) do nothing;
  return found;
end $$;
revoke all on function app.award_xp(text, uuid, text, integer, text, text, text, text, timestamptz) from public, authenticated;

-- ===== 20261015000003_credit_notes_vat.sql =====
-- BDO Software — avoirs, remboursements et déclarations de TVA (phase 7).
-- Miroir de src/lib/calculations/{invoices,vat}.ts et src/lib/domain/commands/finance.ts.

insert into public.permissions (key, label) values ('vat.write', 'TVA (déclarations)');
insert into public.role_permissions (role, permission) values ('admin', 'vat.write'), ('dirigeant', 'vat.write'), ('finance', 'vat.write');
update public.permissions set label = 'Paiements et remboursements' where key = 'payments.write';

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

create table public.credit_notes (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  number text not null,
  invoice_id text not null references public.invoices(id) on delete restrict,
  client_id text not null references public.clients(id) on delete restrict,
  issue_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);
create index credit_notes_invoice_idx on public.credit_notes(invoice_id);
create index credit_notes_org_date_idx on public.credit_notes(organization_id, issue_date);

create table public.credit_note_items (
  id text primary key default gen_random_uuid()::text,
  credit_note_id text not null references public.credit_notes(id) on delete cascade,
  position smallint not null default 0,
  product_id text references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  -- Montants positifs : le signe négatif est porté par la nature du document.
  unit_price bigint not null check (unit_price >= 0),
  vat_rate integer not null check (vat_rate between 0 and 10000)
);
create index credit_note_items_note_idx on public.credit_note_items(credit_note_id);

create table public.refunds (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  invoice_id text not null references public.invoices(id) on delete restrict,
  credit_note_id text references public.credit_notes(id) on delete set null,
  date date not null,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('transfer', 'card', 'direct_debit', 'check', 'cash')),
  reference text not null default '',
  created_at timestamptz not null default now()
);
create index refunds_invoice_idx on public.refunds(invoice_id);
create index refunds_org_date_idx on public.refunds(organization_id, date);

create table public.vat_returns (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  collected bigint not null,
  deductible bigint not null check (deductible >= 0),
  credit_carried_in bigint not null default 0 check (credit_carried_in >= 0),
  net bigint not null,
  status text not null check (status in ('declared', 'paid', 'credit')),
  due_date date not null,
  declared_at timestamptz not null default now(),
  paid_date date,
  reference text not null default '',
  unique (organization_id, period),
  check (net = collected - deductible - credit_carried_in),
  check ((status = 'credit') = (net <= 0)),
  check ((status = 'paid') = (paid_date is not null))
);

-- Une reprise d'XP (facture intégralement annulée par avoir) est une transaction négative.
alter table public.xp_transactions drop constraint if exists xp_transactions_amount_check;
alter table public.xp_transactions add constraint xp_transactions_amount_check check (amount <> 0);

/* ------------------------------------------------------------------ */
/* Vues de calcul                                                      */
/* ------------------------------------------------------------------ */

create view public.credit_note_totals with (security_invoker = true) as
with lines as (
  select credit_note_id, vat_rate, sum(round(quantity * unit_price)) as base_ht
  from public.credit_note_items group by credit_note_id, vat_rate
)
select c.id as credit_note_id, c.organization_id, c.invoice_id, c.issue_date,
  coalesce(sum(l.base_ht), 0)::bigint as total_ht,
  coalesce(sum(round(l.base_ht * l.vat_rate / 10000.0)), 0)::bigint as total_vat,
  (coalesce(sum(l.base_ht), 0) + coalesce(sum(round(l.base_ht * l.vat_rate / 10000.0)), 0))::bigint as total_ttc
from public.credit_notes c left join lines l on l.credit_note_id = c.id
group by c.id, c.organization_id, c.invoice_id, c.issue_date;

-- Soldes : avoirs déduits du montant dû, encaissé net des remboursements.
-- Les colonnes historiques sont conservées dans le même ordre ; les nouvelles sont ajoutées à la fin.
create or replace view public.invoice_balances with (security_invoker = true) as
with credits as (select invoice_id, sum(total_ttc) as credited from public.credit_note_totals group by invoice_id),
pays as (select invoice_id, sum(amount) as paid from public.payments group by invoice_id),
refs as (select invoice_id, sum(amount) as refunded from public.refunds group by invoice_id),
base as (
  select i.id, i.organization_id, i.base_status, i.due_date, t.total_ttc,
    coalesce(c.credited, 0)::bigint as credited,
    greatest(t.total_ttc - coalesce(c.credited, 0), 0)::bigint as net_ttc,
    (coalesce(p.paid, 0) - coalesce(r.refunded, 0))::bigint as paid,
    coalesce(r.refunded, 0)::bigint as refunded
  from public.invoices i
  join public.invoice_totals t on t.invoice_id = i.id
  left join credits c on c.invoice_id = i.id
  left join pays p on p.invoice_id = i.id
  left join refs r on r.invoice_id = i.id
)
select id as invoice_id, organization_id, total_ttc, paid,
  case when base_status = 'issued' then greatest(net_ttc - paid, 0) else 0 end::bigint as balance,
  case
    when base_status in ('draft', 'cancelled') then base_status
    when credited > 0 and total_ttc - credited <= 0 then 'credited'
    when net_ttc > 0 and paid >= net_ttc then 'paid'
    when due_date < current_date then 'overdue'
    when paid > 0 then 'partially_paid'
    else 'issued'
  end as status,
  credited, net_ttc, refunded,
  case when base_status = 'issued' then greatest(paid - net_ttc, 0) else 0 end::bigint as credit_balance
from base;

/* ------------------------------------------------------------------ */
/* Clôture des périodes de TVA déclarées                               */
/* ------------------------------------------------------------------ */

create or replace function app.vat_period_closed(p_org text, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select p_date is not null and exists (select 1 from public.vat_returns v where v.organization_id = p_org and v.period = to_char(p_date, 'YYYY-MM'));
$$;
revoke all on function app.vat_period_closed(text, date) from public;
grant execute on function app.vat_period_closed(text, date) to authenticated;

-- Paiements et remboursements : aucun flux ne peut être créé, modifié ou supprimé dans une période déclarée.
create or replace function app.guard_cash_flow_period() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and app.vat_period_closed(old.organization_id, old.date) then
    raise exception 'Période de TVA % déjà déclarée', to_char(old.date, 'YYYY-MM') using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and app.vat_period_closed(new.organization_id, new.date) then
    raise exception 'Période de TVA % déjà déclarée', to_char(new.date, 'YYYY-MM') using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger payments_vat_period before insert or update or delete on public.payments for each row execute function app.guard_cash_flow_period();
create trigger refunds_vat_period before insert or update or delete on public.refunds for each row execute function app.guard_cash_flow_period();

-- Dépenses : la date de paiement (TVA déductible) d'une période déclarée est figée.
create or replace function app.guard_expense_period() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.paid and app.vat_period_closed(old.organization_id, old.paid_date)
     and (tg_op = 'DELETE' or new.paid is distinct from old.paid or new.paid_date is distinct from old.paid_date
          or new.amount_ht is distinct from old.amount_ht or new.vat_rate is distinct from old.vat_rate) then
    raise exception 'Dépense payée dans une période de TVA déclarée' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.paid and app.vat_period_closed(new.organization_id, new.paid_date)
     and (tg_op = 'INSERT' or new.paid is distinct from old.paid or new.paid_date is distinct from old.paid_date) then
    raise exception 'Période de TVA % déjà déclarée', to_char(new.paid_date, 'YYYY-MM') using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger expenses_vat_period before insert or update or delete on public.expenses for each row execute function app.guard_expense_period();

-- Une déclaration est figée : seuls le passage « déclarée → payée » et la référence sont modifiables.
create or replace function app.guard_vat_return() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Une déclaration de TVA ne peut pas être supprimée' using errcode = 'P0001'; end if;
  if (new.period, new.collected, new.deductible, new.credit_carried_in, new.net, new.due_date)
     is distinct from (old.period, old.collected, old.deductible, old.credit_carried_in, old.net, old.due_date) then
    raise exception 'Les montants d''une déclaration de TVA sont figés' using errcode = 'P0001';
  end if;
  if old.status <> new.status and not (old.status = 'declared' and new.status = 'paid') then
    raise exception 'Transition de statut de TVA invalide' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger vat_returns_guard before update or delete on public.vat_returns for each row execute function app.guard_vat_return();

/* ------------------------------------------------------------------ */
/* Row Level Security                                                  */
/* ------------------------------------------------------------------ */

-- Avoirs et remboursements : documents immuables (lecture + création uniquement).
alter table public.credit_notes enable row level security;
create policy credit_notes_select on public.credit_notes for select to authenticated using (app.is_member(organization_id));
create policy credit_notes_insert on public.credit_notes for insert to authenticated with check (app.has_permission(organization_id, 'invoices.write'));

alter table public.credit_note_items enable row level security;
create policy credit_note_items_select on public.credit_note_items for select to authenticated
  using (exists (select 1 from public.credit_notes c where c.id = credit_note_id and app.is_member(c.organization_id)));
create policy credit_note_items_insert on public.credit_note_items for insert to authenticated
  with check (exists (select 1 from public.credit_notes c where c.id = credit_note_id and app.has_permission(c.organization_id, 'invoices.write')));

alter table public.refunds enable row level security;
create policy refunds_select on public.refunds for select to authenticated using (app.is_member(organization_id));
create policy refunds_insert on public.refunds for insert to authenticated with check (app.has_permission(organization_id, 'payments.write'));

alter table public.vat_returns enable row level security;
create policy vat_returns_select on public.vat_returns for select to authenticated using (app.is_member(organization_id));
create policy vat_returns_insert on public.vat_returns for insert to authenticated with check (app.has_permission(organization_id, 'vat.write'));
create policy vat_returns_update on public.vat_returns for update to authenticated using (app.has_permission(organization_id, 'vat.write')) with check (app.has_permission(organization_id, 'vat.write'));

/* ------------------------------------------------------------------ */
/* Fonctions atomiques                                                 */
/* ------------------------------------------------------------------ */

-- Remboursement d'un trop-perçu : verrouille la facture et refuse tout montant supérieur au trop-perçu.
create or replace function public.record_refund(p_invoice_id text, p_date date, p_amount bigint, p_method text, p_reference text default '', p_credit_note_id text default null)
returns public.refunds
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  v_credit bigint;
  v_refund public.refunds;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Facture introuvable' using errcode = 'P0002'; end if;
  if not app.has_permission(inv.organization_id, 'payments.write') then raise exception 'Action non autorisée' using errcode = '42501'; end if;
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;
  if p_date > current_date then raise exception 'Date de remboursement invalide'; end if;
  select credit_balance into v_credit from public.invoice_balances where invoice_id = inv.id;
  if p_amount > coalesce(v_credit, 0) then raise exception 'Le remboursement dépasse le trop-perçu (%)', coalesce(v_credit, 0); end if;
  insert into public.refunds (organization_id, invoice_id, credit_note_id, date, amount, method, reference)
  values (inv.organization_id, inv.id, p_credit_note_id, p_date, p_amount, p_method, coalesce(p_reference, ''))
  returning * into v_refund;
  return v_refund;
end $$;
revoke all on function public.record_refund(text, date, bigint, text, text, text) from public;
grant execute on function public.record_refund(text, date, bigint, text, text, text) to authenticated;

-- ===== 20261015000004_crm.sql =====
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

-- ===== 20261015000005_shared_state.sql =====
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

-- ===== 20261020000006_private_state.sql =====
-- BDO Software CRM — cloisonnement des données par collaborateur.
--
-- Le document partagé (`app_state`) contient les données de toute l'équipe. Il n'est plus
-- lisible directement depuis le navigateur : chaque utilisateur reçoit uniquement la
-- projection de son portefeuille, calculée par les Server Actions (clé de service, côté
-- serveur uniquement). Seul le directeur commercial reçoit l'ensemble des données.

drop policy if exists app_state_select on public.app_state;
revoke select on public.app_state from anon, authenticated;
-- RLS reste activée sans aucune politique : même un droit SELECT ré-accordé ne renverrait rien.
