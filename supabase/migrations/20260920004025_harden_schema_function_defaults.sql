-- Complete the function default hardening from 20260807001129. PostgreSQL adds
-- per-schema defaults to global defaults, so a global REVOKE does not remove
-- Supabase's legacy public-schema EXECUTE grants for newly created functions.
-- Only future application functions are affected; existing explicit RPC grants
-- and Supabase-owned schemas retain their current permissions.
alter default privileges in schema public, private
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public, private
  revoke execute on functions from public, anon, authenticated, service_role;
