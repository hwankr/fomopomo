begin;
set local search_path = extensions, public, pg_catalog;
select no_plan();

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.capture_sqlstate(statement text)
returns text language plpgsql set search_path = '' as $$
begin
  execute statement;
  return null;
exception when others then return sqlstate;
end;
$$;
create function tests.set_auth_context(user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function tests.record_batch(batch_id uuid, task_id uuid, seconds integer, ended_at timestamptz)
returns jsonb language sql set search_path = '' as $$
  select public.record_study_session_batch(batch_id, 'stopwatch', 'Project study', task_id,
    jsonb_build_array(jsonb_build_object('index', 0, 'duration', seconds, 'ended_at',
      to_char(ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
    (select task.subject_id from public.tasks as task where task.id = task_id));
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'project-a@example.invalid', now(), now(), '{}', '{}'),
  ('d0000000-0000-0000-0000-000000000002', 'project-b@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname) values
  ('d0000000-0000-0000-0000-000000000001', 'project-a@example.invalid', 'user', 'Project A'),
  ('d0000000-0000-0000-0000-000000000002', 'project-b@example.invalid', 'user', 'Project B');
insert into public.friendships (user_id, friend_id) values
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001');
insert into public.study_subjects (id, user_id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Subject A'),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Subject B'),
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Subject C'),
  ('d1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'Foreign subject');
insert into public.long_term_tasks (id, user_id, title) values
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Midterm'),
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Coding practice'),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Final exam'),
  ('d2000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'Foreign project');
insert into public.long_term_tasks (id, user_id, title, parent_task_id, subject_id) values
  ('d3000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Subject A', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Subject B', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002'),
  ('d3000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Subject C', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003');
insert into public.long_term_subtasks (id, user_id, long_term_task_id, title) values
  ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'Review chapters'),
  ('d4000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Prepare timetable');
insert into public.tasks (id, user_id, title, source_long_term_task_id) values
  ('d5000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Midterm', 'd2000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Subject A', 'd3000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'Coding practice', 'd2000000-0000-0000-0000-000000000002'),
  ('d5000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002', 'Foreign project', 'd2000000-0000-0000-0000-000000000004');
insert into public.tasks (id, user_id, title, source_subtask_id) values
  ('d5000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Review chapters', 'd4000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'Prepare timetable', 'd4000000-0000-0000-0000-000000000002');
insert into public.study_sessions (user_id, duration, mode, task_id, created_at) values
  ('d0000000-0000-0000-0000-000000000002', 999, 'stopwatch', 'd5000000-0000-0000-0000-000000000006', now() - interval '1 hour');

select ok(not has_column_privilege('authenticated', 'public.study_sessions', 'long_term_project_id', 'UPDATE'), 'clients cannot rewrite historical project attribution');
select ok(not has_function_privilege('authenticated', 'public.snapshot_study_session_long_term_task()', 'EXECUTE'), 'snapshot trigger has no direct API access');
select ok(not has_function_privilege('authenticated', 'public.set_long_term_task_root_reference()', 'EXECUTE'), 'root-marker trigger has no direct API access');
select ok(not has_function_privilege('anon', 'public.get_long_term_task_durations()', 'EXECUTE'), 'anonymous duration RPC access is denied');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_long_term_task_durations()'::regprocedure), 'duration RPC respects caller RLS');
select is(tests.capture_sqlstate($$update public.long_term_tasks set parent_task_id = 'd2000000-0000-0000-0000-000000000004' where id = 'd3000000-0000-0000-0000-000000000001'$$), '23503', 'cross-owner parent FK holds for privileged writes');
select is(tests.capture_sqlstate($$update public.long_term_tasks set parent_task_id = 'd3000000-0000-0000-0000-000000000001' where id = 'd3000000-0000-0000-0000-000000000002'$$), '23503', 'third task level is rejected');
select is(tests.capture_sqlstate($$update public.long_term_tasks set parent_task_id = id where id = 'd3000000-0000-0000-0000-000000000001'$$), '23503', 'self cycle is rejected');
select is(tests.capture_sqlstate($$update public.long_term_tasks set parent_task_id = 'd2000000-0000-0000-0000-000000000003', subject_id = 'd1000000-0000-0000-0000-000000000001' where id = 'd2000000-0000-0000-0000-000000000001'$$), '23503', 'a root with children cannot be moved beneath another root');
insert into public.study_sessions (id, user_id, duration, mode, long_term_task_id, long_term_project_id)
values (-9650, 'd0000000-0000-0000-0000-000000000001', 10, 'stopwatch', 'd3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001');
select ok((select long_term_task_id is null and long_term_project_id is null from public.study_sessions where id = -9650), 'snapshot trigger discards caller attribution without an owned daily source');
delete from public.study_sessions where id = -9650;

select tests.set_auth_context('d0000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::integer from public.long_term_tasks), 6, 'owner sees roots and own groups only');
select is(tests.capture_sqlstate($$insert into public.long_term_tasks(user_id, title, parent_task_id, subject_id) values ('d0000000-0000-0000-0000-000000000001', 'Foreign parent', 'd2000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001')$$), '23503', 'authenticated user cannot add a subject to another owner project');
select is(tests.capture_sqlstate($$insert into public.long_term_tasks(user_id, title, parent_task_id, subject_id) values ('d0000000-0000-0000-0000-000000000001', 'Foreign subject', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004')$$), '23503', 'group subject must be owned');
select is(tests.capture_sqlstate($$insert into public.long_term_tasks(user_id, title, parent_task_id) values ('d0000000-0000-0000-0000-000000000001', 'Unclassified group', 'd2000000-0000-0000-0000-000000000001')$$), '23514', 'child group requires a subject');
select is(tests.capture_sqlstate($$insert into public.long_term_tasks(user_id, title, parent_task_id, subject_id) values ('d0000000-0000-0000-0000-000000000001', 'Duplicate A', 'd2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001')$$), '23505', 'a project has at most one group per subject');
select is(tests.capture_sqlstate($$insert into public.long_term_tasks(user_id, title, parent_task_id, subject_id) values ('d0000000-0000-0000-0000-000000000001', 'Nested group', 'd3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003')$$), '23503', 'child cannot accept another subject group');
update public.long_term_tasks set root_reference_id = id where id = 'd3000000-0000-0000-0000-000000000001';
select is((select root_reference_id from public.long_term_tasks where id = 'd3000000-0000-0000-0000-000000000001'), null::uuid, 'caller cannot spoof a child as a root reference');
select is(tests.capture_sqlstate($$update public.long_term_tasks set parent_task_id = case id when 'd2000000-0000-0000-0000-000000000002' then 'd2000000-0000-0000-0000-000000000003'::uuid else 'd2000000-0000-0000-0000-000000000002'::uuid end, subject_id = 'd1000000-0000-0000-0000-000000000001' where id in ('d2000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000003')$$), '23503', 'one multi-row update cannot create a cycle');
select lives_ok($$update public.long_term_tasks set title = 'Midterm revised', position = 5 where id = 'd2000000-0000-0000-0000-000000000001'$$, 'ordinary project edits remain allowed with children');
select is((select subject_id from public.tasks where id = 'd5000000-0000-0000-0000-000000000002'), 'd1000000-0000-0000-0000-000000000001'::uuid, 'direct subject-group study inherits classification');
select is((select subject_id from public.tasks where id = 'd5000000-0000-0000-0000-000000000003'), 'd1000000-0000-0000-0000-000000000001'::uuid, 'subject-group subtask study inherits classification');
select is((select subject_id from public.tasks where id = 'd5000000-0000-0000-0000-000000000004'), null::uuid, 'direct root subtask need not have a subject');

select is(tests.record_batch('d6000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 60, now() - interval '4 hours')->>'status', 'saved', 'root with groups remains directly studyable');
select is(tests.record_batch('d6000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002', 120, now() - interval '3 hours')->>'status', 'saved', 'subject group is directly studyable');
select is(tests.record_batch('d6000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000003', 30, now() - interval '2 hours')->>'status', 'saved', 'subject-group subtask records through existing RPC');
select is(tests.record_batch('d6000000-0000-0000-0000-000000000004', 'd5000000-0000-0000-0000-000000000004', 20, now() - interval '1 hour')->>'status', 'saved', 'direct root subtask can coexist with groups');
select is(tests.record_batch('d6000000-0000-0000-0000-000000000005', 'd5000000-0000-0000-0000-000000000005', 40, now() - interval '30 minutes')->>'status', 'saved', 'standalone project without subject or subtasks remains studyable');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000001'), 230::bigint, 'root counts direct, child, and both subtask paths exactly once');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd3000000-0000-0000-0000-000000000001'), 150::bigint, 'subject group reports only its direct and subtask time');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd3000000-0000-0000-0000-000000000003'), 0::bigint, 'empty subject group has a zero total');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000002'), 40::bigint, 'standalone project time is not double counted');
select is((select count(*)::integer from public.study_sessions where user_id = 'd0000000-0000-0000-0000-000000000002'), 1, 'friend session is visible under preexisting policy');
select is((select count(*)::integer from public.get_long_term_task_durations()), 6, 'friend visibility cannot leak into owned project totals');
select is((select long_term_project_id from public.study_sessions where session_batch_id = 'd6000000-0000-0000-0000-000000000003'), 'd2000000-0000-0000-0000-000000000001'::uuid, 'subtask session stores the root separately from the leaf');
select is((select long_term_task_id from public.study_sessions where session_batch_id = 'd6000000-0000-0000-0000-000000000003'), 'd3000000-0000-0000-0000-000000000001'::uuid, 'subtask session retains leaf snapshot');
select is(tests.record_batch('d6000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000003', 30, now() - interval '2 hours')->>'status', 'already_processed', 'recording retry remains idempotent');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000001'), 230::bigint, 'recording retry does not duplicate aggregate time');

update public.long_term_tasks set subject_id = 'd1000000-0000-0000-0000-000000000002', parent_task_id = 'd2000000-0000-0000-0000-000000000003'
where id = 'd3000000-0000-0000-0000-000000000001';
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000001'), 230::bigint, 'moving a subject group preserves previously earned root time');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000003'), 0::bigint, 'moving a group does not transfer historical time to the new root');
select is((select subject_id from public.study_sessions where session_batch_id = 'd6000000-0000-0000-0000-000000000003'), 'd1000000-0000-0000-0000-000000000001'::uuid, 'changing group subject does not reclassify old study history');
select is(tests.record_batch('d6000000-0000-0000-0000-000000000006', 'd5000000-0000-0000-0000-000000000002', 50, now() - interval '10 minutes')->>'status', 'saved', 'new session after move records successfully');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000003'), 50::bigint, 'new session uses the current project root');

delete from public.long_term_tasks where id = 'd3000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.long_term_subtasks where id = 'd4000000-0000-0000-0000-000000000001'), 0, 'group deletion cascades its subtasks');
select is((select long_term_task_id from public.study_sessions where session_batch_id = 'd6000000-0000-0000-0000-000000000003'), null::uuid, 'group deletion clears the leaf snapshot link');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000001'), 230::bigint, 'group deletion preserves old project totals');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'd2000000-0000-0000-0000-000000000003'), 50::bigint, 'group deletion preserves new project totals');
select is((select source_long_term_task_id from public.tasks where id = 'd5000000-0000-0000-0000-000000000002'), null::uuid, 'group deletion keeps daily tasks and clears only their source');
select is((select subject_id from public.study_sessions where session_batch_id = 'd6000000-0000-0000-0000-000000000003'), 'd1000000-0000-0000-0000-000000000001'::uuid, 'group deletion preserves historical subject classification');

delete from public.long_term_tasks where id = 'd2000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.long_term_tasks where id in ('d3000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000003')), 0, 'root deletion cascades its remaining subject groups');
select is((select count(*)::integer from public.study_sessions where session_batch_id in ('d6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000002', 'd6000000-0000-0000-0000-000000000003', 'd6000000-0000-0000-0000-000000000004') and long_term_project_id is null), 4, 'root deletion retains history and clears project links');
select is((select sum(duration)::bigint from public.study_sessions where user_id = 'd0000000-0000-0000-0000-000000000001'), 320::bigint, 'deleting groups and root never deletes study duration');
reset role;
select tests.set_auth_context(null);
set local role authenticated;
select is((select count(*)::integer from public.get_long_term_task_durations()), 0, 'missing auth yields no project totals');
reset role;
select lives_ok($$delete from auth.users where id = 'd0000000-0000-0000-0000-000000000001'$$, 'account deletion cascades safely through new project references');
select * from finish();
rollback;
