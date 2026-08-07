create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_group_leader(p_group_id uuid)
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
    from public.groups as g
    where g.id = p_group_id
      and g.leader_id = v_user_id
  );
end;
$$;

revoke execute on function public.is_group_leader(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_group_leader(uuid) to authenticated;

create or replace function private.generate_group_code()
returns text
language sql
set search_path = ''
as $$
  with bytes as (
    select extensions.gen_random_bytes(6) as raw_bytes
  )
  select string_agg(
    substr(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      (get_byte(bytes.raw_bytes, g.idx - 1) % 36) + 1,
      1
    ),
    '' order by g.idx
  )
  from bytes
  cross join generate_series(1, 6) as g(idx);
$$;

revoke execute on function private.generate_group_code() from public, anon, authenticated, service_role;

create or replace function public.feedback_image_path_matches_user(
  p_user_id uuid,
  p_object_path text
)
returns boolean
language plpgsql
stable
strict
set search_path = ''
as $$
begin
  if p_user_id is null or p_object_path is null then
    return false;
  end if;

  return p_object_path ~ format(
    '^%s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif)$',
    p_user_id::text
  );
end;
$$;

revoke execute on function public.feedback_image_path_matches_user(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.feedback_image_path_matches_user(uuid, text) to authenticated;
grant execute on function public.feedback_image_path_matches_user(uuid, text) to service_role;

create or replace function public.is_safe_push_endpoint(p_endpoint text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_endpoint text := btrim(p_endpoint);
  v_host text;
begin
  if v_endpoint !~* '^https://[^[:space:]]+$' then
    return false;
  end if;

  if v_endpoint ~* '^https://[^/?#]*@' then
    return false;
  end if;

  v_host := substring(v_endpoint from '^https://(\[[^]]+\]|[^/:?#]+)');
  if v_host is null then
    return false;
  end if;

  v_host := lower(v_host);

  if v_host = 'localhost' or v_host like '%.localhost' then
    return false;
  end if;

  if v_host ~ '^\[[0-9a-f:.]+\]$'
    or v_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then
    return false;
  end if;

  return v_host in (
    'fcm.googleapis.com',
    'notify.windows.com',
    'push.services.mozilla.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com'
  )
    or v_host like '%.notify.windows.com'
    or v_host like '%.push.apple.com'
    or v_host like '%.push.services.mozilla.com';
end;
$$;

revoke execute on function public.is_safe_push_endpoint(text) from public, anon, authenticated, service_role;
grant execute on function public.is_safe_push_endpoint(text) to authenticated;
grant execute on function public.is_safe_push_endpoint(text) to service_role;

do $$
begin
  if exists (
    select 1
    from public.group_members as gm
    group by gm.group_id, gm.user_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate group_members rows must be resolved before applying this migration'
      using errcode = '23505';
  end if;

  if not exists (
    select 1
    from pg_constraint as c
    where c.conrelid = 'public.group_members'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute as a
          where a.attrelid = 'public.group_members'::regclass
            and a.attname = 'group_id'
        ),
        (
          select a.attnum
          from pg_attribute as a
          where a.attrelid = 'public.group_members'::regclass
            and a.attname = 'user_id'
        )
      ]::smallint[]
  ) then
    alter table public.group_members
      add constraint group_members_group_id_user_id_key unique (group_id, user_id);
  end if;
end;
$$;

revoke all privileges on table public.groups from anon, authenticated;
grant select (id, name, leader_id, created_at) on table public.groups to authenticated;
grant update (name) on table public.groups to authenticated;
grant delete on table public.groups to authenticated;

revoke all privileges on table public.group_members from anon, authenticated;
grant select (id, group_id, user_id, joined_at, nickname) on table public.group_members to authenticated;
grant update (nickname) on table public.group_members to authenticated;
grant delete on table public.group_members to authenticated;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname, p.tablename
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename in ('groups', 'group_members')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  end loop;
end;
$$;

create policy "Group members can view groups"
on public.groups
for select
to authenticated
using (
  public.is_group_member(groups.id)
  or public.is_group_leader(groups.id)
);

create policy "Group leaders can update groups"
on public.groups
for update
to authenticated
using ((select auth.uid()) = leader_id)
with check (
  (select auth.uid()) = leader_id
  and char_length(btrim(name)) between 1 and 100
);

create policy "Group leaders can delete groups"
on public.groups
for delete
to authenticated
using ((select auth.uid()) = leader_id);

create policy "Group members can view memberships"
on public.group_members
for select
to authenticated
using (
  public.is_group_member(group_members.group_id)
  or public.is_group_leader(group_members.group_id)
);

create policy "Group members can update their nickname"
on public.group_members
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_group_member(group_members.group_id)
)
with check (
  (select auth.uid()) = user_id
  and public.is_group_member(group_members.group_id)
);

create policy "Group members can leave groups"
on public.group_members
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_group_member(group_members.group_id)
);

