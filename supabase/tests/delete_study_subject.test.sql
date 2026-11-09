-- Subject deletion unassigns every reference without touching study time, and
-- the batch RPC keeps delayed timers/drafts for a deleted subject unclassified.
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
    batch_id, 'stopwatch', 'Physics review', task_id, tests.segments(), subject_id
  );
$$;
-- Every row of the six referencing tables, keyed by table and id. row_data
-- excludes subject_id so "nothing else changed" is one equality per row.
create function tests.snapshot_rows()
returns table (source_table text, row_key text, subject uuid, row_data jsonb)
language sql set search_path = '' as $$
  select 'tasks', t.id::text, t.subject_id, to_jsonb(t) - 'subject_id' from public.tasks as t
  union all
  select 'weekly_plans', w.id::text, w.subject_id, to_jsonb(w) - 'subject_id' from public.weekly_plans as w
  union all
  select 'monthly_plans', m.id::text, m.subject_id, to_jsonb(m) - 'subject_id' from public.monthly_plans as m
  union all
  select 'pinned_tasks', p.id::text, p.subject_id, to_jsonb(p) - 'subject_id' from public.pinned_tasks as p
  union all
  select 'long_term_tasks', l.id::text, l.subject_id, to_jsonb(l) - 'subject_id' from public.long_term_tasks as l
  union all
  select 'study_sessions', s.id::text, s.subject_id, to_jsonb(s) - 'subject_id' from public.study_sessions as s;
