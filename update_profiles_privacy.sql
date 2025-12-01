-- Add privacy columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_task_public boolean DEFAULT true;
