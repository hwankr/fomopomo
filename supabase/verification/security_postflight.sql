-- Read-only post-deployment assertions. Every returned row must be true.
-- Runtime-only checks for Vault, Edge secrets/deployment, Vercel, pg_cron,
-- and browser push are intentionally kept in the operations runbook.

with expected_authenticated_functions(signature) as (
  values
    ('public.accept_friend_request(uuid)'),
    ('public.delete_friend(uuid)'),
    ('public.get_admin_dashboard_stats(timestamp with time zone)'),
    ('public.get_admin_user_study_summary(uuid)'),
    ('public.get_friends_study_time(uuid,text)'),
    ('public.get_group_study_time_v3(uuid,timestamp with time zone,timestamp with time zone)'),
    ('public.is_admin()'),
    ('public.is_group_member(uuid)'),
    ('public.send_friend_request(text)')
),
checks(check_name, passed) as (
  values
    (
      'profiles table-wide UPDATE revoked from authenticated',
      not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    ),
    (
      'profiles.role UPDATE revoked from authenticated',
      not has_column_privilege(
        'authenticated',
        'public.profiles',
        'role',
        'UPDATE'
      )
    ),
    (
      'profiles.email UPDATE revoked from authenticated',
      not has_column_privilege(
        'authenticated',
        'public.profiles',
        'email',
        'UPDATE'
      )
    ),
    (
      'allowed profile status UPDATE remains available',
      has_column_privilege(
        'authenticated',
        'public.profiles',
        'status',
        'UPDATE'
      )
    ),
    (
      'protected profile trigger is installed',
      exists (
        select 1
        from pg_catalog.pg_trigger as t
        where t.tgrelid = 'public.profiles'::regclass
          and t.tgname = 'guard_profile_protected_columns'
          and not t.tgisinternal
      )
    ),
    (
      'profile self-update policy has USING and WITH CHECK',
      exists (
        select 1
        from pg_catalog.pg_policies as p
        where p.schemaname = 'public'
          and p.tablename = 'profiles'
          and p.policyname = 'Users can update own profile'
          and p.cmd = 'UPDATE'
          and 'authenticated' = any(p.roles)
          and p.qual is not null
          and p.with_check is not null
      )
    ),
    (
      'debug logs are unavailable to anon',
      not has_table_privilege('anon', 'public.debug_logs', 'SELECT')
        and not has_table_privilege('anon', 'public.debug_logs', 'INSERT')
    ),
    (
      'debug logs are unavailable to authenticated',
      not has_table_privilege('authenticated', 'public.debug_logs', 'SELECT')
        and not has_table_privilege('authenticated', 'public.debug_logs', 'INSERT')
    ),
    (
      'debug logs service role is insert-only',
      has_table_privilege('service_role', 'public.debug_logs', 'INSERT')
        and not has_table_privilege('service_role', 'public.debug_logs', 'SELECT')
        and not has_table_privilege('service_role', 'public.debug_logs', 'UPDATE')
        and not has_table_privilege('service_role', 'public.debug_logs', 'DELETE')
    ),
    (
      'debug logs have no client-facing policies',
      not exists (
        select 1
        from pg_catalog.pg_policies as p
        where p.schemaname = 'public'
          and p.tablename = 'debug_logs'
      )
    ),
    (
      'direct friendship INSERT is revoked',
      not has_table_privilege('authenticated', 'public.friendships', 'INSERT')
    ),
    (
      'friendship identity columns cannot be updated',
      not has_column_privilege(
        'authenticated',
        'public.friendships',
        'friend_id',
        'UPDATE'
      )
    ),
    (
      'push subscription table-wide UPDATE is revoked',
      not has_table_privilege(
        'authenticated',
        'public.push_subscriptions',
        'UPDATE'
      )
    ),
    (
      'push subscription key UPDATE remains available',
      has_column_privilege(
        'authenticated',
        'public.push_subscriptions',
        'keys',
        'UPDATE'
      )
    ),
    (
      'public cleanup function is removed',
      to_regprocedure('public.delete_unconfirmed_users()') is null
    ),
    (
      'private cleanup function exists',
      to_regprocedure('private.delete_unconfirmed_users()') is not null
    ),
    (
      'private cleanup cannot be called by clients or service role',
      not coalesce(
        has_function_privilege(
          'anon',
          to_regprocedure('private.delete_unconfirmed_users()'),
          'EXECUTE'
        ),
        false
      )
        and not coalesce(
          has_function_privilege(
            'authenticated',
            to_regprocedure('private.delete_unconfirmed_users()'),
            'EXECUTE'
          ),
          false
        )
        and not coalesce(
          has_function_privilege(
            'service_role',
            to_regprocedure('private.delete_unconfirmed_users()'),
            'EXECUTE'
          ),
          false
        )
    ),
    (
      'private schema is unavailable to browser roles',
      not has_schema_privilege('anon', 'private', 'USAGE')
        and not has_schema_privilege('authenticated', 'private', 'USAGE')
    ),
    (
      'obsolete RPCs are removed',
      to_regprocedure('public.add_friend(uuid)') is null
        and to_regprocedure('public.get_user_id_by_email(text)') is null
        and to_regprocedure('public.get_group_study_time(uuid,text)') is null
        and to_regprocedure('public.get_group_study_time_v2(text,uuid)') is null
        and to_regprocedure('public.get_group_study_time_v2(uuid,text)') is null
    ),
    (
      'anon can execute no application functions',
      not exists (
        select 1
        from pg_catalog.pg_proc as p
        join pg_catalog.pg_namespace as n
          on n.oid = p.pronamespace
        where n.nspname in ('public', 'private')
          and p.prokind = 'f'
          and has_function_privilege('anon', p.oid, 'EXECUTE')
      )
    ),
    (
      'service role can execute no application functions',
      not exists (
        select 1
        from pg_catalog.pg_proc as p
        join pg_catalog.pg_namespace as n
          on n.oid = p.pronamespace
        where n.nspname in ('public', 'private')
          and p.prokind = 'f'
          and has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
    ),
    (
      'authenticated function allowlist is exact',
      not exists (
        select 1
        from expected_authenticated_functions as expected
        where to_regprocedure(expected.signature) is null
          or not has_function_privilege(
            'authenticated',
            to_regprocedure(expected.signature),
            'EXECUTE'
          )
      )
        and (
          select count(*)
          from pg_catalog.pg_proc as p
          join pg_catalog.pg_namespace as n
            on n.oid = p.pronamespace
          where n.nspname in ('public', 'private')
            and p.prokind = 'f'
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        ) = (select count(*) from expected_authenticated_functions)
    ),
    (
      'all application SECURITY DEFINER functions have empty search_path',
      not exists (
        select 1
        from pg_catalog.pg_proc as p
        join pg_catalog.pg_namespace as n
          on n.oid = p.pronamespace
        where n.nspname in ('public', 'private')
          and p.prokind = 'f'
          and p.prosecdef
          and not (
            'search_path=""' = any(
              coalesce(p.proconfig, array[]::text[])
            )
          )
      )
    ),
    (
      'postgres future functions have no broad default EXECUTE',
      exists (
        select 1
        from pg_catalog.pg_default_acl as d
        join pg_catalog.pg_roles as r
          on r.oid = d.defaclrole
        where r.rolname = 'postgres'
          and d.defaclobjtype = 'f'
          and d.defaclnamespace = 0
          and not exists (
            select 1
            from aclexplode(d.defaclacl) as acl
            where acl.privilege_type = 'EXECUTE'
              and (
                acl.grantee = 0
                or acl.grantee in (
                  select roles.oid
                  from pg_catalog.pg_roles as roles
                  where roles.rolname in (
                    'anon',
                    'authenticated',
                    'service_role'
                  )
                )
              )
          )
      )
    ),
    (
      'friendship direction uniqueness is enforced',
      exists (
        select 1
        from pg_catalog.pg_constraint as c
        where c.conrelid = 'public.friendships'::regclass
          and c.contype = 'u'
          and c.conkey = array[
            (
              select a.attnum
              from pg_catalog.pg_attribute as a
              where a.attrelid = 'public.friendships'::regclass
                and a.attname = 'user_id'
            ),
            (
              select a.attnum
              from pg_catalog.pg_attribute as a
              where a.attrelid = 'public.friendships'::regclass
                and a.attname = 'friend_id'
            )
          ]::smallint[]
      )
    ),
    (
      'friend request direction uniqueness is enforced',
      exists (
        select 1
        from pg_catalog.pg_constraint as c
        where c.conrelid = 'public.friend_requests'::regclass
          and c.contype = 'u'
          and c.conkey = array[
            (
              select a.attnum
              from pg_catalog.pg_attribute as a
              where a.attrelid = 'public.friend_requests'::regclass
                and a.attname = 'sender_id'
            ),
            (
              select a.attnum
              from pg_catalog.pg_attribute as a
              where a.attrelid = 'public.friend_requests'::regclass
                and a.attname = 'receiver_id'
            )
          ]::smallint[]
      )
    ),
    (
      'exactly one Vault-backed profile webhook trigger is installed',
      (
        select count(*)
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
          and pn.nspname = 'private'
          and p.proname = 'enqueue_profile_status_webhook'
      ) = 1
    )
)
select
  check_name,
  passed,
  1 / case
    when bool_and(passed) over () then 1
    else 0
  end as all_checks_passed
from checks
order by check_name;
