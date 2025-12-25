-- Add is_leaderboard_participant column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_leaderboard_participant BOOLEAN DEFAULT false;

-- Create RPC function to get monthly leaderboard
CREATE OR REPLACE FUNCTION get_monthly_leaderboard(
  target_year INTEGER,
  target_month INTEGER
)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  nickname TEXT,
  total_duration BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH monthly_stats AS (
    SELECT 
      ss.user_id,
      CAST(SUM(ss.duration) AS BIGINT) as total_duration
    FROM 
      study_sessions ss
    JOIN
      profiles p ON ss.user_id = p.id
    WHERE 
      EXTRACT(YEAR FROM ss.created_at) = target_year
      AND EXTRACT(MONTH FROM ss.created_at) = target_month
      AND p.is_leaderboard_participant = true
    GROUP BY 
      ss.user_id
  )
  SELECT 
    RANK() OVER (ORDER BY ms.total_duration DESC) as rank,
    ms.user_id,
    COALESCE(p.nickname, 'Unknown') as nickname,
    ms.total_duration
  FROM 
    monthly_stats ms
  JOIN 
    profiles p ON ms.user_id = p.id
  ORDER BY 
    rank ASC
  LIMIT 100;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_monthly_leaderboard(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_leaderboard(INTEGER, INTEGER) TO service_role;
