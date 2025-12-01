-- Create profiles table
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text,
  invite_code text unique default substr(md5(random()::text), 0, 8),
  status text check (status in ('online', 'offline', 'studying', 'paused')) default 'offline',
  current_task text,
  last_active_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Create policies
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Create friendships table
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  friend_id uuid references public.profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, friend_id)
);

-- Enable RLS
alter table public.friendships enable row level security;

-- Friendships policies
create policy "Users can see their own friendships."
  on friendships for select
  using ( auth.uid() = user_id or auth.uid() = friend_id );

create policy "Users can insert friendships."
  on friendships for insert
  with check ( auth.uid() = user_id );

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user
-- Note: You might need to drop the trigger first if it exists or use create or replace logic if supported for triggers (it's not directly).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
