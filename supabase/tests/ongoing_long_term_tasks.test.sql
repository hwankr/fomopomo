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
create function tests.set_auth_context(user_id uuid, jwt_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', jwt_role, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', jwt_role)::text, true);
end;
$$;
create function tests.record_batch(batch_id uuid, task_id uuid, seconds integer, ended_at timestamptz)
returns jsonb language sql set search_path = '' as $$
  select public.record_study_session_batch(batch_id, 'stopwatch', 'Coding practice', task_id,
    jsonb_build_array(jsonb_build_object('index', 0, 'duration', seconds, 'ended_at',
      to_char(ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))));
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('60000000-0000-0000-0000-0000000000a1', 'ongoing-a@example.invalid', now(), now(), '{}', '{}'),
  ('60000000-0000-0000-0000-0000000000b2', 'ongoing-b@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname) values
  ('60000000-0000-0000-0000-0000000000a1', 'ongoing-a@example.invalid', 'user', 'Ongoing A'),
  ('60000000-0000-0000-0000-0000000000b2', 'ongoing-b@example.invalid', 'user', 'Ongoing B');
insert into public.friendships (user_id, friend_id) values
  ('60000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000a1');
insert into public.study_subjects (id, user_id, name) values
  ('60500000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', 'Algorithms');
insert into public.long_term_tasks (id, user_id, title, subject_id) values
  ('61000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', 'Coding practice', '60500000-0000-0000-0000-0000000000a1'),
  ('61000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Empty project', null),
  ('61000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000000a1', 'Many sessions', null),
  ('61000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000b2', 'Friend project', null);
insert into public.long_term_subtasks (id, user_id, long_term_task_id, title) values
  ('62000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', '61000000-0000-0000-0000-0000000000a1', 'Graphs');
insert into public.tasks (id, user_id, title, due_date, source_long_term_task_id) values
  ('63000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', 'Coding practice', current_date - 2, '61000000-0000-0000-0000-0000000000a1'),
  ('63000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000a1', 'Coding practice', current_date - 1, '61000000-0000-0000-0000-0000000000a1'),
  ('63000000-0000-0000-0000-0000000000a4', '60000000-0000-0000-0000-0000000000a1', 'Many sessions', current_date, '61000000-0000-0000-0000-0000000000a3'),
  ('63000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000b2', 'Friend project', current_date, '61000000-0000-0000-0000-0000000000b2');
insert into public.tasks (id, user_id, title, due_date, source_subtask_id) values
  ('63000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000000a1', 'Graphs', current_date, '62000000-0000-0000-0000-0000000000a1');
insert into public.study_sessions (user_id, duration, mode, task_id, created_at)
select '60000000-0000-0000-0000-0000000000a1', 10, 'stopwatch', '63000000-0000-0000-0000-0000000000a4', now() - interval '1 hour'
from generate_series(1, 1001);
insert into public.study_sessions (user_id, duration, mode, task_id, created_at)
values ('60000000-0000-0000-0000-0000000000b2', 999, 'stopwatch', '63000000-0000-0000-0000-0000000000b2', now() - interval '1 hour');

select ok(not has_function_privilege('anon', 'public.get_long_term_task_durations()', 'EXECUTE'), 'anonymous aggregate access is denied');
select ok(has_function_privilege('authenticated', 'public.get_long_term_task_durations()', 'EXECUTE'), 'authenticated callers can read aggregates');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_long_term_task_durations()'::regprocedure), 'aggregate uses invoker permissions');
select ok(not has_column_privilege('authenticated', 'public.study_sessions', 'long_term_task_id', 'UPDATE'), 'clients cannot move a saved session between projects');
select ok(not has_function_privilege('authenticated', 'public.snapshot_study_session_long_term_task()', 'EXECUTE'), 'snapshot trigger is not directly callable');
select is(tests.capture_sqlstate($$update public.tasks set source_long_term_task_id = '61000000-0000-0000-0000-0000000000b2' where id = '63000000-0000-0000-0000-0000000000a1'$$), '23503', 'direct source FK enforces ownership even for privileged writes');
select is(tests.capture_sqlstate($$update public.study_sessions set long_term_task_id = '61000000-0000-0000-0000-0000000000b2' where task_id = '63000000-0000-0000-0000-0000000000a4'$$), '23503', 'session snapshot FK enforces ownership even for privileged writes');

select tests.set_auth_context('60000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is((select subject_id from public.tasks where id = '63000000-0000-0000-0000-0000000000a1'), '60500000-0000-0000-0000-0000000000a1'::uuid, 'direct project tasks inherit their subject');
select is((select count(*)::integer from public.tasks where source_long_term_task_id = '61000000-0000-0000-0000-0000000000a1'), 2, 'one ongoing project can have tasks on multiple dates');
select is(tests.capture_sqlstate($$insert into public.tasks(user_id, title, due_date, source_long_term_task_id) values ('60000000-0000-0000-0000-0000000000a1', 'Duplicate', current_date - 1, '61000000-0000-0000-0000-0000000000a1')$$), '23505', 'same project and date are unique');
select is(tests.capture_sqlstate($$insert into public.tasks(user_id, title, due_date, source_long_term_task_id) values ('60000000-0000-0000-0000-0000000000a1', 'Foreign', current_date + 1, '61000000-0000-0000-0000-0000000000b2')$$), '23503', 'another owner cannot claim a project daily key');
select is(tests.capture_sqlstate($$insert into public.tasks(user_id, title, source_long_term_task_id, source_subtask_id) values ('60000000-0000-0000-0000-0000000000a1', 'Ambiguous', '61000000-0000-0000-0000-0000000000a1', '62000000-0000-0000-0000-0000000000a1')$$), '23514', 'a task cannot have both direct and subtask sources');

update public.tasks set status = 'done' where id = '63000000-0000-0000-0000-0000000000a1';
insert into public.tasks (user_id, title, due_date, status, source_long_term_task_id)
values ('60000000-0000-0000-0000-0000000000a1', 'Coding practice', current_date - 2, 'todo', '61000000-0000-0000-0000-0000000000a1')
on conflict (source_long_term_task_id, due_date) do nothing;
select is((select status from public.tasks where id = '63000000-0000-0000-0000-0000000000a1'), 'done', 'duplicate materialization keeps completed daily status');
select is((select count(*)::integer from public.long_term_tasks where id = '61000000-0000-0000-0000-0000000000a1' and archived_at is null), 1, 'daily completion leaves the ongoing parent active');
select is((select completed_at from public.long_term_subtasks where id = '62000000-0000-0000-0000-0000000000a1'), null::timestamptz, 'direct daily completion does not complete unrelated subtasks');
select is((select status from public.tasks where id = '63000000-0000-0000-0000-0000000000a2'), 'todo', 'completion on one date leaves the next date independent');

select is(tests.record_batch('64000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-0000000000a1', 60, now() - interval '2 days')->>'status', 'saved', 'first date records through existing batch RPC');
select is(tests.record_batch('64000000-0000-0000-0000-0000000000a2', '63000000-0000-0000-0000-0000000000a2', 120, now() - interval '1 day')->>'status', 'saved', 'second date records through existing batch RPC');
select is(tests.record_batch('64000000-0000-0000-0000-0000000000a3', '63000000-0000-0000-0000-0000000000a3', 30, now() - interval '1 hour')->>'status', 'saved', 'existing subtask timer path still records');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a1'), 210::bigint, 'multiple dates plus subtask time accumulate once under the project');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a2'), 0::bigint, 'unused projects have a real zero total');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a3'), 10010::bigint, 'server aggregate includes more than 1000 study sessions');
select is((select count(*)::integer from public.study_sessions where user_id = '60000000-0000-0000-0000-0000000000b2'), 1, 'friend session is readable under existing policy');
select is((select count(*)::integer from public.get_long_term_task_durations()), 3, 'aggregate returns only owned projects despite visible friend history');
select is((select sum(duration)::bigint from public.study_sessions where session_batch_id = '64000000-0000-0000-0000-0000000000a1'), 60::bigint, 'first daily record keeps its own duration');
select is((select created_at from public.study_sessions where session_batch_id = '64000000-0000-0000-0000-0000000000a1'), date_trunc('milliseconds', now() - interval '2 days'), 'snapshot leaves the recorded date unchanged');
select is(tests.record_batch('64000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-0000000000a1', 60, now() - interval '2 days')->>'status', 'already_processed', 'retry returns idempotent success');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a1'), 210::bigint, 'retry does not double count project duration');

