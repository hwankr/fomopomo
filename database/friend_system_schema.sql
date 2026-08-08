-- Friend-request subsystem bootstrap (HARDENED).
--
-- SECURITY NOTE:
--   Earlier revisions of this file created two permissive RLS policies on
--   public.friend_requests:
--     * INSERT  with check (auth.uid() = sender_id)          -- self-requests
--     * UPDATE  using (auth.uid() = receiver_id)  -- NO with check
--   Combined with the default table GRANTs, a receiver could rewrite ANY column
--   of a row they received -- including sender_id -- and then call
--   accept_friend_request, which trusted the forged sender_id and created a
--   friendship without the victim's consent.
--
--   This file has been rewritten so that re-running it can NEVER reintroduce
--   that attack surface. Direct INSERT/UPDATE/DELETE on friend_requests is
--   revoked from browser roles; only a scoped SELECT policy remains. Every state
--   transition (send / accept / reject / cancel) is performed exclusively by the
--   SECURITY DEFINER RPCs defined in the Supabase migration chain, which is the
--   single source of truth for those functions:
--     * supabase/migrations/20260807001129_harden_authorization_and_push_webhook.sql
--         (send_friend_request, accept_friend_request, delete_friend)
--     * supabase/migrations/20260808120000_lock_friend_request_dml.sql
--         (friend_requests DML lockdown, hardened accept_friend_request,
--          reject_friend_request, cancel_friend_request)
--
--   This bootstrap intentionally does NOT redefine those RPCs, to avoid drift
--   from the migrations. It only provisions the tables and their lockdown.

-- friend_requests table -------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references auth.users(id) not null,
  receiver_id uuid references auth.users(id) not null,
  sender_email text not null,
  receiver_email text,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamp with time zone default now(),
  unique(sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;

-- Remove any legacy permissive write policies. Never recreate them: identity
-- columns must only ever be written by the trusted RPCs.
drop policy if exists "Users can create requests" on public.friend_requests;
drop policy if exists "Users can update requests received by them" on public.friend_requests;
drop policy if exists "Users can update requests sent by them" on public.friend_requests;
drop policy if exists "Users can delete their own requests" on public.friend_requests;

-- Reads only. Senders and receivers may see their own rows (lists + Realtime).
drop policy if exists "Users can view requests sent by them or to them" on public.friend_requests;
create policy "Users can view requests sent by them or to them"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Defense line 2: revoke the direct write GRANTs from browser roles. service_role
-- is intentionally left intact (account-delete / account-reset cleanup paths).
revoke insert, update, delete on public.friend_requests from public, anon, authenticated;
grant select on public.friend_requests to authenticated;

-- friendships: reads only for the owning user; writes go through the RPCs. ------
alter table public.friendships enable row level security;

drop policy if exists "Users can view their own friendships" on public.friendships;
create policy "Users can view their own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- The consent-bypassing email->uuid lookup helper was removed during hardening
-- (migration 20260807001129). Drop it here too so a bootstrap re-run cannot
-- resurrect it.
drop function if exists public.get_user_id_by_email(text);
