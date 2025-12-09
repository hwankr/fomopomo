create or replace function get_group_study_time_v3(
  p_group_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  user_id uuid,
  total_seconds integer
)
language plpgsql
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
    and ss.created_at >= p_start_time
    and ss.created_at <= p_end_time
  where
    gm.group_id = p_group_id
  group by
    gm.user_id;
end;
$$;
