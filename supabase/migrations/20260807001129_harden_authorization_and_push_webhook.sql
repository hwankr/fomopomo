create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

alter default privileges revoke execute on functions from public;
alter default privileges revoke execute on functions from anon;
alter default privileges revoke execute on functions from authenticated;
alter default privileges revoke execute on functions from service_role;

alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres
  revoke execute on functions from anon;
alter default privileges for role postgres
  revoke execute on functions from authenticated;
alter default privileges for role postgres
  revoke execute on functions from service_role;

-- debug_logs is an internal operational sink. It must never be readable or
-- writable through a browser-facing database role.
revoke all privileges on table public.debug_logs from public, anon, authenticated, service_role;
revoke all privileges (
  id,
  message,
  details,
  created_at
) on table public.debug_logs from public, anon, authenticated, service_role;

drop policy if exists "Allow insert for everyone" on public.debug_logs;
drop policy if exists "Allow select for everyone" on public.debug_logs;
drop policy if exists "Enable insert for authenticated users only" on public.debug_logs;
drop policy if exists "Enable select for users based on user_id" on public.debug_logs;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'debug_logs'
  loop
    execute format(
      'drop policy if exists %I on public.debug_logs',
      v_policy.policyname
    );
  end loop;
end;
$$;

grant insert on table public.debug_logs to service_role;

with duplicate_friendships as (
  select ctid
  from (
    select
      f.ctid,
      row_number() over (
        partition by f.user_id, f.friend_id
        order by f.created_at desc nulls last, f.id desc
      ) as rn
    from public.friendships as f
  ) as ranked
  where ranked.rn > 1
)
delete from public.friendships as f
where f.ctid in (select d.ctid from duplicate_friendships as d);

do $$
begin
  if not exists (
    select 1
    from pg_constraint as c
    where c.conrelid = 'public.friendships'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (select a.attnum from pg_attribute as a where a.attrelid = 'public.friendships'::regclass and a.attname = 'user_id'),
        (select a.attnum from pg_attribute as a where a.attrelid = 'public.friendships'::regclass and a.attname = 'friend_id')
      ]::smallint[]
  ) then
    alter table public.friendships
      add constraint friendships_user_friend_unique unique (user_id, friend_id);
  end if;
end;
$$;

with duplicate_friend_requests as (
  select ctid
  from (
    select
      fr.ctid,
      row_number() over (
        partition by fr.sender_id, fr.receiver_id
        order by fr.created_at desc nulls last, fr.id desc
      ) as rn
    from public.friend_requests as fr
  ) as ranked
  where ranked.rn > 1
)
delete from public.friend_requests as fr
where fr.ctid in (select d.ctid from duplicate_friend_requests as d);

do $$
begin
  if not exists (
    select 1
    from pg_constraint as c
    where c.conrelid = 'public.friend_requests'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (select a.attnum from pg_attribute as a where a.attrelid = 'public.friend_requests'::regclass and a.attname = 'sender_id'),
        (select a.attnum from pg_attribute as a where a.attrelid = 'public.friend_requests'::regclass and a.attname = 'receiver_id')
      ]::smallint[]
  ) then
    alter table public.friend_requests
      add constraint friend_requests_sender_receiver_unique unique (sender_id, receiver_id);
  end if;
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles as p
    where p.id = v_user_id
      and p.role = 'admin'
  );
end;
$$;

revoke execute on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = v_user_id
  );
end;
$$;

revoke execute on function public.is_group_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_group_member(uuid) to authenticated;

revoke update on public.profiles from public, anon, authenticated;
revoke update (
  id,
  username,
  invite_code,
  status,
  current_task,
  last_active_at,
  is_task_public,
  email,
  role,
  created_at,
  nickname,
  study_start_time,
  total_stopwatch_time,
  timer_type,
  timer_mode,
  timer_duration
) on public.profiles from public, anon, authenticated;

grant update (
  status,
  current_task,
  last_active_at,
  is_task_public,
  study_start_time,
  total_stopwatch_time,
  timer_type,
  timer_mode,
  timer_duration
) on public.profiles to authenticated;

grant update on public.profiles to service_role;

revoke insert on public.friendships from public, anon, authenticated;
revoke insert (
  id,
  user_id,
  friend_id,
  created_at,
  nickname,
  group_name,
  friend_email,
  is_notification_enabled
) on public.friendships from public, anon, authenticated;
drop policy if exists "Users can insert friendships." on public.friendships;
drop policy if exists "Users can insert friendships" on public.friendships;

