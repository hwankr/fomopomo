-- Inventory metadata only: real object deletion belongs to Storage HTTP API.
-- All fixture rows, grants, and settings roll back at the end of this test.
begin;
set local search_path = extensions, public, pg_catalog;
select plan(19);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.capture_sqlstate(statement text)
returns text language plpgsql set search_path = '' as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlstate;
end;
$$;
grant execute on function tests.capture_sqlstate(text) to anon, authenticated, service_role;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('61000000-0000-4000-8000-000000000001', 'storage-cleanup-a@example.invalid', '{}', '{}'),
  ('61000000-0000-4000-8000-000000000002', 'storage-cleanup-b@example.invalid', '{}', '{}');
insert into storage.buckets (id, name, public)
values ('cleanup-other-bucket', 'cleanup-other-bucket', false);

insert into storage.objects (id, bucket_id, name, owner_id, owner) values
  ('62000000-0000-4000-8000-000000000001', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/canonical.png', '61000000-0000-4000-8000-000000000001', null),
  ('62000000-0000-4000-8000-000000000002', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/nested/legacy.png', null, '61000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000003', 'feedback-uploads', 'outside-user-namespace.png', null, '61000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000004', 'cleanup-other-bucket', 'legacy.png', '61000000-0000-4000-8000-000000000001', null),
  ('62000000-0000-4000-8000-000000000005', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/empty-owner-id.png', '', '61000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000006', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/other-owner.png', '61000000-0000-4000-8000-000000000002', null),
  ('62000000-0000-4000-8000-000000000007', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/stale-legacy-owner.png', '61000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000008', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/current-owner.png', '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002'),
  ('62000000-0000-4000-8000-000000000009', 'feedback-uploads', '61000000-0000-4000-8000-000000000001/unowned.png', null, null);

select ok(not has_function_privilege('anon', 'public.list_account_storage_objects(uuid,uuid,integer)', 'EXECUTE'), 'anon cannot enumerate private Storage ownership');
select ok(not has_function_privilege('authenticated', 'public.list_account_storage_objects(uuid,uuid,integer)', 'EXECUTE'), 'authenticated cannot enumerate another account');
select ok(has_function_privilege('service_role', 'public.list_account_storage_objects(uuid,uuid,integer)', 'EXECUTE'), 'service role can call the inventory RPC');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.list_account_storage_objects(uuid,uuid,integer)'::regprocedure), 'inventory has a fixed empty search path');

set local role anon;
select is(tests.capture_sqlstate($$select public.list_account_storage_objects('61000000-0000-4000-8000-000000000001')$$), '42501', 'anon invocation is rejected');
reset role;
set local role authenticated;
select is(tests.capture_sqlstate($$select public.list_account_storage_objects('61000000-0000-4000-8000-000000000001')$$), '42501', 'authenticated invocation is rejected');
reset role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';
select is((select count(*) from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001')), 6::bigint, 'all and only user-owned objects are listed');
select is((select owner_id from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001') where id = '62000000-0000-4000-8000-000000000002'), '61000000-0000-4000-8000-000000000001', 'legacy owner is normalized to authoritative owner_id');
select ok(exists(select 1 from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001') where name = 'outside-user-namespace.png'), 'non-prefixed legacy objects remain visible so cleanup can fail closed');
select ok(exists(select 1 from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001') where bucket_id = 'cleanup-other-bucket'), 'other-bucket ownership remains visible so Auth deletion cannot falsely succeed');
select ok(not exists(select 1 from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001') where id in ('62000000-0000-4000-8000-000000000006', '62000000-0000-4000-8000-000000000007', '62000000-0000-4000-8000-000000000009')), 'prefix and stale legacy owner never override actual owner_id');
select is((select array_agg(id) from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002', 2)), array['62000000-0000-4000-8000-000000000003'::uuid, '62000000-0000-4000-8000-000000000004'::uuid], 'keyset pagination advances in deterministic ID order');
select is((select count(*) from public.list_account_storage_objects('61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000008', 100)), 0::bigint, 'cursor after the final user object returns no rows');
select is(tests.capture_sqlstate($$select public.list_account_storage_objects(null)$$), '22023', 'null user is rejected');
select is(tests.capture_sqlstate($$select public.list_account_storage_objects('61000000-0000-4000-8000-000000000001', null, 0)$$), '22023', 'zero page size is rejected');
select is(tests.capture_sqlstate($$select public.list_account_storage_objects('61000000-0000-4000-8000-000000000001', null, 101)$$), '22023', 'oversized page is rejected');
select is(tests.capture_sqlstate($$select public.list_account_storage_objects('61000000-0000-4000-8000-000000000001', null, null)$$), '22023', 'null page size is rejected');
reset role;
select is((select count(*) from storage.objects where id >= '62000000-0000-4000-8000-000000000001' and id <= '62000000-0000-4000-8000-000000000009'), 9::bigint, 'inventory calls never delete or alter Storage metadata');

-- Defense in depth if EXECUTE is accidentally widened in a later migration.
grant execute on function public.list_account_storage_objects(uuid, uuid, integer) to authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"role":"authenticated"}';
set local role authenticated;
select is(tests.capture_sqlstate($$select public.list_account_storage_objects('61000000-0000-4000-8000-000000000001')$$), '42501', 'function body rejects non-service roles even if an EXECUTE grant drifts');
reset role;
select * from finish();
rollback;
