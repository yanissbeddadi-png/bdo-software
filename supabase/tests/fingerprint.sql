-- Empreinte du schéma public (colonnes, politiques RLS, contraintes, index, fonctions,
-- droits anon / authenticated) : compare une installation neuve aux migrations complètes,
-- et une base Supabase distante à la référence locale (affichée par `npm run test:sql`).
select md5(concat_ws('|',
  (select string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, column_name)
     from information_schema.columns where table_schema = 'public'),
  (select string_agg(tablename || '.' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' order by tablename, policyname)
     from pg_policies where schemaname = 'public'),
  (select string_agg(conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname)
     from pg_constraint where connamespace = 'public'::regnamespace),
  (select string_agg(indexname || ':' || indexdef, ',' order by indexname) from pg_indexes where schemaname = 'public'),
  (select string_agg(p.proname || ':' || md5(p.prosrc), ',' order by p.proname, md5(p.prosrc))
     from pg_proc p where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace)
       -- Fonctions d'extensions (pgcrypto…) exclues : sur Supabase elles vivent dans le schéma extensions.
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  (select string_agg(c.relname || ':' || r.rolname || ':' || has_table_privilege(r.rolname, c.oid, 'select') || has_table_privilege(r.rolname, c.oid, 'insert') || has_table_privilege(r.rolname, c.oid, 'update') || has_table_privilege(r.rolname, c.oid, 'delete'), ',' order by c.relname, r.rolname)
     from pg_class c cross join pg_roles r
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') and r.rolname in ('anon', 'authenticated'))
));