$$;
create table tests.results (name text primary key, result jsonb);
grant select, insert on table tests.results to authenticated;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('70000000-0000-0000-0000-0000000000a1', 'subject-delete-a@example.invalid', now(), now(), '{}', '{}'),
  ('70000000-0000-0000-0000-0000000000b2', 'subject-delete-b@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname)
values
  ('70000000-0000-0000-0000-0000000000a1', 'subject-delete-a@example.invalid', 'user', 'Delete A'),
  ('70000000-0000-0000-0000-0000000000b2', 'subject-delete-b@example.invalid', 'user', 'Delete B');
-- a1 is deleted, a2 stays, a3 is used by subject groups, b2 belongs to B.
insert into public.study_subjects (id, user_id, name) values
  ('71000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Physics'),
  ('71000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-0000000000a1', 'Chemistry'),
  ('71000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-0000000000a1', 'Biology'),
  ('71000000-0000-0000-0000-0000000000b2', '70000000-0000-0000-0000-0000000000b2', 'Physics');

-- Long-term roots: one studied root and four more roots on the deleted subject
-- (5), one root per kept/group/foreign subject, and three projects that hold
-- subject groups. Two projects share the title 'Final' to check distinctness.
insert into public.long_term_tasks (id, user_id, title, subject_id) values
  ('72400000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Course', '71000000-0000-0000-0000-0000000000a1'),
  ('72400000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-0000000000a1', 'Chemistry project', '71000000-0000-0000-0000-0000000000a2'),
  ('72400000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-0000000000a1', 'Biology root', '71000000-0000-0000-0000-0000000000a3'),
  ('72400000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000a1', 'Midterm', null),
  ('72400000-0000-0000-0000-0000000000d2', '70000000-0000-0000-0000-0000000000a1', 'Final', null),
  ('72400000-0000-0000-0000-0000000000d3', '70000000-0000-0000-0000-0000000000a1', 'Final', null),
  ('72400000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b2', 'Foreign project', '71000000-0000-0000-0000-0000000000b2');
insert into public.long_term_tasks (user_id, title, subject_id)
select '70000000-0000-0000-0000-0000000000a1', 'Root ' || n, '71000000-0000-0000-0000-0000000000a1'
from generate_series(1, 4) as n;
insert into public.long_term_tasks (id, user_id, title, parent_task_id, subject_id) values
  ('72400000-0000-0000-0000-0000000000e1', '70000000-0000-0000-0000-0000000000a1', 'Biology', '72400000-0000-0000-0000-0000000000d1', '71000000-0000-0000-0000-0000000000a3'),
  ('72400000-0000-0000-0000-0000000000e2', '70000000-0000-0000-0000-0000000000a1', 'Biology', '72400000-0000-0000-0000-0000000000d2', '71000000-0000-0000-0000-0000000000a3'),
  ('72400000-0000-0000-0000-0000000000e3', '70000000-0000-0000-0000-0000000000a1', 'Biology', '72400000-0000-0000-0000-0000000000d3', '71000000-0000-0000-0000-0000000000a3'),
  ('72400000-0000-0000-0000-0000000000e4', '70000000-0000-0000-0000-0000000000a1', 'Chemistry', '72400000-0000-0000-0000-0000000000d1', '71000000-0000-0000-0000-0000000000a2');

-- Daily tasks: three on the deleted subject (one materialized from a root so
-- its records carry long-term snapshots), one per other subject.
insert into public.tasks (id, user_id, title, subject_id) values
  ('72000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Mechanics', '71000000-0000-0000-0000-0000000000a1'),
  ('72000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-0000000000a1', 'Optics', '71000000-0000-0000-0000-0000000000a1'),
  ('72000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-0000000000a1', 'Titration', '71000000-0000-0000-0000-0000000000a2'),
  ('72000000-0000-0000-0000-0000000000a5', '70000000-0000-0000-0000-0000000000a1', 'Cells', '71000000-0000-0000-0000-0000000000a3'),
  ('72000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b2', 'Mechanics', '71000000-0000-0000-0000-0000000000b2');
insert into public.tasks (id, user_id, title, subject_id, source_long_term_task_id) values
  ('72000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-0000000000a1', 'Course', '71000000-0000-0000-0000-0000000000a1', '72400000-0000-0000-0000-0000000000a1');
insert into public.weekly_plans (id, user_id, title, start_date, end_date, subject_id) values
  ('72100000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Week 1', current_date, current_date, '71000000-0000-0000-0000-0000000000a1'),
  ('72100000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-0000000000a1', 'Week 2', current_date, current_date, '71000000-0000-0000-0000-0000000000a1'),
  ('72100000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-0000000000a1', 'Week 3', current_date, current_date, '71000000-0000-0000-0000-0000000000a2');
insert into public.monthly_plans (id, user_id, title, month, year, subject_id) values
  ('72200000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Month 1', 11, 2026, '71000000-0000-0000-0000-0000000000a1'),
  ('72200000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-0000000000a1', 'Month 2', 11, 2026, '71000000-0000-0000-0000-0000000000a2');
insert into public.pinned_tasks (user_id, title, subject_id)
select '70000000-0000-0000-0000-0000000000a1', 'Pin ' || n, '71000000-0000-0000-0000-0000000000a1'
from generate_series(1, 6) as n;
insert into public.pinned_tasks (id, user_id, title, subject_id) values
  ('72300000-0000-0000-0000-0000000000a7', '70000000-0000-0000-0000-0000000000a1', 'Lab notes', '71000000-0000-0000-0000-0000000000a2');
insert into public.study_sessions (id, user_id, duration, mode, task, task_id, created_at, subject_id)
values
  (-9101, '70000000-0000-0000-0000-0000000000a1', 60, 'stopwatch', 'Mechanics', '72000000-0000-0000-0000-0000000000a1', now() - interval '3 days', '71000000-0000-0000-0000-0000000000a1'),
  (-9102, '70000000-0000-0000-0000-0000000000a1', 70, 'pomo', 'Course', '72000000-0000-0000-0000-0000000000a4', now() - interval '2 days', '71000000-0000-0000-0000-0000000000a1'),
  (-9103, '70000000-0000-0000-0000-0000000000a1', 80, 'stopwatch', 'Titration', '72000000-0000-0000-0000-0000000000a3', now() - interval '2 days', '71000000-0000-0000-0000-0000000000a2'),
  (-9104, '70000000-0000-0000-0000-0000000000a1', 90, 'pomo', null, null, now() - interval '1 day', '71000000-0000-0000-0000-0000000000a3'),
  (-9110, '70000000-0000-0000-0000-0000000000b2', 100, 'stopwatch', 'Mechanics', '72000000-0000-0000-0000-0000000000b1', now() - interval '1 day', '71000000-0000-0000-0000-0000000000b2');

-- 1. Least privilege and definition.
select ok(not has_function_privilege('anon', 'public.delete_study_subject(uuid)', 'EXECUTE'), 'anonymous users cannot delete subjects');
select ok(not has_function_privilege('service_role', 'public.delete_study_subject(uuid)', 'EXECUTE'), 'subject deletion requires the user path');
select ok(has_function_privilege('authenticated', 'public.delete_study_subject(uuid)', 'EXECUTE'), 'authenticated users can delete their subjects');
select ok((select p.proacl is not null and not exists (
  select 1 from aclexplode(p.proacl) as acl where acl.grantee = 0
) from pg_proc as p where p.oid = 'public.delete_study_subject(uuid)'::regprocedure), 'subject deletion has no PUBLIC execute ACL');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.delete_study_subject(uuid)'::regprocedure), 'subject deletion is definer with a fixed empty search path');
select is((select prorettype::regtype::text from pg_proc where oid = 'public.delete_study_subject(uuid)'::regprocedure), 'jsonb', 'subject deletion returns jsonb');
select is((select count(*)::integer from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_study_subject'), 1, 'subject deletion has exactly one overload');
select is((select count(*)::integer from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_study_session_batch'), 1, 'batch RPC replacement keeps a single overload');
select ok(has_function_privilege('authenticated', 'public.record_study_session_batch(uuid,text,text,uuid,jsonb,uuid,uuid,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_study_session_batch(uuid,text,text,uuid,jsonb,uuid,uuid,bigint)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_study_session_batch(uuid,text,text,uuid,jsonb,uuid,uuid,bigint)', 'EXECUTE'), 'batch RPC replacement keeps authenticated-only execute');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.record_study_session_batch(uuid,text,text,uuid,jsonb,uuid,uuid,bigint)'::regprocedure), 'batch RPC replacement stays definer with an empty search path');

-- 2. Authentication and argument errors.
select tests.set_auth_context(null, 'authenticated');
set local role authenticated;
select is(tests.capture_sqlstate($$select public.delete_study_subject('71000000-0000-0000-0000-0000000000a1')$$), '42501', 'authenticated role without user id is rejected');
reset role;
select tests.set_auth_context(null, 'anon');
set local role anon;
select is(tests.capture_sqlstate($$select public.delete_study_subject('71000000-0000-0000-0000-0000000000a1')$$), '42501', 'anonymous callers cannot execute subject deletion');
reset role;

select tests.set_auth_context('70000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(tests.capture_sqlstate($$select public.delete_study_subject(null)$$), '22023', 'null subject id is rejected');
-- A record saved with the subject before deletion; replayed after it (8).
select is(tests.record_batch('73000000-0000-0000-0000-0000000000a1', '72000000-0000-0000-0000-0000000000a4', '71000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'fixture: batch saved with the subject before deletion');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '73000000-0000-0000-0000-0000000000a1' and subject_id = '71000000-0000-0000-0000-0000000000a1' and long_term_task_id = '72400000-0000-0000-0000-0000000000a1' and long_term_project_id = '72400000-0000-0000-0000-0000000000a1'), 2, 'fixture: saved batch carries subject and long-term snapshots');
reset role;

create temporary table before_rows as select * from tests.snapshot_rows();
create temporary table before_batches as
select batch.user_id, batch.batch_id, to_jsonb(batch) as row_data
from private.study_session_batches as batch;
create temporary table before_a_sessions as
select count(*)::integer as row_count, sum(duration)::bigint as total_seconds
from public.study_sessions where user_id = '70000000-0000-0000-0000-0000000000a1';
select is((select row_count from before_a_sessions), 6, 'fixture: owner has six records before deletion');

-- 3. Missing or foreign subjects change nothing and are indistinguishable.
select tests.set_auth_context('70000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(public.delete_study_subject('71000000-0000-0000-0000-0000000000b2'), '{"status":"not_found"}'::jsonb, 'another user subject is reported as not found');
select is(public.delete_study_subject('71000000-0000-0000-0000-0000000000ff'), '{"status":"not_found"}'::jsonb, 'unknown subject is reported as not found');

-- 5. A subject used by subject groups is refused with distinct sorted project titles.
select is(public.delete_study_subject('71000000-0000-0000-0000-0000000000a3'), '{"status":"in_use_by_subject_group","projects":["Final","Midterm"]}'::jsonb, 'subject used by groups is refused with its project titles');
reset role;

select is((select count(*)::integer from public.study_subjects where id in ('71000000-0000-0000-0000-0000000000a1', '71000000-0000-0000-0000-0000000000a2', '71000000-0000-0000-0000-0000000000a3', '71000000-0000-0000-0000-0000000000b2')), 4, 'refused and not-found calls keep every subject');
select is((select count(*)::integer from before_rows as b join tests.snapshot_rows() as a using (source_table, row_key) where a.subject is not distinct from b.subject and a.row_data = b.row_data), (select count(*)::integer from before_rows), 'refused and not-found calls keep every reference row unchanged');
select is((select count(*)::integer from tests.snapshot_rows()), (select count(*)::integer from before_rows), 'refused and not-found calls add or remove no rows');

-- 4. Deleting a referenced subject unassigns exactly its references.
select tests.set_auth_context('70000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
insert into tests.results (name, result)
values ('physics', public.delete_study_subject('71000000-0000-0000-0000-0000000000a1'));
select is((select result from tests.results where name = 'physics'), '{"status":"deleted","unassigned":{"tasks":3,"weekly_plans":2,"monthly_plans":1,"pinned_tasks":6,"long_term_tasks":5,"study_sessions":4}}'::jsonb, 'deletion reports unassigned counts for all six tables');
select is(tests.capture_sqlstate($$delete from public.study_subjects where id = '71000000-0000-0000-0000-0000000000a2'$$), '23503', 'a referenced subject still cannot be deleted directly');
reset role;

select is((select count(*)::integer from public.study_subjects where id = '71000000-0000-0000-0000-0000000000a1'), 0, 'deleted subject row is gone');
select is((select count(*)::integer from public.study_subjects where id in ('71000000-0000-0000-0000-0000000000a2', '71000000-0000-0000-0000-0000000000a3', '71000000-0000-0000-0000-0000000000b2')), 3, 'other subjects of the owner and other users remain');
select is((select count(*)::integer from tests.snapshot_rows() where subject = '71000000-0000-0000-0000-0000000000a1'), 0, 'no reference to the deleted subject remains');
select is((select count(*)::integer from before_rows as b join tests.snapshot_rows() as a using (source_table, row_key) where b.subject = '71000000-0000-0000-0000-0000000000a1' and a.subject is null), 21, 'every former reference is now unclassified');
select is((select count(*)::integer from before_rows as b join tests.snapshot_rows() as a using (source_table, row_key) where b.subject is distinct from '71000000-0000-0000-0000-0000000000a1' and a.subject is not distinct from b.subject), (select count(*)::integer from before_rows where subject is distinct from '71000000-0000-0000-0000-0000000000a1'), 'other subject references and other users rows keep their subject');
select is((select count(*)::integer from before_rows as b join tests.snapshot_rows() as a using (source_table, row_key) where a.row_data = b.row_data), (select count(*)::integer from before_rows), 'every column except subject_id is unchanged in all six tables');
select is((select count(*)::integer from tests.snapshot_rows()), (select count(*)::integer from before_rows), 'deletion adds or removes no reference rows');
select is((select count(*)::integer from public.long_term_tasks where parent_task_id is not null and subject_id is not null), 4, 'subject groups keep their subjects');
select is(
  (select row(count(*)::integer, sum(duration)::bigint)::text from public.study_sessions where user_id = '70000000-0000-0000-0000-0000000000a1'),
  (select row(row_count, total_seconds)::text from before_a_sessions),
  'record count and total duration are unchanged');
select is((select count(*)::integer from before_rows as b join public.study_sessions as s on b.source_table = 'study_sessions' and b.row_key = s.id::text
  where (b.row_data->>'created_at')::timestamptz = s.created_at
    and (b.row_data->>'duration')::bigint = s.duration
    and (b.row_data->>'session_batch_id')::uuid is not distinct from s.session_batch_id
    and (b.row_data->>'task_id')::uuid is not distinct from s.task_id
    and (b.row_data->>'long_term_task_id')::uuid is not distinct from s.long_term_task_id
    and (b.row_data->>'long_term_project_id')::uuid is not distinct from s.long_term_project_id),
  (select count(*)::integer from before_rows where source_table = 'study_sessions'),
  'created_at, duration, batch, task and long-term snapshots are unchanged');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '73000000-0000-0000-0000-0000000000a1' and subject_id is null and long_term_project_id = '72400000-0000-0000-0000-0000000000a1'), 2, 'batch recorded before deletion keeps its long-term project');
select is((select count(*)::integer from before_batches as b join private.study_session_batches as batch using (user_id, batch_id) where to_jsonb(batch) = b.row_data), (select count(*)::integer from before_batches), 'batch idempotency ledger is untouched');
select is((select payload->>'subject_id' from private.study_session_batches where batch_id = '73000000-0000-0000-0000-0000000000a1'), '71000000-0000-0000-0000-0000000000a1', 'ledger keeps the subject submitted before deletion');

-- 3 (again) and 6. An already deleted subject is not found; its name is free.
select tests.set_auth_context('70000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(public.delete_study_subject('71000000-0000-0000-0000-0000000000a1'), '{"status":"not_found"}'::jsonb, 'deleting the same subject again is reported as not found');
select lives_ok($$insert into public.study_subjects (user_id, name) values ('70000000-0000-0000-0000-0000000000a1', 'Physics')$$, 'a subject with the deleted name can be created again');
select is((select count(*)::integer from public.study_subjects where name = 'Physics' and id <> '71000000-0000-0000-0000-0000000000a1'), 1, 'recreated subject has a new identity');
select is(tests.capture_sqlstate($$select public.classify_study_sessions(array[-9101]::bigint[], '71000000-0000-0000-0000-0000000000a1')$$), '42501', 'history cannot be classified into a deleted subject');

-- 7. A delayed first save for the deleted subject keeps its time unclassified.
select is(tests.record_batch('73000000-0000-0000-0000-0000000000a2', null, '71000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'first save with a deleted subject succeeds');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '73000000-0000-0000-0000-0000000000a2' and subject_id is null), 2, 'deleted subject is recorded as unclassified');
select is((select sum(duration)::bigint from public.study_sessions where session_batch_id = '73000000-0000-0000-0000-0000000000a2'), 120::bigint, 'deleted subject save keeps the full duration');
select is(tests.record_batch('73000000-0000-0000-0000-0000000000a2', null, '71000000-0000-0000-0000-0000000000a1')->>'status', 'already_processed', 'replaying the deleted subject save is idempotent');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '73000000-0000-0000-0000-0000000000a2'), 2, 'replay adds no rows');
select is(tests.capture_sqlstate($$select tests.record_batch('73000000-0000-0000-0000-0000000000a3', null, '71000000-0000-0000-0000-0000000000b2')$$), '42501', 'another user subject is still rejected');

-- 8. A batch saved before deletion still converges on replay.
select is(tests.record_batch('73000000-0000-0000-0000-0000000000a1', '72000000-0000-0000-0000-0000000000a4', '71000000-0000-0000-0000-0000000000a1')->>'status', 'already_processed', 'pre-deletion batch replay converges after deletion');
select is((select count(*)::integer from public.study_sessions where session_batch_id = '73000000-0000-0000-0000-0000000000a1' and subject_id is null), 2, 'pre-deletion batch stays unclassified without duplicates');
reset role;

select is((select payload->>'subject_id' from private.study_session_batches where batch_id = '73000000-0000-0000-0000-0000000000a2'), '71000000-0000-0000-0000-0000000000a1', 'ledger keeps the submitted deleted subject id');
select is((select count(*)::integer from private.study_session_batches where batch_id = '73000000-0000-0000-0000-0000000000a3'), 0, 'rejected foreign subject rolls back the ledger insertion');

-- Removing the groups first lets the group subject be deleted.
select tests.set_auth_context('70000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
delete from public.long_term_tasks where parent_task_id is not null and subject_id = '71000000-0000-0000-0000-0000000000a3';
select is(public.delete_study_subject('71000000-0000-0000-0000-0000000000a3'), '{"status":"deleted","unassigned":{"tasks":1,"weekly_plans":0,"monthly_plans":0,"pinned_tasks":0,"long_term_tasks":1,"study_sessions":1}}'::jsonb, 'group subject is deletable after its groups are removed');
select is((select subject_id from public.long_term_tasks where id = '72400000-0000-0000-0000-0000000000c1'), null::uuid, 'root on the former group subject becomes unclassified');
select is((select count(*)::integer from public.long_term_tasks where id in ('72400000-0000-0000-0000-0000000000d1', '72400000-0000-0000-0000-0000000000d2', '72400000-0000-0000-0000-0000000000d3', '72400000-0000-0000-0000-0000000000e4')), 4, 'projects and other groups remain');
reset role;

select is((select subject_id from public.study_sessions where id = -9110), '71000000-0000-0000-0000-0000000000b2'::uuid, 'other user record keeps its subject');
select is((select subject_id from public.tasks where id = '72000000-0000-0000-0000-0000000000b1'), '71000000-0000-0000-0000-0000000000b2'::uuid, 'other user task keeps its subject');

select * from finish();
rollback;
