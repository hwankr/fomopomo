-- Two-session checks for delete_study_subject against concurrent writes.
-- pgTAP runs a file in one session, so it cannot show that a second
-- transaction really waits for the subject lock. Here this psql session only
-- coordinates: dblink opens two app-like sessions, and every scenario releases
-- the first session only after pg_blocking_pids shows the second one blocked
-- by it, so a run in which the sessions never overlap fails instead of passing.
-- Runs on the isolated harness database only (scripts/test-supabase-security.ps1,
-- after pgTAP). Fixtures are committed so both sessions see them, and they and
-- the dblink extension are removed at the end. Any mismatch raises an exception.
\set ON_ERROR_STOP 1
\set QUIET on
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;
-- Bounds the coordinator; each app session also gets its own timeouts below.
set statement_timeout = '60s';
set lock_timeout = '10s';

create extension dblink with schema extensions;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('7c000000-0000-0000-0000-0000000000a1', 'subject-delete-concurrency@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname)
values ('7c000000-0000-0000-0000-0000000000a1', 'subject-delete-concurrency@example.invalid', 'user', 'Concurrency');
-- One subject per scenario, so each starts from an unreferenced subject.
insert into public.study_subjects (id, user_id, name) values
  ('7c100000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-0000000000a1', 'Concurrency S1'),
  ('7c100000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-0000000000a1', 'Concurrency S2'),
  ('7c100000-0000-0000-0000-000000000003', '7c000000-0000-0000-0000-0000000000a1', 'Concurrency S3');

-- Helpers live in pg_temp and disappear with this session.
-- An app session logs in as authenticator and switches to authenticated with
-- the user's JWT claims, as PostgREST does. dblink lets a non-superuser connect
-- only with a password, so it uses the container name (the scram-sha-256 path;
-- 127.0.0.1 is trust) and the CLI's fixed local password.
create function pg_temp.open_app_session(p_name text, p_user_id uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  v_pid integer;
  v_uid uuid;
  v_role text;
begin
  perform extensions.dblink_connect(p_name,
    'host=supabase_db_fomopomo-security-test port=5432 dbname=postgres user=authenticator password=postgres');
  perform extensions.dblink_exec(p_name, 'set lock_timeout = ''5s''');
  perform extensions.dblink_exec(p_name, 'set statement_timeout = ''15s''');
  perform * from extensions.dblink(p_name, format(
    'select set_config(''request.jwt.claim.sub'', %L, false),
            set_config(''request.jwt.claim.role'', ''authenticated'', false),
            set_config(''request.jwt.claims'', %L, false)',
    p_user_id, jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text
  )) as t(sub text, role text, claims text);
  perform extensions.dblink_exec(p_name, 'set role authenticated');
  select t.pid, t.uid, t.role into v_pid, v_uid, v_role
  from extensions.dblink(p_name, 'select pg_backend_pid(), auth.uid(), current_user::text')
    as t(pid integer, uid uuid, role text);
  if v_uid is distinct from p_user_id or v_role is distinct from 'authenticated' then
    raise exception 'session % is not acting as the user (uid %, role %)', p_name, v_uid, v_role;
  end if;
  return v_pid;
end;
$$;

-- Polls until the waiter is blocked on a lock held by the holder. Fails if the
-- waiter finishes first or never waits, so the scenario really overlaps.
create function pg_temp.await_lock_wait(
  p_label text, p_waiter text, p_waiter_pid integer, p_holder_pid integer
)
returns text language plpgsql set search_path = '' as $$
declare
  v_wait_type text;
  v_wait_event text;
begin
  for v_poll in 1 .. 200 loop
    -- pg_stat_activity is cached per transaction; reread it on every poll.
    perform pg_catalog.pg_stat_clear_snapshot();
    select activity.wait_event_type, activity.wait_event
    into v_wait_type, v_wait_event
    from pg_catalog.pg_stat_activity as activity
    where activity.pid = p_waiter_pid;
    if v_wait_type = 'Lock'
      and p_holder_pid = any (pg_catalog.pg_blocking_pids(p_waiter_pid)) then
      return format('%s waiting confirmed: pid %s waits on Lock/%s held by pid %s (poll %s)',
        p_label, p_waiter_pid, v_wait_event, p_holder_pid, v_poll);
    end if;
    if extensions.dblink_is_busy(p_waiter) = 0 then
      raise exception '%: pid % finished without waiting for pid %',
        p_label, p_waiter_pid, p_holder_pid;
    end if;
    perform pg_catalog.pg_sleep(0.025);
  end loop;
  raise exception '%: pid % never waited for a lock held by pid % (last wait %/%)',
    p_label, p_waiter_pid, p_holder_pid, v_wait_type, v_wait_event;
end;
$$;

create function pg_temp.segments()
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('index', 0, 'duration', 60, 'ended_at',
      to_char((now() - interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_object('index', 1, 'duration', 60, 'ended_at',
      to_char((now() - interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );
$$;

create function pg_temp.record_sql(p_batch_id uuid, p_subject_id uuid)
returns text language sql set search_path = '' as $$
  select format(
    'select public.record_study_session_batch(%L, ''stopwatch'', ''Concurrency check'', null, %L::jsonb, %L)',
    p_batch_id, pg_temp.segments(), p_subject_id);
$$;

-- References in the six referencing tables plus the subject row itself.
create function pg_temp.subject_reference_count(p_subject_id uuid)
returns integer language sql set search_path = '' as $$
  select (
    (select count(*) from public.tasks where subject_id = p_subject_id)
    + (select count(*) from public.weekly_plans where subject_id = p_subject_id)
    + (select count(*) from public.monthly_plans where subject_id = p_subject_id)
    + (select count(*) from public.pinned_tasks where subject_id = p_subject_id)
    + (select count(*) from public.long_term_tasks where subject_id = p_subject_id)
    + (select count(*) from public.study_sessions where subject_id = p_subject_id)
    + (select count(*) from public.study_subjects where id = p_subject_id)
  )::integer;
$$;

-- Rows, unclassified rows, seconds and ledger subject of one batch.
create function pg_temp.batch_state(p_batch_id uuid)
returns table (row_count integer, null_subject_rows integer, total_seconds bigint, ledger_subject text)
language sql set search_path = '' as $$
  select
    (select count(*)::integer from public.study_sessions where session_batch_id = p_batch_id),
    (select count(*)::integer from public.study_sessions where session_batch_id = p_batch_id and subject_id is null),
    (select coalesce(sum(duration), 0)::bigint from public.study_sessions where session_batch_id = p_batch_id),
    (select payload->>'subject_id' from private.study_session_batches where batch_id = p_batch_id);
$$;

-- S1. Deletion locks first; the first save for that subject waits, then
-- records the full time unclassified while the ledger keeps the submitted ID.
create function pg_temp.s1_delete_then_record()
returns setof text language plpgsql set search_path = '' as $$
declare
  c_user uuid := '7c000000-0000-0000-0000-0000000000a1';
  c_subject uuid := '7c100000-0000-0000-0000-000000000001';
  c_batch uuid := '7c300000-0000-0000-0000-000000000001';
  v_a integer;
  v_b integer;
  v_deleted jsonb;
  v_saved jsonb;
  v_state record;
begin
  v_a := pg_temp.open_app_session('s1_a', c_user);
  v_b := pg_temp.open_app_session('s1_b', c_user);

  perform extensions.dblink_exec('s1_a', 'begin');
  select t.result into v_deleted
  from extensions.dblink('s1_a', format('select public.delete_study_subject(%L)', c_subject))
    as t(result jsonb);
  if v_deleted->>'status' is distinct from 'deleted' then
    raise exception 'S1: deletion did not run: %', v_deleted;
  end if;

  perform extensions.dblink_send_query('s1_b', pg_temp.record_sql(c_batch, c_subject));
  return next pg_temp.await_lock_wait('S1', 's1_b', v_b, v_a);
  perform extensions.dblink_exec('s1_a', 'commit');

  select t.result into v_saved from extensions.dblink_get_result('s1_b') as t(result jsonb);
  perform * from extensions.dblink_get_result('s1_b') as t(result jsonb);
  select * into v_state from pg_temp.batch_state(c_batch);

  if v_saved->>'status' is distinct from 'saved'
    or (v_saved->>'total_seconds')::bigint is distinct from 120 then
    raise exception 'S1: waiting first save returned %', v_saved;
  end if;
  if v_state.row_count is distinct from 2 or v_state.null_subject_rows is distinct from 2
    or v_state.total_seconds is distinct from 120 then
    raise exception 'S1: saved rows % rows, % unclassified, % seconds',
      v_state.row_count, v_state.null_subject_rows, v_state.total_seconds;
  end if;
  if v_state.ledger_subject is distinct from c_subject::text then
    raise exception 'S1: ledger payload subject is %', v_state.ledger_subject;
  end if;
  if pg_temp.subject_reference_count(c_subject) is distinct from 0 then
    raise exception 'S1: % rows still reference the deleted subject',
      pg_temp.subject_reference_count(c_subject);
  end if;

  perform extensions.dblink_disconnect('s1_a');
  perform extensions.dblink_disconnect('s1_b');
  return next format(
    'S1 result: delete %s; waiting save %s with %s rows / %s seconds, %s unclassified; ledger subject kept; 0 references left',
    v_deleted->>'status', v_saved->>'status', v_state.row_count, v_state.total_seconds,
    v_state.null_subject_rows);
end;
$$;

-- S2. The first save locks first; deletion waits for its commit, then
-- unassigns the rows that save committed.
create function pg_temp.s2_record_then_delete()
returns setof text language plpgsql set search_path = '' as $$
declare
  c_user uuid := '7c000000-0000-0000-0000-0000000000a1';
  c_subject uuid := '7c100000-0000-0000-0000-000000000002';
  c_batch uuid := '7c300000-0000-0000-0000-000000000002';
  v_a integer;
  v_b integer;
  v_saved jsonb;
  v_deleted jsonb;
  v_state record;
begin
  v_a := pg_temp.open_app_session('s2_a', c_user);
  v_b := pg_temp.open_app_session('s2_b', c_user);

  perform extensions.dblink_exec('s2_b', 'begin');
  select t.result into v_saved
  from extensions.dblink('s2_b', pg_temp.record_sql(c_batch, c_subject)) as t(result jsonb);
  -- The fixture save is two segments; a missing or null count fails too.
  if v_saved->>'status' is distinct from 'saved'
    or (v_saved->>'segment_count')::integer is distinct from 2 then
    raise exception 'S2: first save did not run: %', v_saved;
  end if;

  perform extensions.dblink_send_query('s2_a', format('select public.delete_study_subject(%L)', c_subject));
  return next pg_temp.await_lock_wait('S2', 's2_a', v_a, v_b);
  perform extensions.dblink_exec('s2_b', 'commit');

  select t.result into v_deleted from extensions.dblink_get_result('s2_a') as t(result jsonb);
  perform * from extensions.dblink_get_result('s2_a') as t(result jsonb);
  select * into v_state from pg_temp.batch_state(c_batch);

  if v_deleted->>'status' is distinct from 'deleted'
    or ((v_deleted->'unassigned'->>'study_sessions')::integer >= 2) is not true then
    raise exception 'S2: waiting deletion returned % after a save of % rows',
      v_deleted, v_saved->>'segment_count';
  end if;
  if v_state.row_count is distinct from 2 or v_state.null_subject_rows is distinct from 2
    or v_state.total_seconds is distinct from 120 then
    raise exception 'S2: saved rows % rows, % unclassified, % seconds',
      v_state.row_count, v_state.null_subject_rows, v_state.total_seconds;
  end if;
  if v_state.ledger_subject is distinct from c_subject::text then
    raise exception 'S2: ledger payload subject is %', v_state.ledger_subject;
  end if;
  if pg_temp.subject_reference_count(c_subject) is distinct from 0 then
    raise exception 'S2: % rows still reference the deleted subject',
      pg_temp.subject_reference_count(c_subject);
  end if;

  perform extensions.dblink_disconnect('s2_a');
  perform extensions.dblink_disconnect('s2_b');
  return next format(
    'S2 result: save %s with %s rows; waiting delete %s, unassigned study_sessions %s; %s rows / %s seconds now unclassified; 0 references left',
    v_saved->>'status', v_saved->>'segment_count', v_deleted->>'status',
    v_deleted->'unassigned'->>'study_sessions', v_state.null_subject_rows, v_state.total_seconds);
end;
$$;

-- S3. Deletion locks first; a direct task insert for that subject waits on
-- the FK check and then fails with 23503 instead of pointing at a gone subject.
create function pg_temp.s3_delete_then_insert_task()
returns setof text language plpgsql set search_path = '' as $$
declare
  c_user uuid := '7c000000-0000-0000-0000-0000000000a1';
  c_subject uuid := '7c100000-0000-0000-0000-000000000003';
  c_task uuid := '7c200000-0000-0000-0000-000000000003';
  v_a integer;
  v_b integer;
  v_deleted jsonb;
  v_sqlstate text := 'none';
  v_message text;
begin
  v_a := pg_temp.open_app_session('s3_a', c_user);
  v_b := pg_temp.open_app_session('s3_b', c_user);

  perform extensions.dblink_exec('s3_a', 'begin');
  select t.result into v_deleted
  from extensions.dblink('s3_a', format('select public.delete_study_subject(%L)', c_subject))
    as t(result jsonb);
  if v_deleted->>'status' is distinct from 'deleted' then
    raise exception 'S3: deletion did not run: %', v_deleted;
  end if;

  perform extensions.dblink_send_query('s3_b', format(
    'insert into public.tasks (id, user_id, title, subject_id) values (%L, %L, ''Concurrency task'', %L)',
    c_task, c_user, c_subject));
  return next pg_temp.await_lock_wait('S3', 's3_b', v_b, v_a);
  perform extensions.dblink_exec('s3_a', 'commit');

  -- dblink re-raises the remote error with its SQLSTATE.
  begin
    perform * from extensions.dblink_get_result('s3_b') as t(status text);
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
  end;
  perform * from extensions.dblink_get_result('s3_b') as t(status text);

  if v_sqlstate is distinct from '23503' then
    raise exception 'S3: waiting task insert ended with % (%)', v_sqlstate, v_message;
  end if;
  if exists (select 1 from public.tasks where id = c_task) then
    raise exception 'S3: the rejected task exists';
  end if;
  if pg_temp.subject_reference_count(c_subject) is distinct from 0 then
    raise exception 'S3: % rows still reference the deleted subject',
      pg_temp.subject_reference_count(c_subject);
  end if;

  perform extensions.dblink_disconnect('s3_a');
  perform extensions.dblink_disconnect('s3_b');
  return next format('S3 result: delete %s; waiting task insert failed with %s (%s); no task references the subject',
    v_deleted->>'status', v_sqlstate, v_message);
end;
$$;

select pg_temp.s1_delete_then_record();
select pg_temp.s2_record_then_delete();
select pg_temp.s3_delete_then_insert_task();

delete from public.study_sessions where user_id = '7c000000-0000-0000-0000-0000000000a1';
delete from private.study_session_batches where user_id = '7c000000-0000-0000-0000-0000000000a1';
delete from public.tasks where user_id = '7c000000-0000-0000-0000-0000000000a1';
delete from public.study_subjects where user_id = '7c000000-0000-0000-0000-0000000000a1';
delete from public.profiles where id = '7c000000-0000-0000-0000-0000000000a1';
delete from auth.users where id = '7c000000-0000-0000-0000-0000000000a1';
drop extension dblink;

do $$
begin
  if exists (select 1 from auth.users where id = '7c000000-0000-0000-0000-0000000000a1')
    or exists (select 1 from public.study_sessions where user_id = '7c000000-0000-0000-0000-0000000000a1')
    or exists (select 1 from private.study_session_batches where user_id = '7c000000-0000-0000-0000-0000000000a1')
    or exists (select 1 from pg_catalog.pg_extension where extname = 'dblink') then
    raise exception 'concurrency fixtures or dblink were not removed';
  end if;
end;
$$;
select 'Concurrency cleanup: fixtures and dblink removed';
