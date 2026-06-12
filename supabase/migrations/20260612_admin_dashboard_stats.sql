-- Move admin dashboard aggregation into the database.
-- The dashboard previously fetched every profiles/study_sessions row and
-- aggregated client-side, which silently truncates at PostgREST's 1000-row
-- response limit. These functions aggregate server-side instead.

-- Dashboard stats. p_day_start is the viewer's local midnight so "today"
-- matches what the admin sees in their own timezone.
create or replace function public.get_admin_dashboard_stats(p_day_start timestamptz)
returns table (
  total_users bigint,
  active_users_today bigint,
  total_study_time bigint,
  new_users_today bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(distinct ss.user_id)
       from public.study_sessions ss
      where ss.created_at >= p_day_start),
    (select coalesce(sum(ss.duration), 0) from public.study_sessions ss),
    (select count(*) from public.profiles p where p.created_at >= p_day_start);
end;
$$;

revoke execute on function public.get_admin_dashboard_stats(timestamptz) from public, anon;
grant execute on function public.get_admin_dashboard_stats(timestamptz) to authenticated;

-- Per-user study totals for the admin user detail page.
create or replace function public.get_admin_user_study_summary(p_user_id uuid)
returns table (
  total_study_time bigint,
  session_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required';
  end if;

  return query
  select coalesce(sum(ss.duration), 0), count(*)
  from public.study_sessions ss
  where ss.user_id = p_user_id;
end;
$$;

revoke execute on function public.get_admin_user_study_summary(uuid) from public, anon;
grant execute on function public.get_admin_user_study_summary(uuid) to authenticated;
