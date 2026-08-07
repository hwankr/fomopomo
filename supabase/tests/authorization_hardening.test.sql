begin;

set local search_path = extensions, public, pg_catalog;
select plan(67);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.capture_sqlstate(statement text)
returns text
language plpgsql
set search_path = ''
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

grant execute on function tests.capture_sqlstate(text)
to anon, authenticated, service_role;

create function tests.set_auth_context(user_id uuid, jwt_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(jwt_role, ''), true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', jwt_role)::text,
    true
  );
end;
$$;

grant execute on function tests.set_auth_context(uuid, text)
to anon, authenticated, service_role;

insert into auth.users (
  id,
  email,
  created_at,
  confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'member-a@example.invalid',
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'member-b@example.invalid',
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'nonmember@example.invalid',
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'admin@example.invalid',
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'stale-unconfirmed@example.invalid',
    now() - interval '1 hour',
    null,
    '{}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (id, email, role, nickname)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'member-a@example.invalid',
    'user',
    'Member A'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'member-b@example.invalid',
    'user',
    'Member B'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'nonmember@example.invalid',
    'user',
    'Nonmember'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'admin@example.invalid',
    'admin',
    'Admin'
  );

select is(
  has_table_privilege('anon', 'public.debug_logs', 'SELECT'),
  false,
  'anon cannot read internal debug logs'
);

select is(
  has_table_privilege('anon', 'public.debug_logs', 'INSERT'),
  false,
  'anon cannot write internal debug logs'
);

select is(
  has_table_privilege('authenticated', 'public.debug_logs', 'SELECT'),
  false,
  'authenticated cannot read internal debug logs'
);

select is(
  has_table_privilege('authenticated', 'public.debug_logs', 'INSERT'),
  false,
  'authenticated cannot write internal debug logs'
);

select ok(
  has_table_privilege('service_role', 'public.debug_logs', 'INSERT'),
  'the Edge service role can write internal debug logs'
);

select is(
  has_table_privilege('service_role', 'public.debug_logs', 'SELECT'),
  false,
  'the Edge service role cannot read internal debug logs'
);

select is(
  has_table_privilege('service_role', 'public.debug_logs', 'UPDATE'),
  false,
  'the Edge service role cannot rewrite internal debug logs'
);

select is(
  has_table_privilege('service_role', 'public.debug_logs', 'DELETE'),
  false,
  'the Edge service role cannot delete internal debug logs'
);

select is(
  (
    select count(*)::integer
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'debug_logs'
  ),
  0,
  'debug_logs has no browser-facing RLS policies'
);

set local role service_role;

select is(
  tests.capture_sqlstate(
    $$insert into public.debug_logs (message, details)
      values ('edge delivery summary', '{"status":"delivered"}'::jsonb)$$
  ),
  null::text,
  'the Edge service role can insert a sanitized operational log'
);

reset role;

select is(
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  false,
  'authenticated has no table-wide profiles UPDATE privilege'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE'),
  'authenticated can update the operational status column'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'timer_duration', 'UPDATE'),
  'authenticated can update the operational timer_duration column'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  false,
  'authenticated cannot update profiles.role'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE'),
  false,
  'authenticated cannot update profiles.email'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000001',
  'authenticated'
);
set local role authenticated;

select is(
  auth.uid(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'test JWT resolves to member A'
);

select is(
  tests.capture_sqlstate(
    $$update public.profiles set role = 'admin'
      where id = '00000000-0000-0000-0000-000000000001'$$
  ),
  '42501',
  'an ordinary user cannot self-promote through direct SQL'
);

select is(
  tests.capture_sqlstate(
    $$update public.profiles
      set status = 'studying', current_task = 'security test'
      where id = '00000000-0000-0000-0000-000000000001'$$
  ),
  null::text,
  'an ordinary user can update allowed operational profile columns'
);

select is(
  tests.capture_sqlstate(
    $$update public.profiles set status = 'studying'
      where id = '00000000-0000-0000-0000-000000000002'$$
  ),
  null::text,
  'RLS safely filters an attempted update of another profile'
);

reset role;

select is(
  (select status from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'studying',
  'the allowed self-update persisted'
);

select is(
  (select status from public.profiles where id = '00000000-0000-0000-0000-000000000002'),
  'offline',
  'another user profile was not modified'
);

grant update (role) on public.profiles to authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000001',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$update public.profiles set role = 'admin'
      where id = '00000000-0000-0000-0000-000000000001'$$
  ),
  '42501',
  'the guard trigger blocks role changes even if a column grant regresses'
);

