-- Add email to profiles if not exists
alter table public.profiles add column if not exists email text;

create table public.groups (
  id uuid not null default gen_random_uuid(),
  name text not null,
  code text not null,
  leader_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  constraint groups_pkey primary key (id),
  constraint groups_code_key unique (code)
);

create table public.group_members (
  id uuid not null default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamp with time zone not null default now(),
  constraint group_members_pkey primary key (id),
  constraint group_members_group_id_user_id_key unique (group_id, user_id)
);

-- RLS Policies
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "Groups are viewable by everyone" on public.groups
  for select using (true);

create policy "Users can create groups" on public.groups
  for insert with check (auth.uid() = leader_id);

create policy "Leaders can update their groups" on public.groups
  for update using (auth.uid() = leader_id);

create policy "Leaders can delete their groups" on public.groups
  for delete using (auth.uid() = leader_id);

create policy "Group members are viewable by everyone" on public.group_members
  for select using (true);

create policy "Users can join groups" on public.group_members
  for insert with check (auth.uid() = user_id);

create policy "Users can leave groups" on public.group_members
  for delete using (auth.uid() = user_id);
