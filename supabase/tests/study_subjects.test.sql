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
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', jwt_role)::text, true);
end;
$$;
create function tests.segments()
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('index', 0, 'duration', 60, 'ended_at',
      to_char((now() - interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_object('index', 1, 'duration', 60, 'ended_at',
      to_char((now() - interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );
$$;
create function tests.record_batch(batch_id uuid, task_id uuid, subject_id uuid)
returns jsonb language sql set search_path = '' as $$
  select public.record_study_session_batch(
    batch_id, 'stopwatch', 'Review 9/17', task_id, tests.segments(), subject_id
  );
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('50000000-0000-0000-0000-0000000000a1', 'subjects-a@example.invalid', now(), now(), '{}', '{}'),
  ('50000000-0000-0000-0000-0000000000b2', 'subjects-b@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname)
values
  ('50000000-0000-0000-0000-0000000000a1', 'subjects-a@example.invalid', 'user', 'Subject A'),
  ('50000000-0000-0000-0000-0000000000b2', 'subjects-b@example.invalid', 'user', 'Subject B');
insert into public.study_subjects (id, user_id, name) values
  ('51000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Blockchain'),
  ('51000000-0000-0000-0000-0000000000a2', '50000000-0000-0000-0000-0000000000a1', 'Coding'),
  ('51000000-0000-0000-0000-0000000000b2', '50000000-0000-0000-0000-0000000000b2', 'Blockchain');
insert into public.tasks (id, user_id, title, subject_id) values
  ('52000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Review 9/17', '51000000-0000-0000-0000-0000000000a1'),
  ('52000000-0000-0000-0000-0000000000a2', '50000000-0000-0000-0000-0000000000a1', 'Review 9/12', '51000000-0000-0000-0000-0000000000a1');
insert into public.weekly_plans (id, user_id, title, start_date, end_date, subject_id)
values ('52100000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Week', current_date, current_date, '51000000-0000-0000-0000-0000000000a1');
insert into public.monthly_plans (id, user_id, title, month, year, subject_id)
values ('52200000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Month', 9, 2026, '51000000-0000-0000-0000-0000000000a1');
insert into public.pinned_tasks (id, user_id, title, subject_id)
values ('52300000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Daily review', '51000000-0000-0000-0000-0000000000a1');
insert into public.long_term_tasks (id, user_id, title, subject_id)
values ('52400000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Course', '51000000-0000-0000-0000-0000000000a1');
insert into public.long_term_subtasks (id, user_id, long_term_task_id, title)
values ('52500000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', '52400000-0000-0000-0000-0000000000a1', 'Chapter');
insert into public.groups (id, name, code, leader_id)
values ('59000000-0000-0000-0000-0000000000a1', 'Legacy fixture', 'SUBJ01', '50000000-0000-0000-0000-0000000000a1');
insert into public.study_sessions (id, user_id, duration, mode, task, group_id, created_at, subject_id)
values
  (-9001, '50000000-0000-0000-0000-0000000000a1', 60, 'stopwatch', 'Legacy 1', '59000000-0000-0000-0000-0000000000a1', now(), '51000000-0000-0000-0000-0000000000a1'),
  (-9002, '50000000-0000-0000-0000-0000000000a1', 70, 'stopwatch', 'Legacy 2', '59000000-0000-0000-0000-0000000000a1', now() - interval '1 month', null),
  (-9003, '50000000-0000-0000-0000-0000000000a1', 80, 'pomo', 'Unclassified', null, now(), null),
  (-9010, '50000000-0000-0000-0000-0000000000b2', 90, 'stopwatch', 'Other owner', '59000000-0000-0000-0000-0000000000a1', now(), '51000000-0000-0000-0000-0000000000b2');

-- Least privileges and all six composite ownership boundaries.
select ok((select relrowsecurity from pg_class where oid = 'public.study_subjects'::regclass), 'subjects have RLS');
select ok(not has_table_privilege('anon', 'public.study_subjects', 'SELECT'), 'anonymous users cannot read subjects');
select ok(not has_table_privilege('anon', 'public.study_subjects', 'INSERT'), 'anonymous users cannot create subjects');
select ok(not has_column_privilege('authenticated', 'public.study_subjects', 'user_id', 'UPDATE'), 'subject owner is immutable for clients');
select ok(not has_column_privilege('authenticated', 'public.study_sessions', 'subject_id', 'UPDATE'), 'session classification is RPC-only');
select ok(not has_function_privilege('anon', 'public.classify_study_sessions(bigint[],uuid)', 'EXECUTE'), 'anonymous classification is denied');
select ok(not has_function_privilege('service_role', 'public.classify_study_sessions(bigint[],uuid)', 'EXECUTE'), 'classification requires the user path');
select is(tests.capture_sqlstate(format(
  'update public.%I set subject_id = %L where user_id = %L', table_name,
  '51000000-0000-0000-0000-0000000000b2', '50000000-0000-0000-0000-0000000000a1'
)), '23503', table_name || ' rejects a foreign subject even for privileged writes')
from unnest(array['tasks', 'weekly_plans', 'monthly_plans', 'pinned_tasks', 'long_term_tasks', 'study_sessions']) as table_name;

select tests.set_auth_context('50000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is((select count(*)::integer from public.study_subjects), 2, 'owners only see their subjects');
select is(tests.capture_sqlstate($$insert into public.study_subjects(user_id, name) values ('50000000-0000-0000-0000-0000000000b2', 'Forbidden')$$), '42501', 'cannot create another owner subject');
select is(tests.capture_sqlstate($$insert into public.study_subjects(user_id, name) values ('50000000-0000-0000-0000-0000000000a1', 'blockchain')$$), '23505', 'normalized names are unique per owner');
select is(tests.capture_sqlstate($$insert into public.study_subjects(user_id, name) values ('50000000-0000-0000-0000-0000000000a1', '   ')$$), '23514', 'blank names are rejected');
select is(tests.capture_sqlstate($$insert into public.study_subjects(user_id, name) values ('50000000-0000-0000-0000-0000000000a1', ' Trim me ')$$), '23514', 'names must be trimmed');
select is(tests.capture_sqlstate($$insert into public.study_subjects(user_id, name) values ('50000000-0000-0000-0000-0000000000a1', repeat('x',81))$$), '23514', 'overlong names are rejected');
select lives_ok($$insert into public.study_subjects(user_id, name) values ('50000000-0000-0000-0000-0000000000a1', 'Unused')$$, 'owner can create a subject');
select lives_ok($$delete from public.study_subjects where name = 'Unused'$$, 'owner can delete unused subjects');
with updated as (update public.study_subjects set name = 'Hacked' where id = '51000000-0000-0000-0000-0000000000b2' returning id)
select is((select count(*)::integer from updated), 0, 'cannot rename another owner subject');
with deleted as (delete from public.study_subjects where id = '51000000-0000-0000-0000-0000000000b2' returning id)
select is((select count(*)::integer from deleted), 0, 'cannot delete another owner subject');
select is(tests.capture_sqlstate($$delete from public.study_subjects where id = '51000000-0000-0000-0000-0000000000a1'$$), '23503', 'a referenced subject cannot be deleted');

-- Inheritance occurs only when materializing; existing daily tasks retain their choice.
insert into public.tasks (id, user_id, title, source_subtask_id)
values ('52600000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', 'Chapter', '52500000-0000-0000-0000-0000000000a1');
select is((select subject_id from public.tasks where id = '52600000-0000-0000-0000-0000000000a1'), '51000000-0000-0000-0000-0000000000a1'::uuid, 'materialized daily task inherits parent subject');
update public.tasks set subject_id = null where id = '52600000-0000-0000-0000-0000000000a1';
select is((select subject_id from public.tasks where id = '52600000-0000-0000-0000-0000000000a1'), null::uuid, 'daily subject can subsequently be cleared');

select is(tests.record_batch('53000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'explicit subject batch saves');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a1' and subject_id = '51000000-0000-0000-0000-0000000000a1'), 2, 'every split segment gets its captured subject');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a1')->>'status', 'already_processed', 'same explicit subject retry is idempotent');
select is(tests.capture_sqlstate($$select tests.record_batch('53000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a2')$$), '23505', 'changing captured subject conflicts for same batch');
select is(tests.capture_sqlstate($$select tests.record_batch('53000000-0000-0000-0000-0000000000ff', null, '51000000-0000-0000-0000-0000000000b2')$$), '42501', 'cannot record another user subject');
select is(tests.capture_sqlstate($$select tests.record_batch('53000000-0000-0000-0000-0000000000ff', null, '51000000-0000-0000-0000-0000000000ff')$$), '42501', 'cannot record nonexistent subject');
select is(public.record_study_session_batch('53000000-0000-0000-0000-0000000000a2', 'stopwatch', 'Review 9/17', '52000000-0000-0000-0000-0000000000a1', tests.segments())->>'status', 'saved', 'old five-argument client still records');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a2' and subject_id is null), 2, 'omitted subject stays unclassified even when task has a subject');
update public.tasks set subject_id = '51000000-0000-0000-0000-0000000000a2' where id = '52000000-0000-0000-0000-0000000000a1';
select is(public.record_study_session_batch('53000000-0000-0000-0000-0000000000a2', 'stopwatch', 'Review 9/17', '52000000-0000-0000-0000-0000000000a1', tests.segments())->>'status', 'already_processed', 'old retry preserves null after task subject changes');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a2' and subject_id is null), 2, 'null snapshot survives task recategorization');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a3', '52100000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'weekly plan records captured subject');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a4', '52200000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'monthly plan records captured subject');
select is((select count(*)::integer from public.study_sessions where session_batch_id in ('53000000-0000-0000-0000-0000000000a3','53000000-0000-0000-0000-0000000000a4') and subject_id = '51000000-0000-0000-0000-0000000000a1'), 4, 'plan recordings snapshot their subject');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a5', null, null)->>'status', 'saved', 'freeform recording can stay unclassified');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a5' and subject_id is null), 2, 'unclassified sessions have null subject');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a6', '52000000-0000-0000-0000-0000000000a2', '51000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'different task can share the same subject');
select is((select sum(duration)::bigint from public.study_sessions where session_batch_id in ('53000000-0000-0000-0000-0000000000a1','53000000-0000-0000-0000-0000000000a6') and subject_id = '51000000-0000-0000-0000-0000000000a1'), 240::bigint, 'different tasks aggregate under one subject id');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a7', '52000000-0000-0000-0000-0000000000a2', null)->>'status', 'saved', 'explicit null can override a categorized task');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a7' and subject_id is null), 2, 'explicit unclassified choice is stored unchanged');

reset role;
select ok(not (select payload ? 'subject_id' from private.study_session_batches where batch_id = '53000000-0000-0000-0000-0000000000a2'), 'null subject preserves the exact old canonical payload shape');
select is((select payload->>'subject_id' from private.study_session_batches where batch_id = '53000000-0000-0000-0000-0000000000a1'), '51000000-0000-0000-0000-0000000000a1', 'explicit subject participates in immutable payload');
select is((select count(*)::integer from private.study_session_batches where batch_id = '53000000-0000-0000-0000-0000000000ff'), 0, 'invalid subject rolls back batch ledger insertion');
set local role authenticated;

-- One visible segment selects the entire recording; legacy grouping is owner-scoped.
select is(public.classify_study_sessions(array[(select min(id) from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a1')], '51000000-0000-0000-0000-0000000000a2'), 2, 'classifying one visible segment expands to entire batch');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a1' and subject_id = '51000000-0000-0000-0000-0000000000a2'), 2, 'split batch is classified consistently');
select is(tests.record_batch('53000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a1')->>'status', 'already_processed', 'replay does not overwrite later manual classification');
select is((select sum(duration)::bigint from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a1' and task = 'Review 9/17'), 120::bigint, 'classification preserves title and duration');
select is(public.classify_study_sessions(array[-9001]::bigint[], '51000000-0000-0000-0000-0000000000a2'), 2, 'legacy group expands across dates outside visible page');
select is((select subject_id from public.study_sessions where id = -9002), '51000000-0000-0000-0000-0000000000a2'::uuid, 'legacy segment outside date range is classified');
select is(public.classify_study_sessions(array[-9001,-9001]::bigint[], null), 2, 'duplicates are harmless and subject can be cleared');
select is((select count(*)::integer from public.study_sessions where id in (-9001,-9002) and subject_id is null), 2, 'clear affects all selected batch segments');
select is(public.classify_study_sessions(array[-9003]::bigint[], '51000000-0000-0000-0000-0000000000a2'), 1, 'ungrouped legacy record changes alone');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[-9003,-9010]::bigint[], '51000000-0000-0000-0000-0000000000a1')$$), '42501', 'mixed-owner selection is rejected atomically');
select is((select subject_id from public.study_sessions where id = -9003), '51000000-0000-0000-0000-0000000000a2'::uuid, 'mixed-owner failure leaves own records unchanged');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[-9003,-9999]::bigint[], null)$$), '42501', 'missing session selection is rejected');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[-9003]::bigint[], '51000000-0000-0000-0000-0000000000b2')$$), '42501', 'cannot classify into another owner subject');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[]::bigint[], null)$$), '22023', 'empty selection rejected');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[null]::bigint[], null)$$), '22023', 'null session id rejected');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array_fill(-9003::bigint, array[10001]), null)$$), '22023', 'oversized selection rejected');
select is(public.classify_study_sessions(array_fill(-9003::bigint, array[1000]), '51000000-0000-0000-0000-0000000000a2'), 1, 'normal 1000-row page fits the selection bound');
select is(tests.capture_sqlstate($$update public.study_sessions set subject_id = null where id = -9003$$), '42501', 'direct session subject update remains denied');

