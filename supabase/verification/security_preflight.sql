-- Read-only production inventory. This intentionally returns no email,
-- credential, webhook body, push endpoint, or function source values.

with friendship_duplicates as (
  select count(*) as row_count
  from public.friendships
  group by user_id, friend_id
  having count(*) > 1
),
friend_request_duplicates as (
  select count(*) as row_count
  from public.friend_requests
  group by sender_id, receiver_id
  having count(*) > 1
),
function_inventory as (
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef as security_definer,
    coalesce(array_to_string(p.proconfig, ','), '') as configuration,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
      as authenticated_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE')
      as service_role_execute
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prokind = 'f'
),
routine_privilege_inventory as (
  select
    rp.routine_schema,
    rp.routine_name,
    rp.specific_name,
    array_agg(rp.grantee order by rp.grantee) as execute_grantees
  from information_schema.routine_privileges as rp
  where rp.routine_schema in ('public', 'private')
    and rp.privilege_type = 'EXECUTE'
  group by rp.routine_schema, rp.routine_name, rp.specific_name
),
trigger_inventory as (
  select
    t.tgname as trigger_name,
    pn.nspname as function_schema,
    p.proname as function_name
  from pg_catalog.pg_trigger as t
  join pg_catalog.pg_class as c
    on c.oid = t.tgrelid
  join pg_catalog.pg_namespace as cn
    on cn.oid = c.relnamespace
  join pg_catalog.pg_proc as p
    on p.oid = t.tgfoid
  join pg_catalog.pg_namespace as pn
    on pn.oid = p.pronamespace
  where not t.tgisinternal
    and cn.nspname = 'public'
    and c.relname = 'profiles'
)
select
  jsonb_build_object(
    'friendship_duplicate_groups',
    (select count(*)::integer from friendship_duplicates),
    'friendship_rows_to_remove',
    (
      select coalesce(sum(row_count - 1), 0)::integer
      from friendship_duplicates
    ),
    'friend_request_duplicate_groups',
    (select count(*)::integer from friend_request_duplicates),
    'friend_request_rows_to_remove',
    (
      select coalesce(sum(row_count - 1), 0)::integer
      from friend_request_duplicates
    )
  ) as duplicate_summary,
  jsonb_build_object(
    'authenticated_profiles_table_update',
    has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'authenticated_profiles_role_update',
    has_column_privilege(
      'authenticated',
      'public.profiles',
      'role',
      'UPDATE'
    ),
    'authenticated_profiles_status_update',
    has_column_privilege(
      'authenticated',
      'public.profiles',
      'status',
      'UPDATE'
    ),
    'anon_debug_logs_select',
    has_table_privilege('anon', 'public.debug_logs', 'SELECT'),
    'authenticated_debug_logs_select',
    has_table_privilege('authenticated', 'public.debug_logs', 'SELECT')
  ) as privilege_summary,
  (
    select jsonb_agg(
      to_jsonb(fi)
      order by fi.schema_name, fi.function_name, fi.arguments
    )
    from function_inventory as fi
  ) as functions,
  (
    select jsonb_agg(
      to_jsonb(rpi)
      order by rpi.routine_schema, rpi.routine_name, rpi.specific_name
    )
    from routine_privilege_inventory as rpi
  ) as routine_privileges,
  (
    select jsonb_agg(
      to_jsonb(ti)
      order by ti.trigger_name
    )
    from trigger_inventory as ti
  ) as profile_triggers;
