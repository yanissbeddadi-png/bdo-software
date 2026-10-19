-- Vérifie la reprise des données legacy par la migration CRM (000004).
do $$
declare n int;
begin
  -- Prospects → entreprises « prospect » / « archived » + contacts.
  select count(*) into n from public.clients where organization_id = 'org_legacy' and name = 'Helios' and relation = 'prospect';
  if n <> 1 then raise exception 'Helios : entreprise prospect attendue (%)', n; end if;
  select count(*) into n from public.clients where organization_id = 'org_legacy' and name = 'Xeno' and relation = 'archived';
  if n <> 1 then raise exception 'Xeno : entreprise archivée attendue (%)', n; end if;
  select count(*) into n from public.contacts c join public.clients cl on cl.id = c.client_id
    where cl.name = 'Helios' and c.first_name = 'Margaux' and c.last_name = 'Rivière' and c.relation = 'prospect' and c.priority = 'high';
  if n <> 1 then raise exception 'Contact Margaux attendu (%)', n; end if;
  select count(*) into n from public.contacts where first_name = 'Paul' and relation = 'archived' and archived_at is not null;
  if n <> 1 then raise exception 'Contact archivé attendu (%)', n; end if;
  select count(*) into n from public.clients where id = 'cli_b' and relation = 'former';
  if n <> 1 then raise exception 'Client résilié → ancien client attendu'; end if;
  -- Étapes remappées, entreprise rattachée.
  select count(*) into n from public.opportunities o join public.clients cl on cl.id = o.client_id where o.id = 'opp_h' and o.stage = 'discussion' and cl.name = 'Helios' and o.qualified_at is not null and o.contact_id is not null;
  if n <> 1 then raise exception 'opp_h : étape discussion + entreprise attendues'; end if;
  select count(*) into n from public.opportunities where id = 'opp_a' and stage = 'qualify' and qualified_at is null and contact_id = 'con_a';
  if n <> 1 then raise exception 'opp_a : étape qualify attendue'; end if;
  -- Prochaine action de prospect et activité planifiée → missions.
  select count(*) into n from public.tasks where id = 'tsk_mig_lead_h' and type = 'followup' and due_date = '2026-10-18' and status = 'todo';
  if n <> 1 then raise exception 'Mission de relance reprise du prospect attendue'; end if;
  select count(*) into n from public.tasks where id = 'tsk_mig_act_plan' and type = 'meeting' and due_date = '2026-10-20' and due_time = '10:30';
  if n <> 1 then raise exception 'Activité planifiée → mission (heure de Paris) attendue'; end if;
  select count(*) into n from public.sales_activities where id = 'act_plan';
  if n <> 0 then raise exception 'L''activité planifiée doit quitter le journal des interactions'; end if;
  select count(*) into n from public.sales_activities where id = 'act_done';
  if n <> 1 then raise exception 'L''interaction réalisée doit être conservée'; end if;
  -- Rien n'est supprimé : la table leads reste intacte.
  select count(*) into n from public.leads where organization_id = 'org_legacy';
  if n <> 2 then raise exception 'Les prospects historiques doivent être conservés'; end if;
  -- Paramètres CRM initialisés.
  select count(*) into n from public.organizations where id = 'org_legacy' and settings->'crm'->>'inactivityDays' = '45';
  if n <> 1 then raise exception 'Paramètres CRM attendus'; end if;
end $$;
