-- Tighten profile visibility to self, friends, group members, and admins.
-- Also restrict group_members visibility to members of the same group.

-- Helper: check group membership without RLS recursion.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
  );
end;
$$;

-- Group members: restrict visibility to members of the same group.
drop policy if exists "Group members are viewable by everyone" on public.group_members;
drop policy if exists "Group members can view their groups" on public.group_members;
create policy "Group members can view their groups"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_members.group_id));

-- Profiles: remove broad visibility policies.
drop policy if exists "Authenticated users can view all profiles" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;

-- Profiles: allow self, friends, and group members (admins already allowed).
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Friends can view profiles" on public.profiles;
create policy "Friends can view profiles"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = profiles.id)
         or (f.user_id = profiles.id and f.friend_id = auth.uid())
    )
  );

drop policy if exists "Group members can view profiles" on public.profiles;
create policy "Group members can view profiles"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid()
        and gm2.user_id = profiles.id
    )
  );
