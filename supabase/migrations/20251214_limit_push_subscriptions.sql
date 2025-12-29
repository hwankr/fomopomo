-- 1. Create the function to trim subscriptions
CREATE OR REPLACE FUNCTION public.trim_push_subscriptions()
RETURNS TRIGGER AS $$
DECLARE
  max_subs INTEGER := 5;
BEGIN
  -- Delete oldest subscriptions for the modified user if count > max_subs
  DELETE FROM public.push_subscriptions
  WHERE id IN (
    SELECT id
    FROM public.push_subscriptions
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET max_subs
  );
  RETURN NULL; -- Trigger is AFTER INSERT, so return value is ignored
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS trigger_limit_push_subscriptions ON public.push_subscriptions;
CREATE TRIGGER trigger_limit_push_subscriptions
AFTER INSERT ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.trim_push_subscriptions();

-- 3. One-time cleanup of existing data
-- This uses a CTE to identify IDs to delete
WITH to_delete AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
    FROM public.push_subscriptions
  ) t
  WHERE rn > 5
)
DELETE FROM public.push_subscriptions
WHERE id IN (SELECT id FROM to_delete);