update public.long_term_subtasks set long_term_task_id = '61000000-0000-0000-0000-0000000000a2' where id = '62000000-0000-0000-0000-0000000000a1';
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a1'), 210::bigint, 'subtask reparenting cannot move historical project time');
delete from public.long_term_subtasks where id = '62000000-0000-0000-0000-0000000000a1';
select is((select source_subtask_id from public.tasks where id = '63000000-0000-0000-0000-0000000000a3'), null::uuid, 'deleted subtask only clears its daily task source');
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a1'), 210::bigint, 'subtask deletion preserves earned project duration');
delete from public.tasks where id = '63000000-0000-0000-0000-0000000000a1';
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '61000000-0000-0000-0000-0000000000a1'), 210::bigint, 'daily task deletion preserves earned project duration');
select is(tests.record_batch('64000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-0000000000a1', 60, now() - interval '2 days')->>'status', 'already_processed', 'saved batch replay after task deletion retains its snapshot');
select is((select long_term_task_id from public.study_sessions where session_batch_id = '64000000-0000-0000-0000-0000000000a1'), '61000000-0000-0000-0000-0000000000a1'::uuid, 'retry cannot clear the saved project snapshot');

delete from public.long_term_tasks where id = '61000000-0000-0000-0000-0000000000a1';
select is((select count(*)::integer from public.study_sessions where session_batch_id in ('64000000-0000-0000-0000-0000000000a1', '64000000-0000-0000-0000-0000000000a2', '64000000-0000-0000-0000-0000000000a3') and long_term_task_id is null), 3, 'parent deletion preserves daily study history and clears only its link');
select is((select source_long_term_task_id from public.tasks where id = '63000000-0000-0000-0000-0000000000a2'), null::uuid, 'parent deletion preserves the daily task');
reset role;
select tests.set_auth_context(null, 'authenticated');
set local role authenticated;
select is((select count(*)::integer from public.get_long_term_task_durations()), 0, 'missing authentication cannot read any project duration');
reset role;
select lives_ok($$delete from auth.users where id = '60000000-0000-0000-0000-0000000000a1'$$, 'account cascade works with project snapshot references');
select * from finish();
rollback;
