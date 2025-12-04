-- Drop the existing function first to change signature if needed
drop function if exists get_group_study_time(uuid, date);

-- Create a function to get daily study time for group members
create or replace function get_group_study_time(p_group_id uuid, p_date text)
returns table (
  user_id uuid,
  total_seconds integer
)
language plpgsql
security definer
as $$
begin
  return query
  select
    gm.user_id,
    coalesce(sum(ss.duration), 0)::integer as total_seconds
  from
    group_members gm
  left join
    study_sessions ss on gm.user_id = ss.user_id
    and date(ss.created_at) = p_date::date
  where
    gm.group_id = p_group_id
  group by
    gm.user_id;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function get_group_study_time to authenticated;
