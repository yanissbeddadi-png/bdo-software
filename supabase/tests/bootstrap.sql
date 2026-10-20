-- Simulation minimale de l'environnement Supabase (schéma auth, rôles) pour
-- valider les migrations sur un PostgreSQL local. NE PAS exécuter sur Supabase.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- Comme sur Supabase : les tables créées dans public sont accessibles par défaut à ces rôles
-- (seules les politiques RLS et les « revoke » des migrations restreignent l'accès).
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
