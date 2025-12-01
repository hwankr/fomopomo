-- Add nickname and group_name columns to friendships table
ALTER TABLE public.friendships 
ADD COLUMN IF NOT EXISTS nickname text,
ADD COLUMN IF NOT EXISTS group_name text;
