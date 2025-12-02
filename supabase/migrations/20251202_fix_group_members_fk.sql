-- Drop the existing foreign key to auth.users
alter table public.group_members
  drop constraint group_members_user_id_fkey;

-- Add new foreign key to public.profiles
alter table public.group_members
  add constraint group_members_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;
