-- Drop potentially ambiguous or incorrect policies
drop policy if exists "Admins can manage changelogs" on public.changelogs;
drop policy if exists "Admins can delete changelogs" on public.changelogs;
drop policy if exists "Admins can update changelogs" on public.changelogs;
drop policy if exists "Admins can insert changelogs" on public.changelogs;

-- Re-create explicit policies for admins
create policy "Admins can insert changelogs"
    on public.changelogs for insert
    to authenticated
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin'
        )
    );

create policy "Admins can update changelogs"
    on public.changelogs for update
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin'
        )
    );

create policy "Admins can delete changelogs"
    on public.changelogs for delete
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin'
        )
    );
