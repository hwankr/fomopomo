-- 1. Add role column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 2. Set admin role for specific user
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'fabronjeon@naver.com';

-- 3. Update RLS policies for profiles
-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- 4. Update RLS policies for study_sessions
-- Allow admins to view all study sessions
CREATE POLICY "Admins can view all study sessions"
ON public.study_sessions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- 5. Update RLS policies for tasks
-- Allow admins to view all tasks
CREATE POLICY "Admins can view all tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- 6. Update RLS policies for weekly_plans
CREATE POLICY "Admins can view all weekly_plans"
ON public.weekly_plans FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- 7. Update RLS policies for monthly_plans
CREATE POLICY "Admins can view all monthly_plans"
ON public.monthly_plans FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