reset role;
revoke update (role) on public.profiles from authenticated;

grant update (role) on public.profiles to authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000004',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$update public.profiles set role = 'user'
      where id = '00000000-0000-0000-0000-000000000004'$$
  ),
  '42501',
  'an admin JWT also cannot directly change protected profile columns'
);

reset role;
revoke update (role) on public.profiles from authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000004","role":"service_role"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000004',
  'service_role'
);
set local role service_role;

select is(
  tests.capture_sqlstate(
    $$update public.profiles set role = 'verified-system-change'
      where id = '00000000-0000-0000-0000-000000000001'$$
  ),
  null::text,
  'service_role can perform a deliberate protected-column update'
);

select is(
  tests.capture_sqlstate(
    $$update public.profiles set role = 'user'
      where id = '00000000-0000-0000-0000-000000000001'$$
  ),
  null::text,
  'service_role can restore the protected column'
);

reset role;

select is(
  to_regprocedure('public.delete_unconfirmed_users()'),
  null::regprocedure,
  'the destructive cleanup function is absent from public'
);

select is(
  has_function_privilege('anon', 'private.delete_unconfirmed_users()', 'EXECUTE'),
  false,
  'anon cannot execute the private cleanup function'
);

select is(
  has_function_privilege('authenticated', 'private.delete_unconfirmed_users()', 'EXECUTE'),
  false,
  'authenticated cannot execute the private cleanup function'
);

select is(
  has_function_privilege('service_role', 'private.delete_unconfirmed_users()', 'EXECUTE'),
  false,
  'service_role cannot execute the cron-only cleanup function'
);

select ok(
  has_function_privilege('postgres', 'private.delete_unconfirmed_users()', 'EXECUTE'),
  'the postgres owner can execute the cron-only cleanup function'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select tests.set_auth_context(null, 'anon');
set local role anon;
select is(
  tests.capture_sqlstate('select private.delete_unconfirmed_users()'),
  '42501',
  'an anon call to the destructive cleanup function fails'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000001',
  'authenticated'
);
set local role authenticated;
select is(
  tests.capture_sqlstate('select private.delete_unconfirmed_users()'),
  '42501',
  'an authenticated call to the destructive cleanup function fails'
);
reset role;

select is(
  tests.capture_sqlstate('select private.delete_unconfirmed_users()'),
  null::text,
  'the postgres owner can execute cleanup successfully'
);

select is(
  (select count(*) from auth.users where id = '00000000-0000-0000-0000-000000000005'),
  0::bigint,
  'cleanup removes the stale unconfirmed test user'
);

select is(
  (select count(*) from auth.users where id = '00000000-0000-0000-0000-000000000001'),
  1::bigint,
  'cleanup preserves a confirmed user'
);

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where n.nspname in ('public', 'private')
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
      and p.proname in (
        'delete_unconfirmed_users',
        'send_friend_request',
        'accept_friend_request',
        'delete_friend',
        'get_friends_study_time',
        'get_group_study_time_v3',
        'get_admin_dashboard_stats',
        'get_admin_user_study_summary'
      )
  ),
  0::bigint,
  'sensitive RPCs have no PUBLIC execute ACL'
);

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname in (
        'delete_unconfirmed_users',
        'send_friend_request',
        'accept_friend_request',
        'delete_friend',
        'get_friends_study_time',
        'get_group_study_time_v3',
        'get_admin_dashboard_stats',
        'get_admin_user_study_summary'
      )
  ),
  0::bigint,
  'anon has no effective execute access to sensitive RPCs'
);

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'service_role has no unnecessary application RPC execution privileges'
);

