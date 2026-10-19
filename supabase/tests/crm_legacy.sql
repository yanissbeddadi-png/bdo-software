-- Données au format antérieur à la migration CRM (000004), pour vérifier leur reprise.
-- Exécuté après les migrations 001 à 003, avant 004. Données fictives.
insert into public.organizations (id, name, settings) values ('org_legacy', 'Legacy SARL', '{"company": {"timezone": "Europe/Paris"}}');
insert into public.clients (id, organization_id, name, status) values ('cli_a', 'org_legacy', 'Alpha', 'active'), ('cli_b', 'org_legacy', 'Beta', 'churned');
insert into public.contacts (id, organization_id, client_id, first_name, last_name, is_primary) values ('con_a', 'org_legacy', 'cli_a', 'Alice', 'Martin', true);
insert into public.leads (id, organization_id, company, contact_name, email, source, priority, status, next_action, next_action_date) values
  ('lead_h', 'org_legacy', 'Helios', 'Margaux Rivière', 'm@helios.example', 'Salon', 'high', 'contacted', 'Rappeler Margaux', '2026-10-18'),
  ('lead_x', 'org_legacy', 'Xeno', 'Paul Durand', '', 'Site web', 'normal', 'unqualified', '', null);
insert into public.opportunities (id, organization_id, name, client_id, lead_id, amount, probability, stage, expected_close_date, next_action) values
  ('opp_h', 'org_legacy', 'Projet Helios', null, 'lead_h', 100000, 30, 'meeting', '2026-12-01', ''),
  ('opp_a', 'org_legacy', 'Projet Alpha', 'cli_a', null, 50000, 20, 'qualification', '2026-12-01', 'Envoyer la grille tarifaire');
insert into public.sales_activities (id, organization_id, type, date, subject, client_id, lead_id, done) values
  ('act_done', 'org_legacy', 'call', '2026-10-10 08:00:00+00', 'Appel passé', 'cli_a', null, true),
  ('act_plan', 'org_legacy', 'meeting', '2026-10-20 08:30:00+00', 'Rendez-vous prévu', null, 'lead_h', false);
