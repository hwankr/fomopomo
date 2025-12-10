-- Re-create changelogs table
create table if not exists public.changelogs (
    id uuid not null default gen_random_uuid(),
    version text not null,
    title text not null,
    content text not null,
    created_at timestamp with time zone not null default now(),
    constraint changelogs_pkey primary key (id)
);

-- Enable RLS
alter table public.changelogs enable row level security;

-- Policies for changelogs
-- Policy: "Anyone can view changelogs"
create policy "Anyone can view changelogs"
    on public.changelogs for select
    to authenticated, anon
    using (true);

-- Policy: "Admins can manage changelogs"
create policy "Admins can manage changelogs"
    on public.changelogs for all
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin'
        )
    );
