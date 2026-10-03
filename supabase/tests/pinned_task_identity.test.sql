begin;
set local search_path = extensions, public, pg_catalog;
select no_plan();

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.capture_sqlstate(statement text)
returns text language plpgsql set search_path = '' as $$
begin execute statement; return null;
exception when others then return sqlstate;
end;
$$;
create function tests.set_auth_context(user_id uuid, jwt_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', jwt_role, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', jwt_role)::text, true);
end;
$$;
create function tests.reject_pin_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.title = 'reject-template-update' then
    raise exception 'Simulated template failure' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger reject_pin_edit before update on public.pinned_tasks
  for each row execute function tests.reject_pin_edit();
grant execute on all functions in schema tests to anon, authenticated, service_role;
create temporary table saved_pin_ids (task_id uuid, pin_id uuid);
grant all on saved_pin_ids to authenticated;


insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data) values
('71000000-0000-0000-0000-0000000000a1', 'pin-a@example.invalid', now(), now(), '{}', '{}'),
('71000000-0000-0000-0000-0000000000b2', 'pin-b@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname) values
('71000000-0000-0000-0000-0000000000a1', 'pin-a@example.invalid', 'user', 'Pin A'),
('71000000-0000-0000-0000-0000000000b2', 'pin-b@example.invalid', 'user', 'Pin B');
insert into public.study_subjects (id, user_id, name) values
('71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-0000000000a1', 'Database'),
('71100000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-0000000000a1', 'Blockchain'),
('71100000-0000-0000-0000-0000000000b2', '71000000-0000-0000-0000-0000000000b2', 'Private B');
insert into public.tasks (id, user_id, title, subject_id, due_date, position) values
('71200000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-0000000000a1', 'Review', '71100000-0000-0000-0000-000000000001', current_date, 0),
('71200000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-0000000000a1', 'Review', '71100000-0000-0000-0000-000000000002', current_date, 1),
('71200000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-0000000000a1', 'Review', '71100000-0000-0000-0000-000000000001', current_date, 2),
('71200000-0000-0000-0000-0000000000b2', '71000000-0000-0000-0000-0000000000b2', 'Other user', null, current_date, 0);
insert into public.pinned_tasks (id, user_id, title) values
('71300000-0000-0000-0000-0000000000b2', '71000000-0000-0000-0000-0000000000b2', 'Other user');
insert into public.study_sessions (user_id, duration, mode, task_id, task, subject_id, created_at) values
('71000000-0000-0000-0000-0000000000a1', 60, 'stopwatch', '71200000-0000-0000-0000-000000000001', 'Saved note', '71100000-0000-0000-0000-000000000001', now());

select ok(not has_function_privilege('anon', 'public.pin_daily_task(uuid)', 'EXECUTE'), 'anonymous pin RPC is denied');
select ok(not has_function_privilege('anon', 'public.materialize_pinned_tasks(uuid,date)', 'EXECUTE'), 'anonymous materialization is denied');
select ok(not has_function_privilege('anon', 'public.update_daily_task_with_pin(uuid,text,uuid)', 'EXECUTE'), 'anonymous edit RPC is denied');
select ok(not exists (select 1 from pg_proc where oid in ('public.pin_daily_task(uuid)'::regprocedure, 'public.materialize_pinned_tasks(uuid,date)'::regprocedure, 'public.update_daily_task_with_pin(uuid,text,uuid)'::regprocedure) and prosecdef), 'all pin RPCs retain invoker RLS');
select is(tests.capture_sqlstate($$update public.tasks set source_pinned_task_id = '71300000-0000-0000-0000-0000000000b2' where id = '71200000-0000-0000-0000-000000000001'$$), '23503', 'composite FK rejects cross-owner links even for privileged writes');

select tests.set_auth_context('71000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select lives_ok($$select * from public.pin_daily_task('71200000-0000-0000-0000-000000000001')$$, 'pinning creates a template and links the daily task');
insert into saved_pin_ids select id, source_pinned_task_id from public.tasks where id = '71200000-0000-0000-0000-000000000001';
select is((select id from public.pin_daily_task('71200000-0000-0000-0000-000000000001')), (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001'), 'retrying pin returns the same stable template');
select lives_ok($$select * from public.pin_daily_task('71200000-0000-0000-0000-000000000002')$$, 'same-title task in a second subject has an independent pin');
insert into saved_pin_ids select id, source_pinned_task_id from public.tasks where id = '71200000-0000-0000-0000-000000000002';
select is((select count(distinct pin_id)::integer from saved_pin_ids), 2, 'same title cannot collapse two templates');
select is((select source_pinned_task_id from public.tasks where id = '71200000-0000-0000-0000-000000000003'), null::uuid, 'unrelated same-title and same-subject task remains unpinned');
select is((select count(*)::integer from public.materialize_pinned_tasks('71000000-0000-0000-0000-0000000000a1', current_date)), 2, 'materialization returns both existing occurrences');
select is((select count(*)::integer from public.tasks where due_date = current_date), 3, 'same-date materialization does not duplicate existing pinned tasks');
select is((select count(*)::integer from public.materialize_pinned_tasks('71000000-0000-0000-0000-0000000000a1', current_date + 1)), 2, 'next calendar date creates independent occurrences');
update public.tasks set status = 'done', position = 17 where due_date = current_date + 1 and source_pinned_task_id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.materialize_pinned_tasks('71000000-0000-0000-0000-0000000000a1', current_date + 1)), 2, 'repeated materialization returns canonical rows');
select is((select count(*)::integer from public.tasks where due_date = current_date + 1), 2, 'repeat inserts nothing');
select is((select status from public.tasks where due_date = current_date + 1 and source_pinned_task_id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001')), 'done', 'repeat preserves completion');
select is((select position::integer from public.tasks where due_date = current_date + 1 and source_pinned_task_id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001')), 17, 'repeat preserves ordering');
select is(tests.capture_sqlstate($$insert into public.tasks(user_id,title,due_date,source_pinned_task_id) select '71000000-0000-0000-0000-0000000000a1', 'duplicate', current_date, pin_id from saved_pin_ids limit 1$$), '23505', 'database uniqueness blocks a competing direct insert');

select lives_ok($$select * from public.update_daily_task_with_pin('71200000-0000-0000-0000-000000000001', 'Changed', null)$$, 'linked daily title and subject update together');
select is((select title from public.pinned_tasks where id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001')), 'Changed', 'correct template title changed');
select is((select subject_id from public.pinned_tasks where id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001')), null::uuid, 'explicit unclassified subject is preserved');
select is((select title from public.pinned_tasks where id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000002')), 'Review', 'same-title other template is untouched');
select is((select title from public.tasks where due_date = current_date + 1 and source_pinned_task_id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001')), 'Review', 'editing one occurrence preserves another date');
select is((select task from public.study_sessions where user_id = '71000000-0000-0000-0000-0000000000a1'), 'Saved note', 'saved session title remains historical');
select is((select subject_id from public.study_sessions where user_id = '71000000-0000-0000-0000-0000000000a1'), '71100000-0000-0000-0000-000000000001'::uuid, 'saved session subject remains historical');
select is(tests.capture_sqlstate($$select * from public.update_daily_task_with_pin('71200000-0000-0000-0000-000000000001', 'reject-template-update', null)$$), '23514', 'template failure reaches the caller');
select is((select title from public.tasks where id = '71200000-0000-0000-0000-000000000001'), 'Changed', 'template failure rolls back the daily task write');
select is((select title from public.pinned_tasks where id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001')), 'Changed', 'template failure retains the previous template');
select lives_ok($$select * from public.update_daily_task_with_pin('71200000-0000-0000-0000-000000000003', 'Independent', null)$$, 'unlinked task edits remain independent');
select is((select count(*)::integer from public.pinned_tasks where title = 'Independent'), 0, 'editing a manual task cannot retitle a template');

select is(tests.capture_sqlstate($$select * from public.pin_daily_task('71200000-0000-0000-0000-0000000000b2')$$), '42501', 'cannot pin another account task');
select is(tests.capture_sqlstate($$select * from public.update_daily_task_with_pin('71200000-0000-0000-0000-0000000000b2', 'stolen', null)$$), '42501', 'cannot edit another account task');
select is(tests.capture_sqlstate($$select * from public.materialize_pinned_tasks('71000000-0000-0000-0000-0000000000b2', current_date)$$), '42501', 'stale previous-account materialization is rejected');
select is(tests.capture_sqlstate($$select * from public.update_daily_task_with_pin('71200000-0000-0000-0000-000000000001', 'foreign subject', '71100000-0000-0000-0000-0000000000b2')$$), '23503', 'cannot attach a foreign subject through RPC');
select is(tests.capture_sqlstate($$select * from public.materialize_pinned_tasks('71000000-0000-0000-0000-0000000000a1', null)$$), '22004', 'null calendar dates are rejected');
select is(tests.capture_sqlstate($$select * from public.update_daily_task_with_pin('71200000-0000-0000-0000-000000000001', ' ', null)$$), '22023', 'blank task titles are rejected');

delete from public.pinned_tasks where id = (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.tasks where user_id = '71000000-0000-0000-0000-0000000000a1'), 5, 'unpin preserves every daily task');
select is((select source_pinned_task_id from public.tasks where id = '71200000-0000-0000-0000-000000000001'), null::uuid, 'unpin clears only the source link');
select is((select user_id from public.tasks where id = '71200000-0000-0000-0000-000000000001'), '71000000-0000-0000-0000-0000000000a1'::uuid, 'FK unlink preserves non-null ownership');
select is((select count(*)::integer from public.pinned_tasks), 1, 'unpin leaves the other same-title template intact');
select is((select sum(duration)::bigint from public.study_sessions where user_id = '71000000-0000-0000-0000-0000000000a1'), 60::bigint, 'unpin preserves recorded time');
select lives_ok($$select * from public.pin_daily_task('71200000-0000-0000-0000-000000000001')$$, 'unlinked occurrence can be pinned again');
select isnt((select source_pinned_task_id from public.tasks where id = '71200000-0000-0000-0000-000000000001'), (select pin_id from saved_pin_ids where task_id = '71200000-0000-0000-0000-000000000001'), 'repinning creates a fresh identity');

reset role;
select tests.set_auth_context(null, 'authenticated');
set local role authenticated;
select is(tests.capture_sqlstate($$select * from public.pin_daily_task('71200000-0000-0000-0000-000000000001')$$), '42501', 'missing JWT identity cannot pin');
select is(tests.capture_sqlstate($$select * from public.materialize_pinned_tasks('71000000-0000-0000-0000-0000000000a1', current_date)$$), '42501', 'missing JWT identity cannot materialize');
reset role;
select lives_ok($$delete from auth.users where id = '71000000-0000-0000-0000-0000000000a1'$$, 'account deletion cascades cleanly through pin links');
select * from finish();
rollback;
