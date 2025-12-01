-- Function to add friend bidirectionally
CREATE OR REPLACE FUNCTION add_friend(p_friend_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_user_id = p_friend_id THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  -- Insert A -> B
  INSERT INTO friendships (user_id, friend_id)
  VALUES (v_user_id, p_friend_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  -- Insert B -> A
  INSERT INTO friendships (user_id, friend_id)
  VALUES (p_friend_id, v_user_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
END;
$$;