-- Subject rename changes display only. Removing task does not delete its record snapshot.
update public.study_subjects set name = 'Distributed systems' where id = '51000000-0000-0000-0000-0000000000a1';
select is((select sum(session.duration)::bigint from public.study_sessions as session join public.study_subjects as subject on subject.id = session.subject_id where session.session_batch_id = '53000000-0000-0000-0000-0000000000a6' and subject.name = 'Distributed systems'), 120::bigint, 'renaming changes display while keeping recorded grouping id');
delete from public.tasks where id = '52000000-0000-0000-0000-0000000000a1';
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a2' and subject_id is null), 2, 'deleting task preserves historical subject snapshot');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '53000000-0000-0000-0000-0000000000a1' and subject_id = '51000000-0000-0000-0000-0000000000a2'), 2, 'deleting task preserves nonnull classified snapshot');
select is(public.record_study_session_batch('53000000-0000-0000-0000-0000000000a2', 'stopwatch', 'Review 9/17', '52000000-0000-0000-0000-0000000000a1', tests.segments())->>'status', 'already_processed', 'legacy replay still succeeds after task deletion');
reset role;
select is((select subject_id from public.study_sessions where id = -9010), '51000000-0000-0000-0000-0000000000b2'::uuid, 'legacy batch expansion never changes another owner');

select tests.set_auth_context(null, 'authenticated');
set local role authenticated;
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[-9003]::bigint[], null)$$), '42501', 'authenticated role without user id is rejected');
reset role;
select tests.set_auth_context(null, 'anon');
set local role anon;
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[-9003]::bigint[], null)$$), '42501', 'anonymous classification cannot execute');
reset role;

select lives_ok($$delete from auth.users where id = '50000000-0000-0000-0000-0000000000a1'$$, 'auth user deletion cascades with subject references across all task and session tables');
select is((select count(*)::integer from public.study_subjects where user_id = '50000000-0000-0000-0000-0000000000a1'), 0, 'account deletion removes subjects');
select is((select count(*)::integer from public.study_sessions where user_id = '50000000-0000-0000-0000-0000000000a1'), 0, 'account deletion removes classified history');
select is((select count(*)::integer from public.study_subjects where user_id = '50000000-0000-0000-0000-0000000000b2'), 1, 'account deletion preserves other user subjects');

select * from finish();
rollback;