revoke update on public.friendships from public, anon, authenticated;
revoke update (
  id,
  user_id,
  friend_id,
  created_at,
  nickname,
  group_name,
  friend_email,
  is_notification_enabled
) on public.friendships from public, anon, authenticated;

grant update (
  nickname,
  group_name,
  is_notification_enabled
) on public.friendships to authenticated;

drop policy if exists "Users can update their own friendships" on public.friendships;
create policy "Users can update their own friendships"
on public.friendships
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke update on public.push_subscriptions from public, anon, authenticated;
revoke update (
  id,
  user_id,
  endpoint,
  keys,
  created_at
) on public.push_subscriptions from public, anon, authenticated;

grant update (
  user_id,
  endpoint,
  keys
) on public.push_subscriptions to authenticated;

drop policy if exists "Users can update their own subscriptions" on public.push_subscriptions;
create policy "Users can update their own subscriptions"
on public.push_subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function private.guard_profile_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_auth_admin', 'supabase_admin')
    or auth.role() = 'service_role' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.invite_code is distinct from old.invite_code
    or new.created_at is distinct from old.created_at then
    raise exception 'Updating protected profile fields is not allowed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_profile_protected_columns() from public, anon, authenticated, service_role;

drop trigger if exists guard_profile_protected_columns on public.profiles;
create trigger guard_profile_protected_columns
before update on public.profiles
for each row
execute function private.guard_profile_protected_columns();

drop policy if exists "Users can update own profile." on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nickname, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'user'
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles as p
  set nickname = new.raw_user_meta_data ->> 'full_name'
  where p.id = new.id;

  return new;
end;
$$;

revoke execute on function public.handle_user_update() from public, anon, authenticated, service_role;

create or replace function public.trim_push_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_subscriptions integer := 5;
begin
  delete from public.push_subscriptions as ps
  where ps.id in (
    select stale.id
    from public.push_subscriptions as stale
    where stale.user_id = new.user_id
    order by stale.created_at desc
    offset v_max_subscriptions
  );

  return null;
end;
$$;

revoke execute on function public.trim_push_subscriptions() from public, anon, authenticated, service_role;

