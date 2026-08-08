-- Forward-only migration.
--
-- Root cause being closed here:
--   The `public.accept_friend_request` RPC trusts the identity columns
--   (sender_id / receiver_id / sender_email) stored on a friend_requests row.
--   Those columns were still writable directly by browser clients:
--     * INSERT policy "Users can create requests" let any authenticated user
--       insert a row with sender_id = auth.uid() (including a self-request).
--     * UPDATE policy "Users can update requests received by them" gated only on
--       `auth.uid() = receiver_id` and carried NO `with check`, so the receiver
--       could rewrite ANY column of a row they received -- including sender_id.
--   Attack: insert a self-request (sender = receiver = attacker), then UPDATE
--   sender_id to a victim uuid, then call accept_friend_request. The RPC trusted
--   the forged sender_id and created a bidirectional friendship without the
--   victim's consent.
--
-- Fix strategy (defense in depth):
--   1. Remove all direct INSERT/UPDATE/DELETE access to public.friend_requests
--      from browser roles at BOTH the GRANT layer and the RLS-policy layer, so
--      identity columns can only ever be written by the trusted SECURITY DEFINER
--      RPCs. Direct SELECT stays so lists and Realtime keep working.
--   2. Route every state transition (send / accept / reject / cancel) through
--      SECURITY DEFINER RPCs that derive the caller identity from auth.uid() and
--      never trust client-supplied identity values.
--   3. Lock the target row FOR UPDATE inside accept/reject/cancel so concurrent
--      calls serialize and cannot produce duplicate or inconsistent friendships.
--
-- service_role is intentionally left untouched: the account-delete / account-reset
-- server routes clean up friend_requests through the service key.

-- 1. Close the direct DML surface on friend_requests for browser roles. ---------

revoke insert, update, delete on public.friend_requests
  from public, anon, authenticated;

revoke insert (
  id,
  sender_id,
  receiver_id,
  sender_email,
  receiver_email,
  status,
  created_at
) on public.friend_requests from public, anon, authenticated;

revoke update (
  id,
  sender_id,
  receiver_id,
  sender_email,
  receiver_email,
  status,
  created_at
) on public.friend_requests from public, anon, authenticated;

-- Reads (list of received requests + Realtime change feed) stay available.
grant select on public.friend_requests to authenticated;

-- 2. Drop the permissive write policies and keep a single scoped SELECT policy. -

drop policy if exists "Users can create requests" on public.friend_requests;
drop policy if exists "Users can update requests received by them" on public.friend_requests;
drop policy if exists "Users can update requests sent by them" on public.friend_requests;
drop policy if exists "Users can delete their own requests" on public.friend_requests;

drop policy if exists "Users can view requests sent by them or to them" on public.friend_requests;
create policy "Users can view requests sent by them or to them"
  on public.friend_requests
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Belt-and-suspenders: guarantee no write (INSERT/UPDATE/DELETE/ALL) policy
-- survives on friend_requests, regardless of prior manual bootstrap state.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'friend_requests'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format(
      'drop policy if exists %I on public.friend_requests',
      v_policy.policyname
    );
  end loop;
end;
$$;

-- 3. RPC-only state transitions. All derive identity from auth.uid(), lock the
--    target row FOR UPDATE, and reject disallowed transitions deterministically.

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
  where fr.id = request_id
  for update;

  -- Only the actual receiver of a still-pending request may accept it.
  if v_request.id is null
    or v_request.receiver_id <> v_caller_id
    or v_request.status <> 'pending' then
    raise exception 'Not authorized to accept this friend request'
      using errcode = '42501';
  end if;

  -- A self-directed request can never yield a real friendship.
  if v_request.sender_id = v_request.receiver_id then
    raise exception 'A friend request cannot target its own sender'
      using errcode = '22023';
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

revoke execute on function public.accept_friend_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.reject_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select fr.*
  into v_request
  from public.friend_requests as fr
  where fr.id = request_id
  for update;

  -- Only the actual receiver of a still-pending request may reject it.
  if v_request.id is null
    or v_request.receiver_id <> v_caller_id
    or v_request.status <> 'pending' then
    raise exception 'Not authorized to reject this friend request'
      using errcode = '42501';
  end if;

  update public.friend_requests as fr
  set status = 'rejected'
  where fr.id = request_id;
end;
$$;

revoke execute on function public.reject_friend_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reject_friend_request(uuid) to authenticated;

create or replace function public.cancel_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select fr.*
  into v_request
  from public.friend_requests as fr
  where fr.id = request_id
  for update;

  -- Only the original sender may withdraw their own still-pending request.
  if v_request.id is null
    or v_request.sender_id <> v_caller_id
    or v_request.status <> 'pending' then
    raise exception 'Not authorized to cancel this friend request'
      using errcode = '42501';
  end if;

  delete from public.friend_requests as fr
  where fr.id = request_id;
end;
$$;

revoke execute on function public.cancel_friend_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
