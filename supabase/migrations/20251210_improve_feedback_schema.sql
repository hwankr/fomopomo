-- Add category column to feedbacks
alter table public.feedbacks 
add column if not exists category text check (category in ('bug', 'feature', 'other')) default 'other';

-- Create feedback_likes table
create table if not exists public.feedback_likes (
    user_id uuid references auth.users(id) on delete cascade not null,
    feedback_id uuid references public.feedbacks(id) on delete cascade not null,
    created_at timestamp with time zone not null default now(),
    primary key (user_id, feedback_id)
);

-- Enable RLS
alter table public.feedback_likes enable row level security;

-- Policies for feedback_likes

-- Policy: "Users can view all likes" (to count them)
create policy "Users can view all likes"
    on public.feedback_likes for select
    to authenticated
    using (true);

-- Policy: "Users can toggle their own likes"
create policy "Users can insert their own likes"
    on public.feedback_likes for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can delete their own likes"
    on public.feedback_likes for delete
    to authenticated
    using (auth.uid() = user_id);