create or replace function public.send_friend_request(receiver_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_email text;
  v_target_id uuid;
  v_target_email text;
  v_existing_request public.friend_requests%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select u.email
  into v_caller_email
  from auth.users as u
  where u.id = v_caller_id;

  if v_caller_email is null then
    raise exception 'Caller email unavailable' using errcode = '42501';
  end if;

  select u.id, u.email
  into v_target_id, v_target_email
  from auth.users as u
  where lower(u.email) = lower(receiver_email)
  limit 1;

  if v_target_id is null or v_target_id = v_caller_id then
    return;
  end if;

  if exists (
    select 1
    from public.friendships as f
    where f.user_id = v_caller_id
      and f.friend_id = v_target_id
  ) then
    return;
  end if;

  select fr.*
  into v_existing_request
  from public.friend_requests as fr
  where (fr.sender_id = v_caller_id and fr.receiver_id = v_target_id)
     or (fr.sender_id = v_target_id and fr.receiver_id = v_caller_id)
  order by
    case fr.status
      when 'pending' then 0
      when 'accepted' then 1
      when 'rejected' then 2
      else 3
    end,
    fr.created_at desc
  limit 1;

  if found then
    if v_existing_request.status in ('pending', 'accepted') then
      return;
    end if;

    update public.friend_requests as fr
    set sender_id = v_caller_id,
        receiver_id = v_target_id,
        sender_email = v_caller_email,
        receiver_email = v_target_email,
        status = 'pending',
        created_at = now()
    where fr.id = v_existing_request.id;

    delete from public.friend_requests as fr
    where fr.id <> v_existing_request.id
      and (
        (fr.sender_id = v_caller_id and fr.receiver_id = v_target_id)
        or (fr.sender_id = v_target_id and fr.receiver_id = v_caller_id)
      );

    return;
  end if;

  insert into public.friend_requests (
    sender_id,
    receiver_id,
    sender_email,
    receiver_email
  )
  values (
    v_caller_id,
    v_target_id,
    v_caller_email,
    v_target_email
  )
  on conflict (sender_id, receiver_id) do nothing;
exception
  when unique_violation then
    return;
end;
$$;

revoke execute on function public.send_friend_request(text) from public, anon, authenticated, service_role;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
  v_sender_email text;
  v_receiver_email text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select fr.*
  into v_request
  from public.friend_requests as fr
  where fr.id = request_id;

  if v_request.id is null
    or v_request.receiver_id <> v_caller_id
    or v_request.status <> 'pending' then
    raise exception 'Not authorized to accept this friend request'
      using errcode = '42501';
  end if;

  select u.email
  into v_sender_email
  from auth.users as u
  where u.id = v_request.sender_id;

  select u.email
  into v_receiver_email
  from auth.users as u
  where u.id = v_request.receiver_id;

  update public.friend_requests as fr
  set status = 'accepted'
  where fr.id = request_id;

  insert into public.friendships (user_id, friend_id, friend_email)
  values (v_request.sender_id, v_request.receiver_id, v_receiver_email)
  on conflict (user_id, friend_id) do update
    set friend_email = excluded.friend_email;

  insert into public.friendships (user_id, friend_id, friend_email)
  values (v_request.receiver_id, v_request.sender_id, v_sender_email)
  on conflict (user_id, friend_id) do update
    set friend_email = excluded.friend_email;
end;
$$;

revoke execute on function public.accept_friend_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.delete_friend(friend_uuid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.friendships as f
  where (f.user_id = v_caller_id and f.friend_id = friend_uuid)
     or (f.user_id = friend_uuid and f.friend_id = v_caller_id);

  delete from public.friend_requests as fr
  where (fr.sender_id = v_caller_id and fr.receiver_id = friend_uuid)
     or (fr.sender_id = friend_uuid and fr.receiver_id = v_caller_id);
end;
$$;

revoke execute on function public.delete_friend(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_friend(uuid) to authenticated;

drop function if exists public.add_friend(uuid);
drop function if exists public.get_user_id_by_email(text);
drop function if exists public.get_group_study_time(uuid, text);
drop function if exists public.get_group_study_time_v2(text, uuid);
drop function if exists public.get_group_study_time_v2(uuid, text);

create or replace function public.get_friends_study_time(p_user_id uuid, p_date text)
returns table (
  friend_id uuid,
  total_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_target_date date := p_date::date;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_user_id is distinct from v_caller_id then
    raise exception 'Not authorized to read another user''s friend stats'
      using errcode = '42501';
  end if;

  return query
  select
    f.friend_id,
    coalesce(sum(ss.duration), 0)::integer as total_seconds
  from public.friendships as f
  left join public.study_sessions as ss
    on ss.user_id = f.friend_id
   and ss.created_at::date = v_target_date
  where f.user_id = v_caller_id
  group by f.friend_id;
end;
$$;

revoke execute on function public.get_friends_study_time(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.get_friends_study_time(uuid, text) to authenticated;

create or replace function public.get_group_study_time_v3(
  p_group_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  user_id uuid,
  total_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_start_time is null
    or p_end_time is null
    or p_start_time >= p_end_time then
    raise exception 'Invalid time range' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = v_caller_id
  ) then
    raise exception 'Group membership required' using errcode = '42501';
  end if;

  return query
  select
    gm.user_id,
    coalesce(sum(ss.duration), 0)::integer as total_seconds
  from public.group_members as gm
  left join public.study_sessions as ss
    on ss.user_id = gm.user_id
   and ss.group_id = p_group_id
   and ss.created_at >= p_start_time
   and ss.created_at <= p_end_time
  where gm.group_id = p_group_id
  group by gm.user_id;
end;
$$;

revoke execute on function public.get_group_study_time_v3(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_group_study_time_v3(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_admin_dashboard_stats(p_day_start timestamptz)
returns table (
  total_users bigint,
  active_users_today bigint,
  total_study_time bigint,
  new_users_today bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (
      select count(distinct ss.user_id)
      from public.study_sessions as ss
      where ss.created_at >= p_day_start
    ),
    (
      select coalesce(sum(ss.duration), 0)::bigint
      from public.study_sessions as ss
    ),
    (
      select count(*)
      from public.profiles as p
      where p.created_at >= p_day_start
    );
end;
$$;

revoke execute on function public.get_admin_dashboard_stats(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_dashboard_stats(timestamptz) to authenticated;

create or replace function public.get_admin_user_study_summary(p_user_id uuid)
returns table (
  total_study_time bigint,
  session_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(ss.duration), 0)::bigint,
    count(*)
  from public.study_sessions as ss
  where ss.user_id = p_user_id;
end;
$$;

revoke execute on function public.get_admin_user_study_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_user_study_summary(uuid) to authenticated;

create or replace function private.delete_unconfirmed_users()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmation_column text;
begin
  select a.attname
  into v_confirmation_column
  from pg_catalog.pg_attribute as a
  where a.attrelid = 'auth.users'::regclass
    and a.attname in ('email_confirmed_at', 'confirmed_at')
    and not a.attisdropped
  order by case a.attname
    when 'email_confirmed_at' then 0
    else 1
  end
  limit 1;

  if v_confirmation_column is null then
    raise exception 'No supported confirmation timestamp exists on auth.users';
  end if;

  execute format(
    'delete from auth.users as u where u.%I is null and u.created_at < now() - interval ''3 minutes''',
    v_confirmation_column
  );
end;
$$;

revoke execute on function private.delete_unconfirmed_users() from public, anon, authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  if not exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    return;
  end if;

  for v_job_id in
    select j.jobid
    from cron.job as j
    where j.jobname = 'delete-unconfirmed-users'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'delete-unconfirmed-users',
    '* * * * *',
    $job$select private.delete_unconfirmed_users();$job$
  );
end;
$$;

drop function if exists public.delete_unconfirmed_users();

-- Required Vault secret names:
--   push_notification_url
--   push_notification_webhook_secret
create or replace function private.enqueue_profile_status_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edge_url text;
  v_webhook_secret text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if to_regnamespace('vault') is null or to_regnamespace('net') is null then
    return new;
  end if;

  select ds.decrypted_secret
  into v_edge_url
  from vault.decrypted_secrets as ds
  where ds.name = 'push_notification_url'
  limit 1;

  select ds.decrypted_secret
  into v_webhook_secret
  from vault.decrypted_secrets as ds
  where ds.name = 'push_notification_webhook_secret'
  limit 1;

  if coalesce(v_edge_url, '') = '' or coalesce(v_webhook_secret, '') = '' then
    return new;
  end if;

  perform net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'status', new.status,
        'nickname', new.nickname,
        'current_task', new.current_task
      ),
      'old_record', jsonb_build_object(
        'status', old.status
      )
    )
  );

  return new;
end;
$$;

revoke execute on function private.enqueue_profile_status_webhook() from public, anon, authenticated, service_role;

do $$
declare
  v_trigger record;
  v_function record;
  v_function_oids oid[];
begin
  select array_agg(distinct p.oid)
  into v_function_oids
  from pg_trigger as t
  join pg_class as c
    on c.oid = t.tgrelid
  join pg_namespace as cn
    on cn.oid = c.relnamespace
  join pg_proc as p
    on p.oid = t.tgfoid
  join pg_namespace as pn
    on pn.oid = p.pronamespace
  where not t.tgisinternal
    and cn.nspname = 'public'
    and c.relname = 'profiles'
    and pg_get_triggerdef(t.oid) ilike '% after update %'
    and not (
      pn.nspname = 'private'
      and p.proname = 'enqueue_profile_status_webhook'
    )
    and (
      pg_get_functiondef(p.oid) ilike '%net.http_post%'
      or pg_get_functiondef(p.oid) ilike '%x-webhook-secret%'
      or pg_get_functiondef(p.oid) ilike '%authorization%'
      or t.tgname ilike '%push%'
      or t.tgname ilike '%webhook%'
    );

  for v_trigger in
    select
      t.tgname
    from pg_trigger as t
    join pg_class as c
      on c.oid = t.tgrelid
    join pg_namespace as cn
      on cn.oid = c.relnamespace
    join pg_proc as p
      on p.oid = t.tgfoid
    join pg_namespace as pn
      on pn.oid = p.pronamespace
    where not t.tgisinternal
      and cn.nspname = 'public'
      and c.relname = 'profiles'
      and pg_get_triggerdef(t.oid) ilike '% after update %'
      and not (
        pn.nspname = 'private'
        and p.proname = 'enqueue_profile_status_webhook'
      )
      and (
        pg_get_functiondef(p.oid) ilike '%net.http_post%'
        or pg_get_functiondef(p.oid) ilike '%x-webhook-secret%'
        or pg_get_functiondef(p.oid) ilike '%authorization%'
        or t.tgname ilike '%push%'
        or t.tgname ilike '%webhook%'
      )
  loop
    execute format(
      'drop trigger if exists %I on public.profiles',
      v_trigger.tgname
    );
  end loop;

  for v_function in
    select
      pn.nspname as function_schema,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as function_args
    from pg_proc as p
    join pg_namespace as pn
      on pn.oid = p.pronamespace
    where p.oid = any(coalesce(v_function_oids, array[]::oid[]))
  loop
    execute format(
      'drop function if exists %I.%I(%s)',
      v_function.function_schema,
      v_function.function_name,
      v_function.function_args
    );
  end loop;
end;
$$;

drop trigger if exists trigger_enqueue_profile_status_webhook on public.profiles;
create trigger trigger_enqueue_profile_status_webhook
after update of status on public.profiles
for each row
when (old.status is distinct from new.status)
execute function private.enqueue_profile_status_webhook();