create policy "Group leaders can delete memberships"
on public.group_members
for delete
to authenticated
using (public.is_group_leader(group_members.group_id));

create or replace function public.create_group(p_name text)
returns table (
  id uuid,
  name text,
  leader_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_group public.groups%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_group_name) < 1 or char_length(v_group_name) > 100 then
    raise exception 'Group name must be between 1 and 100 characters'
      using errcode = '22023';
  end if;

  for v_attempt in 1..32 loop
    v_code := private.generate_group_code();

    begin
      insert into public.groups (name, code, leader_id)
      values (v_group_name, v_code, v_user_id)
      returning *
      into v_group;

      insert into public.group_members (group_id, user_id)
      values (v_group.id, v_user_id)
      on conflict (group_id, user_id) do nothing;

      return query
      select v_group.id, v_group.name, v_group.leader_id, v_group.created_at;
      return;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  raise exception 'Could not allocate a unique group code'
    using errcode = '23505';
end;
$$;

revoke execute on function public.create_group(text) from public, anon, authenticated, service_role;
grant execute on function public.create_group(text) to authenticated;

create or replace function public.join_group_by_code(p_code text)
returns table (
  id uuid,
  name text,
  leader_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_group public.groups%rowtype;
  v_match_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Invalid group code' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_match_count
  from public.groups as g
  where g.code = v_code;

  if v_match_count <> 1 then
    raise exception 'Invalid group code' using errcode = '22023';
  end if;

  select g.*
  into v_group
  from public.groups as g
  where g.code = v_code;

  insert into public.group_members (group_id, user_id)
  values (v_group.id, v_user_id)
  on conflict (group_id, user_id) do nothing;

  return query
  select v_group.id, v_group.name, v_group.leader_id, v_group.created_at;
end;
$$;

revoke execute on function public.join_group_by_code(text) from public, anon, authenticated, service_role;
grant execute on function public.join_group_by_code(text) to authenticated;

create or replace function public.get_group_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select g.code
  into v_code
  from public.groups as g
  where g.id = p_group_id
    and g.leader_id = v_user_id;

  if v_code is null then
    raise exception 'Not authorized to read this invite code'
      using errcode = '42501';
  end if;

  return v_code;
end;
$$;

revoke execute on function public.get_group_invite_code(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_group_invite_code(uuid) to authenticated;

create or replace function public.transfer_group_leadership(
  p_group_id uuid,
  p_new_leader_id uuid
)
returns table (
  id uuid,
  leader_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group public.groups%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select g.*
  into v_group
  from public.groups as g
  where g.id = p_group_id
    and g.leader_id = v_user_id
  for update;

  if v_group.id is null then
    raise exception 'Only the current leader can transfer leadership'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = p_new_leader_id
  ) then
    raise exception 'New leader must already be a group member'
      using errcode = '22023';
  end if;

  update public.groups as g
  set leader_id = p_new_leader_id
  where g.id = p_group_id
  returning g.id, g.leader_id
  into id, leader_id;

  return next;
end;
$$;

revoke execute on function public.transfer_group_leadership(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.transfer_group_leadership(uuid, uuid) to authenticated;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname, p.tablename
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename in ('feedbacks', 'feedback_replies', 'feedback_images')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  end loop;
end;
$$;

revoke all privileges on table public.feedbacks from anon, authenticated;
grant select, delete on table public.feedbacks to authenticated;
grant insert (content, category, user_id) on table public.feedbacks to authenticated;
grant update (content, category, status) on table public.feedbacks to authenticated;

revoke all privileges on table public.feedback_replies from anon, authenticated;
grant select, delete on table public.feedback_replies to authenticated;
grant insert (feedback_id, user_id, content) on table public.feedback_replies to authenticated;

create policy "Authenticated users can view all feedbacks"
on public.feedbacks
for select
to authenticated
using (true);

create policy "Users can create feedback"
on public.feedbacks
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and char_length(btrim(content)) > 0
);

create policy "Users can delete their own feedbacks"
on public.feedbacks
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Admins can delete feedbacks"
on public.feedbacks
for delete
to authenticated
using (public.is_admin());

create policy "Authors can update their pending feedbacks"
on public.feedbacks
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and status = 'pending'
)
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
  and char_length(btrim(content)) > 0
);

