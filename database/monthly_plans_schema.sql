-- Create monthly_plans table
create table public.monthly_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  month integer not null check (month >= 1 and month <= 12),
  year integer not null,
  status text check (status in ('todo', 'in_progress', 'done')) default 'todo',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.monthly_plans enable row level security;

-- Create policies
create policy "Users can view their own monthly plans"
  on public.monthly_plans for select
  using (auth.uid() = user_id);

create policy "Users can insert their own monthly plans"
  on public.monthly_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own monthly plans"
  on public.monthly_plans for update
  using (auth.uid() = user_id);

create policy "Users can delete their own monthly plans"
  on public.monthly_plans for delete
  using (auth.uid() = user_id);
