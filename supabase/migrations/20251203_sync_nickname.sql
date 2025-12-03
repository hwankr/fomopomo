-- 1. Add nickname column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nickname text;

-- 2. Create or replace function to handle user updates (and inserts)
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET nickname = new.raw_user_meta_data->>'full_name'
  WHERE id = new.id;
  RETURN new;
END;
$$;

-- 3. Create trigger for user updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- 4. Update existing handle_new_user function to include nickname
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nickname, role)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name',
    'user'
  );
  RETURN new;
END;
$$;

-- 5. Sync existing users (One-time)
UPDATE public.profiles p
SET nickname = u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE p.id = u.id
AND p.nickname IS NULL;
