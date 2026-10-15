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
