-- Add nickname column to group_members
alter table public.group_members add column if not exists nickname text;

-- Update RLS policies

-- Allow users to update their own nickname
create policy "Users can update their own member profile" on public.group_members
  for update using (auth.uid() = user_id);

-- Allow group leaders to delete members (kick)
-- We need a policy that checks if the current user is the leader of the group the member belongs to.
-- Since we can't easily join in RLS check without performance hit, but for small scale it's fine.
-- However, standard way is:
create policy "Group leaders can delete members" on public.group_members
  for delete using (
    exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
      and groups.leader_id = auth.uid()
    )
  );
