create or replace function delete_friend(friend_uuid uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Delete the friendship where the current user is the user_id
  delete from friendships
  where user_id = auth.uid() and friend_id = friend_uuid;

  -- Delete the reciprocal friendship where the current user is the friend_id
  delete from friendships
  where user_id = friend_uuid and friend_id = auth.uid();
end;
$$;
