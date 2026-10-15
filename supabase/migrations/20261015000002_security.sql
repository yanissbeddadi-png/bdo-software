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
