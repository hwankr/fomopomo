-- Archiving a subject only sets archived_at. Every reference, record and the
-- record/classify/delete RPCs keep working with the archived subject id.
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
    batch_id, 'stopwatch', 'Past papers', task_id, tests.segments(), subject_id
  );
$$;
-- Every row of the six referencing tables, keyed by table and id. row_data is
-- the whole row, subject_id included, so one equality proves nothing changed.
create function tests.snapshot_rows()
returns table (source_table text, row_key text, subject uuid, row_data jsonb)
language sql set search_path = '' as $$
  select 'tasks', t.id::text, t.subject_id, to_jsonb(t) from public.tasks as t
  union all
  select 'weekly_plans', w.id::text, w.subject_id, to_jsonb(w) from public.weekly_plans as w
  union all
  select 'monthly_plans', m.id::text, m.subject_id, to_jsonb(m) from public.monthly_plans as m
  union all
  select 'pinned_tasks', p.id::text, p.subject_id, to_jsonb(p) from public.pinned_tasks as p
  union all
  select 'long_term_tasks', l.id::text, l.subject_id, to_jsonb(l) from public.long_term_tasks as l
  union all
  select 'study_sessions', s.id::text, s.subject_id, to_jsonb(s) from public.study_sessions as s;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('c0000000-0000-0000-0000-0000000000a1', 'subject-archive-a@example.invalid', now(), now(), '{}', '{}'),
  ('c0000000-0000-0000-0000-0000000000b2', 'subject-archive-b@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname)
values
  ('c0000000-0000-0000-0000-0000000000a1', 'subject-archive-a@example.invalid', 'user', 'Archive A'),
  ('c0000000-0000-0000-0000-0000000000b2', 'subject-archive-b@example.invalid', 'user', 'Archive B');
-- a1 is archived, a2 stays in use, b2 belongs to B under the same name as a1.
insert into public.study_subjects (id, user_id, name) values
  ('c1000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'Engineer Exam'),
  ('c1000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Semester Math'),
  ('c1000000-0000-0000-0000-0000000000b2', 'c0000000-0000-0000-0000-0000000000b2', 'Engineer Exam');

-- Long-term: a root on a1, a project with subject groups on a1 and a2.
insert into public.long_term_tasks (id, user_id, title, subject_id) values
  ('c2400000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'Exam prep', 'c1000000-0000-0000-0000-0000000000a1'),
  ('c2400000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Spring term', null);
insert into public.long_term_tasks (id, user_id, title, parent_task_id, subject_id) values
  ('c2400000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000a1', 'Engineer Exam', 'c2400000-0000-0000-0000-0000000000a2', 'c1000000-0000-0000-0000-0000000000a1'),
  ('c2400000-0000-0000-0000-0000000000e2', 'c0000000-0000-0000-0000-0000000000a1', 'Semester Math', 'c2400000-0000-0000-0000-0000000000a2', 'c1000000-0000-0000-0000-0000000000a2');
-- Daily tasks: two on a1 (one materialized from the root, so its records carry
-- long-term snapshots), one on a2, one of B.
insert into public.tasks (id, user_id, title, subject_id) values
  ('c2000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'Past papers', 'c1000000-0000-0000-0000-0000000000a1'),
  ('c2000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Calculus', 'c1000000-0000-0000-0000-0000000000a2'),
  ('c2000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000b2', 'Past papers', 'c1000000-0000-0000-0000-0000000000b2');
insert into public.tasks (id, user_id, title, subject_id, source_long_term_task_id) values
  ('c2000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000a1', 'Exam prep', 'c1000000-0000-0000-0000-0000000000a1', 'c2400000-0000-0000-0000-0000000000a1');
insert into public.weekly_plans (id, user_id, title, start_date, end_date, subject_id) values
  ('c2100000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'Week exam', current_date, current_date, 'c1000000-0000-0000-0000-0000000000a1'),
  ('c2100000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Week math', current_date, current_date, 'c1000000-0000-0000-0000-0000000000a2');
insert into public.monthly_plans (id, user_id, title, month, year, subject_id) values
  ('c2200000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'Month exam', 11, 2026, 'c1000000-0000-0000-0000-0000000000a1');
insert into public.pinned_tasks (id, user_id, title, subject_id) values
  ('c2300000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'Daily exam drill', 'c1000000-0000-0000-0000-0000000000a1'),
  ('c2300000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a1', 'Daily math drill', 'c1000000-0000-0000-0000-0000000000a2');
insert into public.study_sessions (id, user_id, duration, mode, task, task_id, created_at, subject_id)
values
  (-9301, 'c0000000-0000-0000-0000-0000000000a1', 60, 'stopwatch', 'Past papers', 'c2000000-0000-0000-0000-0000000000a1', now() - interval '3 days', 'c1000000-0000-0000-0000-0000000000a1'),
  (-9302, 'c0000000-0000-0000-0000-0000000000a1', 70, 'pomo', 'Exam prep', 'c2000000-0000-0000-0000-0000000000a3', now() - interval '2 days', 'c1000000-0000-0000-0000-0000000000a1'),
  (-9303, 'c0000000-0000-0000-0000-0000000000a1', 80, 'stopwatch', 'Calculus', 'c2000000-0000-0000-0000-0000000000a2', now() - interval '1 day', 'c1000000-0000-0000-0000-0000000000a2'),
  (-9304, 'c0000000-0000-0000-0000-0000000000a1', 90, 'pomo', null, null, now() - interval '1 day', null),
  (-9310, 'c0000000-0000-0000-0000-0000000000b2', 100, 'stopwatch', 'Past papers', 'c2000000-0000-0000-0000-0000000000b1', now() - interval '1 day', 'c1000000-0000-0000-0000-0000000000b2');

-- 1. Column definition.
select is((select format_type(atttypid, atttypmod) from pg_attribute
  where attrelid = 'public.study_subjects'::regclass and attname = 'archived_at' and not attisdropped),
  'timestamp with time zone', 'archived_at exists as timestamptz');
select ok((select not attnotnull from pg_attribute
  where attrelid = 'public.study_subjects'::regclass and attname = 'archived_at'), 'archived_at is nullable');
select ok((select not atthasdef from pg_attribute
  where attrelid = 'public.study_subjects'::regclass and attname = 'archived_at'), 'archived_at has no default');
select ok((select col_description(attrelid, attnum) like '%never changes references%' from pg_attribute
  where attrelid = 'public.study_subjects'::regclass and attname = 'archived_at'), 'archived_at documents that archiving keeps references');
select is((select count(*)::integer from public.study_subjects where archived_at is not null), 0, 'existing subjects start in use');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'study_subjects' and 'archived_at' = any(attnames)), 'realtime publication carries archived_at');
select is((select relreplident::text from pg_class where oid = 'public.study_subjects'::regclass), 'f', 'subjects keep replica identity full');

-- 2. Privileges and policies.
select ok(has_column_privilege('authenticated', 'public.study_subjects', 'archived_at', 'UPDATE'), 'authenticated can update archived_at');
select ok(has_column_privilege('authenticated', 'public.study_subjects', 'archived_at', 'SELECT'), 'authenticated can read archived_at');
select ok(not has_column_privilege('authenticated', 'public.study_subjects', 'archived_at', 'INSERT'), 'authenticated cannot insert archived_at');
select ok(has_column_privilege('authenticated', 'public.study_subjects', 'name', 'UPDATE'), 'rename privilege is unchanged');
select ok(not has_column_privilege('authenticated', 'public.study_subjects', 'id', 'UPDATE'), 'subject id stays immutable for clients');
select ok(not has_column_privilege('authenticated', 'public.study_subjects', 'user_id', 'UPDATE'), 'subject owner stays immutable for clients');
select ok(not has_column_privilege('authenticated', 'public.study_subjects', 'created_at', 'UPDATE'), 'subject creation time stays immutable for clients');
select ok(has_column_privilege('authenticated', 'public.study_subjects', 'id', 'INSERT')
  and has_column_privilege('authenticated', 'public.study_subjects', 'user_id', 'INSERT')
  and has_column_privilege('authenticated', 'public.study_subjects', 'name', 'INSERT')
  and not has_column_privilege('authenticated', 'public.study_subjects', 'created_at', 'INSERT'), 'insert privilege stays limited to id, user_id and name');
select ok(not has_any_column_privilege('anon', 'public.study_subjects', 'SELECT'), 'anonymous users cannot read subjects');
select ok(not has_any_column_privilege('anon', 'public.study_subjects', 'INSERT'), 'anonymous users cannot create subjects');
select ok(not has_any_column_privilege('anon', 'public.study_subjects', 'UPDATE'), 'anonymous users cannot update any subject column');
select ok(not has_table_privilege('anon', 'public.study_subjects', 'DELETE'), 'anonymous users cannot delete subjects');
select is((select array_agg(policyname::text order by policyname) from pg_policies
  where schemaname = 'public' and tablename = 'study_subjects'),
  array['Owners can create study subjects', 'Owners can delete unused study subjects',
    'Owners can read study subjects', 'Owners can rename study subjects'],
  'subject policies are unchanged; no archive policy is added');
select is((select row(roles::text[], qual, with_check)::text from pg_policies
  where schemaname = 'public' and tablename = 'study_subjects' and cmd = 'UPDATE'),
  row(array['authenticated'], '(( SELECT auth.uid() AS uid) = user_id)', '(( SELECT auth.uid() AS uid) = user_id)')::text,
  'the single owner-only update policy also governs archiving');

-- 3. A new subject starts in use and cannot be created pre-archived.
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select lives_ok($$insert into public.study_subjects (user_id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'Fresh subject')$$, 'owner creates a subject');
select is((select archived_at from public.study_subjects where name = 'Fresh subject'), null::timestamptz, 'a new subject has a null archived_at');
select is(tests.capture_sqlstate($$insert into public.study_subjects (user_id, name, archived_at) values ('c0000000-0000-0000-0000-0000000000a1', 'Pre-archived', now())$$), '42501', 'a subject cannot be inserted already archived');
delete from public.study_subjects where name = 'Fresh subject';
reset role;

-- 4. Archiving changes nothing but archived_at.
create temporary table before_archive_subjects as
select subject.id, to_jsonb(subject) - 'archived_at' as row_data, subject.archived_at
from public.study_subjects as subject;
-- Recorded before archiving so a real batch with segments references a1.
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(tests.record_batch('c3000000-0000-0000-0000-0000000000a1', 'c2000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'fixture: batch saved before archiving');
reset role;
create temporary table before_archive_rows as select * from tests.snapshot_rows();
create temporary table before_archive_batches as
select batch.user_id, batch.batch_id, to_jsonb(batch) as row_data
from private.study_session_batches as batch;
select is((select count(*)::integer from before_archive_rows where subject = 'c1000000-0000-0000-0000-0000000000a1'), 11, 'fixture: eleven rows reference the subject before archiving');

select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(tests.capture_sqlstate($$update public.study_subjects set archived_at = now(), user_id = 'c0000000-0000-0000-0000-0000000000b2' where id = 'c1000000-0000-0000-0000-0000000000a1'$$), '42501', 'archiving cannot also move the owner');
select is(tests.capture_sqlstate($$update public.study_subjects set archived_at = now(), created_at = now() where id = 'c1000000-0000-0000-0000-0000000000a1'$$), '42501', 'archiving cannot also rewrite created_at');
with updated as (
  update public.study_subjects set archived_at = '2026-11-09 01:00:00+00'
  where id = 'c1000000-0000-0000-0000-0000000000a1' returning id
)
select is((select count(*)::integer from updated), 1, 'owner archives their subject');
select is((select archived_at from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a1'), '2026-11-09 01:00:00+00'::timestamptz, 'archived_at holds the archive time');
select is((select count(*)::integer from public.study_subjects), 2, 'owner still reads the archived subject with the active one');
reset role;

select is((select count(*)::integer from before_archive_subjects as b join public.study_subjects as s on s.id = b.id
  where to_jsonb(s) - 'archived_at' = b.row_data), 3, 'archiving keeps every subject id, owner, name and created_at');
select is((select count(*)::integer from public.study_subjects where archived_at is not null), 1, 'archiving touches only the archived subject');
select is((select count(*)::integer from before_archive_rows as b join tests.snapshot_rows() as a using (source_table, row_key)
  where a.row_data = b.row_data), (select count(*)::integer from before_archive_rows), 'every reference row in the six tables is unchanged by archiving');
select is((select count(*)::integer from tests.snapshot_rows()), (select count(*)::integer from before_archive_rows), 'archiving adds or removes no reference rows');
select is((select count(*)::integer from tests.snapshot_rows() where subject = 'c1000000-0000-0000-0000-0000000000a1'), 11, 'all eleven references still point at the archived subject');
select is((select array_agg(source_table order by source_table) from (select distinct source_table from tests.snapshot_rows() where subject = 'c1000000-0000-0000-0000-0000000000a1') as t),
  array['long_term_tasks', 'monthly_plans', 'pinned_tasks', 'study_sessions', 'tasks', 'weekly_plans'], 'references survive in all six tables');
select is((select subject_id from public.long_term_tasks where id = 'c2400000-0000-0000-0000-0000000000e1'), 'c1000000-0000-0000-0000-0000000000a1'::uuid, 'subject group keeps the archived subject');
select is((select subject_id from public.long_term_tasks where id = 'c2400000-0000-0000-0000-0000000000a1'), 'c1000000-0000-0000-0000-0000000000a1'::uuid, 'long-term root keeps the archived subject');
select is((select count(*)::integer from before_archive_rows as b join public.study_sessions as s on b.source_table = 'study_sessions' and b.row_key = s.id::text
  where (b.row_data->>'created_at')::timestamptz = s.created_at
    and (b.row_data->>'duration')::bigint = s.duration
    and (b.row_data->>'session_batch_id')::uuid is not distinct from s.session_batch_id
    and (b.row_data->>'subject_id')::uuid is not distinct from s.subject_id),
  (select count(*)::integer from before_archive_rows where source_table = 'study_sessions'),
  'record times, durations, batch IDs and subjects are unchanged');
select is((select count(*)::integer from before_archive_batches as b join private.study_session_batches as batch using (user_id, batch_id)
  where to_jsonb(batch) = b.row_data), (select count(*)::integer from before_archive_batches), 'batch idempotency ledger is untouched by archiving');

-- 5. Other users and anonymous callers cannot archive.
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
with updated as (
  update public.study_subjects set archived_at = now()
  where id = 'c1000000-0000-0000-0000-0000000000b2' returning id
)
select is((select count(*)::integer from updated), 0, 'cannot archive another user subject');
reset role;
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000b2', 'authenticated');
set local role authenticated;
select is((select count(*)::integer from public.study_subjects), 1, 'another user does not see the archived subject');
with updated as (
  update public.study_subjects set archived_at = null
  where id = 'c1000000-0000-0000-0000-0000000000a1' returning id
)
select is((select count(*)::integer from updated), 0, 'cannot restore another user subject');
reset role;
select tests.set_auth_context(null, 'authenticated');
set local role authenticated;
with updated as (
  update public.study_subjects set archived_at = null returning id
)
select is((select count(*)::integer from updated), 0, 'authenticated role without user id changes no subject');
reset role;
select tests.set_auth_context(null, 'anon');
set local role anon;
select is(tests.capture_sqlstate($$update public.study_subjects set archived_at = now() where id = 'c1000000-0000-0000-0000-0000000000a2'$$), '42501', 'anonymous archiving is denied');
select is(tests.capture_sqlstate($$select archived_at from public.study_subjects$$), '42501', 'anonymous users cannot read archived_at');
reset role;
select is((select archived_at from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000b2'), null::timestamptz, 'foreign subject stays in use');
select is((select archived_at from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a1'), '2026-11-09 01:00:00+00'::timestamptz, 'archived subject stays archived after the foreign restore attempt');
select is((select archived_at from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a2'), null::timestamptz, 'active subject stays in use after denied attempts');

-- 6. Timers and offline drafts holding an archived subject record into it.
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(tests.record_batch('c3000000-0000-0000-0000-0000000000a2', 'c2000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-0000000000a1')->>'status', 'saved', 'a batch for the archived subject saves');
select is((select count(*)::integer from public.study_sessions where session_batch_id = 'c3000000-0000-0000-0000-0000000000a2'), 2, 'the archived subject batch stores every segment');
select is((select count(*)::integer from public.study_sessions where session_batch_id = 'c3000000-0000-0000-0000-0000000000a2' and subject_id = 'c1000000-0000-0000-0000-0000000000a1'), 2, 'the archived subject batch is classified into the archived subject, not unclassified');
select is((select sum(duration)::bigint from public.study_sessions where session_batch_id = 'c3000000-0000-0000-0000-0000000000a2'), 120::bigint, 'the archived subject batch keeps its full duration');
select is(tests.record_batch('c3000000-0000-0000-0000-0000000000a2', 'c2000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-0000000000a1')->>'status', 'already_processed', 'replaying the archived subject batch is idempotent');
select is(tests.record_batch('c3000000-0000-0000-0000-0000000000a1', 'c2000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-0000000000a1')->>'status', 'already_processed', 'a batch saved before archiving still converges on replay');
select is((select count(*)::integer from public.study_sessions where session_batch_id in ('c3000000-0000-0000-0000-0000000000a1', 'c3000000-0000-0000-0000-0000000000a2') and subject_id = 'c1000000-0000-0000-0000-0000000000a1'), 4, 'replays add no rows and keep the archived subject');
reset role;
select is((select payload->>'subject_id' from private.study_session_batches where batch_id = 'c3000000-0000-0000-0000-0000000000a2'), 'c1000000-0000-0000-0000-0000000000a1', 'ledger keeps the archived subject id');

-- 7. History can still be classified into an archived subject.
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(public.classify_study_sessions(array[-9304]::bigint[], 'c1000000-0000-0000-0000-0000000000a1'), 1, 'an unclassified record can be classified into the archived subject');
select is((select subject_id from public.study_sessions where id = -9304), 'c1000000-0000-0000-0000-0000000000a1'::uuid, 'the classified record points at the archived subject');
select is((select duration::bigint from public.study_sessions where id = -9304), 90::bigint,'classification into the archived subject keeps the duration');

-- 8. Names stay unique across archived subjects, so the client restores one.
select is(tests.capture_sqlstate($$insert into public.study_subjects (user_id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'Engineer Exam')$$), '23505', 'the archived subject name cannot be created again');
select is(tests.capture_sqlstate($$insert into public.study_subjects (user_id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'ENGINEER exam')$$), '23505', 'a case variant of the archived name is rejected as a duplicate');
-- Untrimmed names already fail the name CHECK, so spacing cannot bypass it.
select is(tests.capture_sqlstate($$insert into public.study_subjects (user_id, name) values ('c0000000-0000-0000-0000-0000000000a1', ' engineer exam ')$$), '23514', 'a spaced variant of the archived name is rejected');
select is(tests.capture_sqlstate($$update public.study_subjects set name = 'engineer EXAM' where id = 'c1000000-0000-0000-0000-0000000000a2'$$), '23505', 'another subject cannot be renamed to the archived name');
select is((select name from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a2'), 'Semester Math', 'the refused rename leaves the active subject name');
reset role;

-- 9. Restoring brings back the same subject and again changes nothing else.
create temporary table before_restore_rows as select * from tests.snapshot_rows();
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
with updated as (
  update public.study_subjects set archived_at = null
  where id = 'c1000000-0000-0000-0000-0000000000a1' returning id
)
select is((select count(*)::integer from updated), 1, 'owner restores the archived subject');
select is((select archived_at from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a1'), null::timestamptz, 'the restored subject is in use again');
reset role;
select is((select count(*)::integer from before_archive_subjects as b join public.study_subjects as s on s.id = b.id
  where to_jsonb(s) - 'archived_at' = b.row_data and s.archived_at is null), 3, 'restoring keeps the same id, owner, name and created_at');
select is((select count(*)::integer from before_restore_rows as b join tests.snapshot_rows() as a using (source_table, row_key)
  where a.row_data = b.row_data), (select count(*)::integer from before_restore_rows), 'every reference row is unchanged by restoring');
select is((select count(*)::integer from tests.snapshot_rows()), (select count(*)::integer from before_restore_rows), 'restoring adds or removes no reference rows');

-- 10. An archived subject is deleted under the existing rules.
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
update public.study_subjects set archived_at = now() where id = 'c1000000-0000-0000-0000-0000000000a1';
select ok((select archived_at is not null from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a1'), 'fixture: subject archived again before deletion');
select is(public.delete_study_subject('c1000000-0000-0000-0000-0000000000a1'), '{"status":"in_use_by_subject_group","projects":["Spring term"]}'::jsonb, 'an archived subject used by a subject group is still refused');
delete from public.long_term_tasks where id = 'c2400000-0000-0000-0000-0000000000e1';
reset role;
create temporary table before_delete_rows as select * from tests.snapshot_rows();
create temporary table before_delete_sessions as
select count(*)::integer as row_count, sum(duration)::bigint as total_seconds
from public.study_sessions where user_id = 'c0000000-0000-0000-0000-0000000000a1';
select tests.set_auth_context('c0000000-0000-0000-0000-0000000000a1', 'authenticated');
set local role authenticated;
select is(public.delete_study_subject('c1000000-0000-0000-0000-0000000000a1'), '{"status":"deleted","unassigned":{"tasks":2,"weekly_plans":1,"monthly_plans":1,"pinned_tasks":1,"long_term_tasks":1,"study_sessions":7}}'::jsonb, 'an archived subject can be deleted and reports its unassigned references');
reset role;
select is((select count(*)::integer from public.study_subjects where id = 'c1000000-0000-0000-0000-0000000000a1'), 0, 'the deleted archived subject row is gone');
select is((select count(*)::integer from tests.snapshot_rows() where subject = 'c1000000-0000-0000-0000-0000000000a1'), 0, 'no reference to the deleted archived subject remains');
select is((select count(*)::integer from before_delete_rows as b join tests.snapshot_rows() as a using (source_table, row_key)
  where b.subject = 'c1000000-0000-0000-0000-0000000000a1' and a.subject is null
    and a.row_data - 'subject_id' = b.row_data - 'subject_id'), 13, 'every former reference is unclassified with nothing else changed');
select is((select count(*)::integer from before_delete_rows as b join tests.snapshot_rows() as a using (source_table, row_key)
  where b.subject is distinct from 'c1000000-0000-0000-0000-0000000000a1' and a.row_data = b.row_data),
  (select count(*)::integer from before_delete_rows where subject is distinct from 'c1000000-0000-0000-0000-0000000000a1'), 'rows on other subjects and other users are unchanged');
select is(
  (select row(count(*)::integer, sum(duration)::bigint)::text from public.study_sessions where user_id = 'c0000000-0000-0000-0000-0000000000a1'),
  (select row(row_count, total_seconds)::text from before_delete_sessions),
  'deleting the archived subject keeps record count and total duration');
select is((select subject_id from public.long_term_tasks where id = 'c2400000-0000-0000-0000-0000000000e2'), 'c1000000-0000-0000-0000-0000000000a2'::uuid, 'the other subject group keeps its subject');
select is((select subject_id from public.study_sessions where id = -9310), 'c1000000-0000-0000-0000-0000000000b2'::uuid, 'other user record keeps its subject');

select * from finish();
rollback;
