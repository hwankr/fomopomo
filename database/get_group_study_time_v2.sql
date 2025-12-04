-- Drop the existing v2 function
drop function if exists get_group_study_time_v2(uuid, text);
drop function if exists get_group_study_time_v2(text, uuid);

-- Create a v2 function with parameters in alphabetical order to satisfy PostgREST lookup
create or replace function get_group_study_time_v2(p_date text, p_group_id uuid)
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
grant execute on function get_group_study_time_v2 to authenticated;
