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
