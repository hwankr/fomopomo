-- Force update admin role
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'fabronjeon@naver.com';
