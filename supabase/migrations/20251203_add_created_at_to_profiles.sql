-- Add created_at column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
