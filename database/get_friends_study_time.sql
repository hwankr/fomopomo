-- Function to get daily study time for a user's friends
-- This is used to display accumulated study time in the friend list

drop function if exists get_friends_study_time(uuid, text);

create or replace function get_friends_study_time(p_user_id uuid, p_date text)
returns table (
  friend_id uuid,
  total_seconds integer
)
language plpgsql
security definer
as $$
begin
  return query
  select
    f.friend_id,
    coalesce(sum(ss.duration), 0)::integer as total_seconds
  from
    friendships f
  left join
    study_sessions ss on f.friend_id = ss.user_id
    and date(ss.created_at) = p_date::date
  where
    f.user_id = p_user_id
  group by
    f.friend_id;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function get_friends_study_time to authenticated;