create policy "Admins can update feedbacks"
on public.feedbacks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Authenticated users can view all replies"
on public.feedback_replies
for select
to authenticated
using (true);

create policy "Authenticated users can insert replies"
on public.feedback_replies
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and char_length(btrim(content)) > 0
  and exists (
    select 1
    from public.feedbacks as f
    where f.id = feedback_replies.feedback_id
  )
);

create policy "Users can delete their own replies"
on public.feedback_replies
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Admins can delete any reply"
on public.feedback_replies
for delete
to authenticated
using (public.is_admin());

create table if not exists public.feedback_images (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'feedback-uploads',
  object_path text not null,
  feedback_id uuid references public.feedbacks(id) on delete cascade,
  reply_id uuid references public.feedback_replies(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint feedback_images_exactly_one_target_check
    check ((feedback_id is null) <> (reply_id is null)),
  constraint feedback_images_bucket_check
    check (bucket_id = 'feedback-uploads'),
  constraint feedback_images_object_path_check
    check (public.feedback_image_path_matches_user(user_id, object_path)),
  constraint feedback_images_bucket_object_path_key
    unique (bucket_id, object_path)
);

create index if not exists feedback_images_feedback_id_idx
  on public.feedback_images (feedback_id)
  where feedback_id is not null;

create index if not exists feedback_images_reply_id_idx
  on public.feedback_images (reply_id)
  where reply_id is not null;

create index if not exists feedback_images_user_id_idx
  on public.feedback_images (user_id);

alter table public.feedback_images enable row level security;

revoke all privileges on table public.feedback_images from public, anon, authenticated, service_role;
grant select, delete on table public.feedback_images to authenticated;
grant insert (user_id, bucket_id, object_path, feedback_id, reply_id) on table public.feedback_images to authenticated;
grant select, insert, update, delete on table public.feedback_images to service_role;

create policy "Authenticated users can view feedback image metadata"
on public.feedback_images
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.feedbacks as f
    where f.id = feedback_images.feedback_id
  )
  or exists (
    select 1
    from public.feedback_replies as fr
    where fr.id = feedback_images.reply_id
  )
);

create policy "Users can attach images to their own feedback"
on public.feedback_images
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and bucket_id = 'feedback-uploads'
  and public.feedback_image_path_matches_user(user_id, object_path)
  and (
    (
      feedback_id is not null
      and reply_id is null
      and exists (
        select 1
        from public.feedbacks as f
        where f.id = feedback_images.feedback_id
          and f.user_id = (select auth.uid())
      )
    )
    or (
      reply_id is not null
      and feedback_id is null
      and exists (
        select 1
        from public.feedback_replies as fr
        where fr.id = feedback_images.reply_id
          and fr.user_id = (select auth.uid())
      )
    )
  )
);

create policy "Users can delete their own feedback image metadata"
on public.feedback_images
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets as b (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'feedback-uploads',
  'feedback-uploads',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Feedback uploads owner select" on storage.objects;
drop policy if exists "Feedback uploads owner insert" on storage.objects;
drop policy if exists "Feedback uploads owner update" on storage.objects;
drop policy if exists "Feedback uploads owner delete" on storage.objects;

create policy "Feedback uploads owner select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'feedback-uploads'
  and (
    coalesce(owner_id::text, '') = coalesce((select auth.uid())::text, '')
    or exists (
      select 1
      from public.feedback_images as fi
      where fi.bucket_id = storage.objects.bucket_id
        and fi.object_path = storage.objects.name
    )
  )
);

create policy "Feedback uploads owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feedback-uploads'
  and coalesce(owner_id::text, '') = coalesce((select auth.uid())::text, '')
  and public.feedback_image_path_matches_user((select auth.uid()), name)
);

create policy "Feedback uploads owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'feedback-uploads'
  and coalesce(owner_id::text, '') = coalesce((select auth.uid())::text, '')
  and public.feedback_image_path_matches_user((select auth.uid()), name)
)
with check (
  bucket_id = 'feedback-uploads'
  and coalesce(owner_id::text, '') = coalesce((select auth.uid())::text, '')
  and public.feedback_image_path_matches_user((select auth.uid()), name)
);

create policy "Feedback uploads owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'feedback-uploads'
  and coalesce(owner_id::text, '') = coalesce((select auth.uid())::text, '')
  and public.feedback_image_path_matches_user((select auth.uid()), name)
);

