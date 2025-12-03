-- Fix infinite recursion in RLS policies

-- 1. Create a secure function to check if the current user is an admin
-- This function uses SECURITY DEFINER to bypass RLS when checking the role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- 2. Update RLS policies to use the function instead of direct table query

-- Profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR 
  public.is_admin()
);

-- Study Sessions
DROP POLICY IF EXISTS "Admins can view all study sessions" ON public.study_sessions;
CREATE POLICY "Admins can view all study sessions"
ON public.study_sessions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.is_admin()
);

-- Tasks
DROP POLICY IF EXISTS "Admins can view all tasks" ON public.tasks;
CREATE POLICY "Admins can view all tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.is_admin()
);

-- Weekly Plans
DROP POLICY IF EXISTS "Admins can view all weekly_plans" ON public.weekly_plans;
CREATE POLICY "Admins can view all weekly_plans"
ON public.weekly_plans FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.is_admin()
);

-- Monthly Plans
DROP POLICY IF EXISTS "Admins can view all monthly_plans" ON public.monthly_plans;
CREATE POLICY "Admins can view all monthly_plans"
ON public.monthly_plans FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.is_admin()
);
