-- Storage list() omits ownership and only lists one folder level. Account
-- cleanup needs authoritative ownership, including files outside the supported
-- namespace that must block cleanup rather than be silently left behind.
-- This RPC ONLY reads metadata. Blob deletion always uses the Storage API.
create function public.list_account_storage_objects(
  p_user_id uuid,
  p_after_id uuid default null,
  p_limit integer default 100
)
returns table (id uuid, bucket_id text, name text, owner_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Valid user_id and limit between 1 and 100 required'
      using errcode = '22023';
  end if;

  return query
  select o.id, o.bucket_id, o.name,
    coalesce(nullif(o.owner_id, ''), o.owner::text)
  from storage.objects as o
  where coalesce(nullif(o.owner_id, ''), o.owner::text) = p_user_id::text
    and (p_after_id is null or o.id > p_after_id)
  order by o.id
  limit p_limit;
end;
$$;

revoke execute on function public.list_account_storage_objects(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_account_storage_objects(uuid, uuid, integer)
  to service_role;