do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'push_subscriptions'
  loop
    execute format(
      'drop policy if exists %I on public.push_subscriptions',
      v_policy.policyname
    );
  end loop;
end;
$$;

revoke all privileges on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, keys) on table public.push_subscriptions to authenticated;
grant update (user_id, endpoint, keys) on table public.push_subscriptions to authenticated;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_safe_endpoint_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_safe_endpoint_check
  check (public.is_safe_push_endpoint(endpoint));

create or replace function private.guard_push_subscription_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_auth_admin', 'supabase_admin')
    or auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Changing push subscription owner is not allowed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_push_subscription_identity() from public, anon, authenticated, service_role;

drop trigger if exists guard_push_subscription_identity on public.push_subscriptions;
create trigger guard_push_subscription_identity
before update on public.push_subscriptions
for each row
execute function private.guard_push_subscription_identity();

create policy "Users can view their own subscriptions"
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_safe_push_endpoint(endpoint)
);

create policy "Users can update their own subscriptions"
on public.push_subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.is_safe_push_endpoint(endpoint)
);

create policy "Users can delete their own subscriptions"
on public.push_subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create table if not exists private.push_notification_events (
  event_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text
);

create index if not exists push_notification_events_user_kind_created_idx
  on private.push_notification_events (user_id, event_kind, created_at desc);

revoke all privileges on table private.push_notification_events from public, anon, authenticated, service_role;

create or replace function public.claim_push_notification_event(
  p_event_id uuid,
  p_user_id uuid,
  p_event_kind text,
  p_cooldown_seconds integer
)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_event_id uuid;
begin
  if current_user <> 'service_role'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_event_id is null or p_user_id is null or btrim(coalesce(p_event_kind, '')) = '' then
    raise exception 'event_id, user_id, and event_kind are required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_event_kind, 0));

  if exists (
    select 1
    from private.push_notification_events as e
    where e.event_id = p_event_id
  ) then
    return query select 'duplicate'::text;
    return;
  end if;

  if coalesce(p_cooldown_seconds, 0) > 0 then
    select e.event_id
    into v_recent_event_id
    from private.push_notification_events as e
    where e.user_id = p_user_id
      and e.event_kind = p_event_kind
      and e.created_at >= now() - make_interval(secs => p_cooldown_seconds)
    order by e.created_at desc
    limit 1;

    if v_recent_event_id is not null then
      insert into private.push_notification_events (
        event_id,
        user_id,
        event_kind,
        completed_at,
        outcome
      )
      values (
        p_event_id,
        p_user_id,
        p_event_kind,
        now(),
        'suppressed_cooldown'
      );

      return query select 'cooldown'::text;
      return;
    end if;
  end if;

  insert into private.push_notification_events (
    event_id,
    user_id,
    event_kind,
    outcome
  )
  values (
    p_event_id,
    p_user_id,
    p_event_kind,
    'pending'
  );

  return query select 'claimed'::text;
end;
$$;

revoke execute on function public.claim_push_notification_event(uuid, uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_push_notification_event(uuid, uuid, text, integer) to service_role;

create or replace function public.complete_push_notification_event(
  p_event_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'service_role'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_event_id is null then
    raise exception 'event_id is required' using errcode = '22023';
  end if;

  if p_outcome not in (
    'profile_not_studying',
    'no_recipients',
    'no_subscriptions',
    'no_safe_subscriptions',
    'delivered',
    'delivered_partial',
    'delivery_failed',
    'internal_error',
    'suppressed_cooldown'
  ) then
    raise exception 'Unsupported push event outcome'
      using errcode = '22023';
  end if;

  update private.push_notification_events as e
  set completed_at = now(),
      outcome = p_outcome
  where e.event_id = p_event_id;

  if not found then
    raise exception 'Push notification event not found'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.complete_push_notification_event(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_push_notification_event(uuid, text) to service_role;

create or replace function private.enqueue_profile_status_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edge_url text;
  v_webhook_secret text;
  v_event_id uuid := extensions.gen_random_uuid();
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status
    or new.status is distinct from 'studying'
    or old.status is not distinct from 'studying' then
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
      'event_id', v_event_id,
      'record', jsonb_build_object(
        'id', new.id,
        'status', new.status
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

drop trigger if exists trigger_enqueue_profile_status_webhook on public.profiles;
create trigger trigger_enqueue_profile_status_webhook
after update of status on public.profiles
for each row
when (old.status is distinct from new.status)
execute function private.enqueue_profile_status_webhook();
