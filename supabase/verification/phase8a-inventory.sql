-- READ ONLY. No application rows, tokens, keys or user identities are read.
-- Run this whole SELECT in the dashboard SQL Editor BEFORE Phase 8B.
-- Compare every row with docs/PHASE8A_REFERENCE.json; see MIGRATION_READINESS.md.
with targets(schema_name, table_name) as (values
 ('private','administrators'),
 ('public','players'),('public','player_identities'),('public','league_seasons'),
 ('public','scheduled_events'),('public','import_drafts'),('public','import_corrections'),
 ('public','extraction_evidence'),('public','screenshot_assets'),('public','approval_history'),
 ('public','tournament_results'),('public','player_records'),('public','published_results')
), relations as (
 select t.*, c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity
 from targets t left join pg_namespace n on n.nspname=t.schema_name
 left join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
), inventory as (
 select 'tables' as section, schema_name||'.'||table_name as object_name,
   case when oid is null then '<MISSING>' else
   format('kind=%s; rls=%s; force_rls=%s',relkind,relrowsecurity,relforcerowsecurity) end as definition
 from relations
 union all
 select 'columns',r.schema_name||'.'||r.table_name||'.'||a.attname,
   format('position=%s; type=%s; not_null=%s; default=%s; identity=%s; generated=%s',
   a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,
   coalesce(pg_get_expr(d.adbin,d.adrelid),'<none>'),a.attidentity,a.attgenerated)
 from relations r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum
 union all
 select 'constraints',r.schema_name||'.'||r.table_name||'.'||c.conname,
   pg_get_constraintdef(c.oid,true)||'; validated='||c.convalidated
 from relations r join pg_constraint c on c.conrelid=r.oid
 union all
 select 'indexes',r.schema_name||'.'||r.table_name||'.'||c.relname,pg_get_indexdef(i.indexrelid)
 from relations r join pg_index i on i.indrelid=r.oid join pg_class c on c.oid=i.indexrelid
 union all
 select 'policies',p.schemaname||'.'||p.tablename||'.'||p.policyname,
   format('%s %s roles=%s; using=%s; check=%s',p.permissive,p.cmd,p.roles,
   coalesce(p.qual,'<none>'),coalesce(p.with_check,'<none>'))
 from pg_policies p join targets t on t.schema_name=p.schemaname and t.table_name=p.tablename
 union all
 select 'triggers',r.schema_name||'.'||r.table_name||'.'||t.tgname,
   pg_get_triggerdef(t.oid,true)||'; enabled='||t.tgenabled::text
 from relations r join pg_trigger t on t.tgrelid=r.oid and not t.tgisinternal
 union all
 select 'functions',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   pg_get_functiondef(p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname='is_administrator')
    or (n.nspname='private' and p.proname='immutable_history')
 union all
 select 'table_privileges',r.schema_name||'.'||r.table_name||':'||role.rolname||':'||priv.name,
   has_table_privilege(role.oid,r.oid,priv.name)::text
 from relations r cross join pg_roles role
 cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) priv(name)
 where role.rolname in ('anon','authenticated') and has_table_privilege(role.oid,r.oid,priv.name)
 union all
 select 'column_privileges',r.schema_name||'.'||r.table_name||'.'||a.attname||':'||role.rolname||':'||priv.name,
   has_column_privilege(role.oid,r.oid,a.attnum,priv.name)::text
 from relations r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
 cross join pg_roles role cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) priv(name)
 where role.rolname in ('anon','authenticated') and has_column_privilege(role.oid,r.oid,a.attnum,priv.name)
)
select section,object_name,definition from inventory order by section,object_name;
