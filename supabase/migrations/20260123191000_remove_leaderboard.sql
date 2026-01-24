-- Remove leaderboard feature
DROP FUNCTION IF EXISTS public.get_monthly_leaderboard(INTEGER, INTEGER);

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS is_leaderboard_participant;
