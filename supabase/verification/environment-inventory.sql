-- READ ONLY. Extra environment checks; there is no production baseline assumed.
-- Run after phase8a-inventory.sql. No functions with application side effects are invoked.
select current_database() as database_name, current_user as sql_editor_role,
 current_setting('server_version') as postgres_version,
 to_regclass('auth.users') as auth_users, to_regprocedure('auth.uid()') as auth_uid,
 to_regclass('storage.buckets') as storage_buckets,
 to_regclass('storage.objects') as storage_objects,
 to_regclass('supabase_migrations.schema_migrations') as migration_ledger;

-- Owners of application tables/functions must be trusted operator roles, not API roles.
select n.nspname as schema_name,c.relname as object_name,pg_get_userbyid(c.relowner) as owner,
 c.relrowsecurity as rls,c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relkind in ('r','p','v','m')) or n.nspname='private'
order by 1,2;

-- Effective rights include inherited grants. service_role is deliberately powerful.
select rolname,rolsuper,rolbypassrls,rolcanlogin
from pg_roles where rolname in ('anon','authenticated','service_role','postgres') order by rolname;
select member.rolname as member, parent.rolname as granted_role, m.admin_option
from pg_auth_members m join pg_roles member on member.oid=m.member
join pg_roles parent on parent.oid=m.roleid
where member.rolname in ('anon','authenticated','service_role') order by 1,2;
select r.rolname,n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE') as usage,
 has_schema_privilege(r.oid,n.oid,'CREATE') as can_create
from pg_roles r cross join pg_namespace n
where r.rolname in ('anon','authenticated','service_role') and n.nspname in ('public','private','storage')
order by 1,2;

-- Lists definitions/ACLs of all public/private functions, including unexpected RPCs/overloads.
-- ACLs alone are insufficient: effective EXECUTE below includes PUBLIC and inherited grants.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
 pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
 p.proconfig as settings,p.proacl as raw_acl,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') order by 1,2,3;

-- Default grants can silently give new functions PUBLIC EXECUTE or service_role ALL.
select pg_get_userbyid(d.defaclrole) as creator,n.nspname as schema_name,
 d.defaclobjtype as object_type,d.defaclacl as privileges
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3;

-- Storage is a shared managed schema: record actual grants; do not alter them here.
select r.rolname,c.relname,p.privilege,
 has_table_privilege(r.oid,c.oid,p.privilege) as allowed
from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)
where r.rolname in ('anon','authenticated','service_role') and n.nspname='storage'
 and c.relname in ('objects','buckets') order by 1,2,3;

-- Inspect every Storage policy, not just policies named by this application.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='storage' order by tablename,policyname;
select c.relname,c.relrowsecurity as rls,pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='storage' and c.relname in ('buckets','objects');
select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets where id='tournament-sources' or name='tournament-sources';

-- Shows name collisions; Phase 8B is pending, so no rows are expected for these objects.
select 'function' as kind,n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as name
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('attach_screenshot','append_screenshot_review','can_read_tournament_source')
union all
select 'policy',schemaname||'.'||tablename||'.'||policyname from pg_policies
where policyname like 'tournament_source_%'
union all
select 'column',table_schema||'.'||table_name||'.'||column_name from information_schema.columns
where table_schema='public' and table_name='screenshot_assets' and column_name='created_at'
union all
select 'constraint',conname from pg_constraint
where conrelid=to_regclass('public.screenshot_assets') and conname='screenshot_draft_hash'
union all
select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and t.tgname='immutable_truncate'
order by 1,2;