select ok(
  has_function_privilege('authenticated', 'public.send_friend_request(text)', 'EXECUTE'),
  'authenticated can execute the supported friend-request RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.accept_friend_request(uuid)', 'EXECUTE'),
  'authenticated can execute the supported friend-accept RPC'
);

select is(
  to_regprocedure('public.add_friend(uuid)'),
  null::regprocedure,
  'the consent-bypassing add_friend RPC was removed'
);

select is(
  to_regprocedure('public.get_user_id_by_email(text)'),
  null::regprocedure,
  'the direct email-to-user-id lookup RPC was removed'
);

select is(
  to_regprocedure('public.get_group_study_time(uuid,text)'),
  null::regprocedure,
  'the legacy unrestricted group stats RPC was removed'
);

select is(
  to_regprocedure('public.get_group_study_time_v2(text,uuid)'),
  null::regprocedure,
  'the second legacy unrestricted group stats RPC was removed'
);

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not coalesce(p.proconfig, '{}'::text[])
        @> array['search_path=""']::text[]
  ),
  0::bigint,
  'every SECURITY DEFINER function has an empty fixed search_path'
);

set local role postgres;
create function public.__security_acl_probe()
returns integer
language sql
as $$ select 1 $$;
reset role;

select ok(
  not has_function_privilege('anon', 'public.__security_acl_probe()', 'EXECUTE')
    and not has_function_privilege(
      'authenticated',
      'public.__security_acl_probe()',
      'EXECUTE'
    )
    and not has_function_privilege(
      'service_role',
      'public.__security_acl_probe()',
      'EXECUTE'
    ),
  'new functions do not regain client or service-role execute by default'
);

select is(
  has_table_privilege('authenticated', 'public.friendships', 'INSERT'),
  false,
  'authenticated cannot directly create a friendship'
);

select is(
  has_column_privilege('authenticated', 'public.friendships', 'friend_id', 'UPDATE'),
  false,
  'authenticated cannot rewrite friendship identity columns'
);

select ok(
  has_column_privilege('authenticated', 'public.friendships', 'nickname', 'UPDATE'),
  'authenticated can still update a local friend nickname'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000001',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$insert into public.friendships (user_id, friend_id)
      values (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
      )$$
  ),
  '42501',
  'direct SQL cannot create a friendship without acceptance'
);

select is(
  tests.capture_sqlstate(
    $$select public.send_friend_request('member-b@example.invalid')$$
  ),
  null::text,
  'member A can send a normal friend request'
);

reset role;

select is(
  (
    select count(*)
    from public.friend_requests
    where sender_id = '00000000-0000-0000-0000-000000000001'
      and receiver_id = '00000000-0000-0000-0000-000000000002'
      and status = 'pending'
  ),
  1::bigint,
  'the normal friend request is pending exactly once'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000002',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$select public.accept_friend_request(
      (
        select id
        from public.friend_requests
        where sender_id = '00000000-0000-0000-0000-000000000001'
          and receiver_id = '00000000-0000-0000-0000-000000000002'
      )
    )$$
  ),
  null::text,
  'the intended receiver can accept the friend request'
);

reset role;

select is(
  (
    select count(*)
    from public.friendships
    where (user_id, friend_id) in (
      (
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid
      ),
      (
        '00000000-0000-0000-0000-000000000002'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid
      )
    )
  ),
  2::bigint,
  'acceptance creates one friendship row in each direction'
);

insert into public.groups (id, name, code, leader_id)
values (
  '10000000-0000-0000-0000-000000000001',
  'Security Test Group',
  'security-test-group',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.group_members (group_id, user_id)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );

insert into public.study_sessions (user_id, group_id, duration, created_at)
values
  (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    60,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    120,
    now()
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000001',
  'authenticated'
);
set local role authenticated;

