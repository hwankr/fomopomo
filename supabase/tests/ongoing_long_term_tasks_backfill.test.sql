-- Replay this migration inside a rolled-back transaction to verify real
-- historical backfill, rather than duplicating its UPDATE in the assertion.
begin;
set local search_path = extensions, public, pg_catalog;
select no_plan();

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('70000000-0000-0000-0000-0000000000a1', 'backfill-a@example.invalid', now(), now(), '{}', '{}'),
  ('70000000-0000-0000-0000-0000000000b2', 'backfill-b@example.invalid', now(), now(), '{}', '{}');
insert into public.long_term_tasks (id, user_id, title) values
  ('71000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Existing project');
insert into public.long_term_subtasks (id, user_id, long_term_task_id, title) values
  ('72000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', '71000000-0000-0000-0000-0000000000a1', 'Existing subtask');
insert into public.tasks (id, user_id, title, source_subtask_id) values
  ('73000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1', 'Existing daily task', '72000000-0000-0000-0000-0000000000a1');
insert into public.study_sessions (id, user_id, duration, mode, task_id, created_at) values
  (-9201, '70000000-0000-0000-0000-0000000000a1', 60, 'stopwatch', '73000000-0000-0000-0000-0000000000a1', now() - interval '1 month'),
  (-9202, '70000000-0000-0000-0000-0000000000a1', 90, 'pomo', '73000000-0000-0000-0000-0000000000a1', now() - interval '2 months'),
  (-9203, '70000000-0000-0000-0000-0000000000b2', 999, 'stopwatch', '73000000-0000-0000-0000-0000000000a1', now() - interval '1 month'),
  (-9204, '70000000-0000-0000-0000-0000000000a1', 120, 'pomo', null, now() - interval '1 month');

drop function public.get_long_term_task_durations();
drop trigger snapshot_long_term_task_on_study_session_insert on public.study_sessions;
drop function public.snapshot_study_session_long_term_task();
alter table public.study_sessions drop column long_term_task_id;
alter table public.tasks drop column source_long_term_task_id;
alter table public.long_term_tasks drop constraint long_term_tasks_id_user_id_key;

\ir ../migrations/20260930013607_ongoing_long_term_task_tracking.sql

select is((select count(*)::integer from public.study_sessions where id in (-9201, -9202) and long_term_task_id = '71000000-0000-0000-0000-0000000000a1'), 2, 'migration backfills all owned historical subtask sessions');
select is((select created_at from public.study_sessions where id = -9201), now() - interval '1 month', 'backfill preserves the original date');
select is((select sum(duration)::bigint from public.study_sessions where id in (-9201, -9202)), 150::bigint, 'backfill preserves original durations');
select is((select long_term_task_id from public.study_sessions where id = -9203), null::uuid, 'backfill ignores foreign-owner task links');
select is((select long_term_task_id from public.study_sessions where id = -9204), null::uuid, 'backfill does not invent a project for unlinked records');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = '71000000-0000-0000-0000-0000000000a1'), 150::bigint, 'aggregate immediately includes migrated historical subtask time');
reset role;
select * from finish();
rollback;
