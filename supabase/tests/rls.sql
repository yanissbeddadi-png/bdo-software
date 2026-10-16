-- Vérifications RLS et intégrité, à exécuter après bootstrap + migrations + seed.
\set ON_ERROR_STOP on
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ('org_demo', '00000000-0000-0000-0000-000000000001', 'dirigeant', 'Dirigeant'),
  ('org_demo', '00000000-0000-0000-0000-000000000002', 'collaborateur', 'Collaborateur');
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- 1. Totaux et soldes calculés côté base cohérents avec l'application.
select count(*) as factures, sum(total_ttc) as total_ttc from public.invoice_totals;
select status, count(*) from public.invoice_balances group by status order by status;

set role authenticated;

-- 2. Un non-membre ne voit rien.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$ begin if (select count(*) from public.clients) <> 0 then raise exception 'RLS: un non-membre voit des clients'; end if; end $$;

-- 3. Un collaborateur lit mais ne peut pas émettre de facture ni s'attribuer d'XP.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin if (select count(*) from public.clients) = 0 then raise exception 'RLS: un membre ne voit pas les clients'; end if; end $$;
do $$ begin
  begin
    insert into public.invoices (organization_id, number, client_id, issue_date, due_date) values ('org_demo', 'TEST-1', 'cli_novaretail', current_date, current_date);
    raise exception 'RLS: un collaborateur a pu créer une facture';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.xp_transactions (organization_id, at, amount, reason, source, idempotency_key) values ('org_demo', now(), 9999, 'triche', 'task', 'cheat');
    raise exception 'RLS: un client a pu écrire de l''XP';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    perform public.record_payment('inv_001', current_date, 100, 'transfer');
    raise exception 'record_payment accepté pour un collaborateur';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Le dirigeant enregistre un paiement atomique ; le trop-perçu est refusé.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
declare v_inv text; v_bal bigint;
begin
  select invoice_id, balance into v_inv, v_bal from public.invoice_balances where balance > 0 order by balance desc limit 1;
  perform public.record_payment(v_inv, current_date, 1, 'transfer', 'TEST');
  begin
    perform public.record_payment(v_inv, current_date, v_bal, 'transfer', 'TROP');
    raise exception 'trop-perçu accepté';
  exception when raise_exception then
    if sqlerrm not like 'Le paiement dépasse%' then raise; end if;
  end;
end $$;

-- 5. Avoirs / TVA : cohérence avec l'application et clôture des périodes déclarées.
do $$ begin
  if not exists (select 1 from public.invoice_balances where status = 'credited') then raise exception 'Aucune facture annulée par avoir'; end if;
  if exists (select 1 from public.invoice_balances where paid < 0) then raise exception 'Encaissé net négatif'; end if;
end $$;
do $$
declare v_period text; v_inv text;
begin
  select period into v_period from public.vat_returns order by period desc limit 1;
  select invoice_id into v_inv from public.invoice_balances where balance > 0 limit 1;
  begin
    insert into public.payments (organization_id, invoice_id, date, amount, method) values ('org_demo', v_inv, (v_period || '-15')::date, 1, 'transfer');
    raise exception 'paiement accepté dans une période déclarée';
  exception when raise_exception then
    if sqlerrm not like 'Période de TVA%' then raise; end if;
  end;
  begin
    update public.vat_returns set net = net + 1, collected = collected + 1 where period = v_period;
    raise exception 'déclaration modifiée';
  exception when raise_exception then
    if sqlerrm not like 'Les montants%' then raise; end if;
  end;
  begin
    perform public.record_refund(v_inv, current_date, 1, 'transfer');
    raise exception 'remboursement sans trop-perçu accepté';
  exception when raise_exception then
    if sqlerrm not like 'Le remboursement dépasse%' then raise; end if;
  end;
end $$;

-- 6. Un collaborateur ne peut ni déclarer la TVA ni émettre d'avoir.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  begin
    insert into public.vat_returns (organization_id, period, collected, deductible, net, status, due_date) values ('org_demo', '2000-01', 0, 0, 0, 'credit', '2000-02-24');
    raise exception 'RLS: un collaborateur a pu déclarer la TVA';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.credit_notes (organization_id, number, invoice_id, client_id, issue_date, reason) select 'org_demo', 'AV-TEST', id, client_id, current_date, 'test' from public.invoices limit 1;
    raise exception 'RLS: un collaborateur a pu émettre un avoir';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'RLS OK' as resultat;