select is(
  (
    select total_seconds
    from public.get_friends_study_time(
      '00000000-0000-0000-0000-000000000001',
      current_date::text
    )
    where friend_id = '00000000-0000-0000-0000-000000000002'
  ),
  120::integer,
  'a caller can read study time for an actual friend'
);

select is(
  tests.capture_sqlstate(
    format(
      'select * from public.get_friends_study_time(%L::uuid, %L)',
      '00000000-0000-0000-0000-000000000003',
      current_date::text
    )
  ),
  '42501',
  'a caller cannot supply another user_id to read friend stats'
);

select is(
  (
    select sum(total_seconds)::bigint
    from public.get_group_study_time_v3(
      '10000000-0000-0000-0000-000000000001',
      now() - interval '1 day',
      now() + interval '1 day'
    )
  ),
  180::bigint,
  'a group member can read the normal group aggregate'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000003',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$select * from public.get_group_study_time_v3(
      '10000000-0000-0000-0000-000000000001',
      now() - interval '1 day',
      now() + interval '1 day'
    )$$
  ),
  '42501',
  'a nonmember cannot read group study statistics'
);

reset role;

select is(
  has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE'),
  false,
  'authenticated has no table-wide push subscription UPDATE privilege'
);

select ok(
  has_column_privilege('authenticated', 'public.push_subscriptions', 'keys', 'UPDATE'),
  'authenticated can update push subscription keys for upsert'
);

select is(
  has_column_privilege('authenticated', 'public.push_subscriptions', 'created_at', 'UPDATE'),
  false,
  'authenticated cannot rewrite push subscription creation time'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000001',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$insert into public.push_subscriptions (user_id, endpoint, keys)
      values (
        '00000000-0000-0000-0000-000000000001',
        'test-endpoint-a',
        '{"p256dh":"first","auth":"first"}'::jsonb
      )
      on conflict (endpoint) do update
      set user_id = excluded.user_id,
          endpoint = excluded.endpoint,
          keys = excluded.keys$$
  ),
  null::text,
  'the first push subscription insert succeeds'
);

select is(
  tests.capture_sqlstate(
    $$insert into public.push_subscriptions (user_id, endpoint, keys)
      values (
        '00000000-0000-0000-0000-000000000001',
        'test-endpoint-a',
        '{"p256dh":"second","auth":"second"}'::jsonb
      )
      on conflict (endpoint) do update
      set user_id = excluded.user_id,
          endpoint = excluded.endpoint,
          keys = excluded.keys$$
  ),
  null::text,
  'the current client upsert path can update an owned subscription'
);

select is(
  tests.capture_sqlstate(
    $$update public.push_subscriptions
      set created_at = now() - interval '1 day'
      where endpoint = 'test-endpoint-a'$$
  ),
  '42501',
  'a client cannot rewrite protected push subscription metadata'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select tests.set_auth_context(
  '00000000-0000-0000-0000-000000000002',
  'authenticated'
);
set local role authenticated;

select is(
  tests.capture_sqlstate(
    $$insert into public.push_subscriptions (user_id, endpoint, keys)
      values (
        '00000000-0000-0000-0000-000000000002',
        'test-endpoint-a',
        '{"p256dh":"other","auth":"other"}'::jsonb
      )
      on conflict (endpoint) do update
      set user_id = excluded.user_id,
          endpoint = excluded.endpoint,
          keys = excluded.keys$$
  ),
  '42501',
  'another user cannot claim an existing push subscription row'
);

reset role;

select is(
  (
    select user_id
    from public.push_subscriptions
    where endpoint = 'test-endpoint-a'
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'the subscription remains owned by the original user'
);

select is(
  (
    select keys ->> 'p256dh'
    from public.push_subscriptions
    where endpoint = 'test-endpoint-a'
  ),
  'second',
  'the owned subscription upsert persisted the latest keys once'
);

select * from finish();
rollback;
