-- Replay the actual migration, preserving every preexisting session field.
begin;
set local search_path = extensions, public, pg_catalog;
select no_plan();

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'project-backfill@example.invalid', now(), now(), '{}', '{}');
insert into public.study_subjects (id, user_id, name) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Existing subject');
insert into public.long_term_tasks (id, user_id, title, subject_id) values
  ('e2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Existing project', 'e1000000-0000-0000-0000-000000000001');
insert into public.tasks (id, user_id, title, source_long_term_task_id) values
  ('e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Existing daily task', 'e2000000-0000-0000-0000-000000000001');
insert into public.study_sessions (id, user_id, duration, mode, task_id, subject_id, created_at, session_batch_id) values
  (-9601, 'e0000000-0000-0000-0000-000000000001', 60, 'stopwatch', 'e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', now() - interval '1 month', 'e4000000-0000-0000-0000-000000000001'),
  (-9602, 'e0000000-0000-0000-0000-000000000001', 90, 'pomo', 'e3000000-0000-0000-0000-000000000001', null, now() - interval '2 months', null),
  (-9603, 'e0000000-0000-0000-0000-000000000001', 120, 'pomo', null, null, now() - interval '1 month', null);
delete from public.tasks where id = 'e3000000-0000-0000-0000-000000000001';

create temporary table original_session_rows as
select id, to_jsonb(session) - 'long_term_project_id' as row_data
from public.study_sessions as session where id in (-9601, -9602, -9603);
alter table public.study_sessions drop column long_term_project_id;
drop trigger set_long_term_task_root_reference_before_write on public.long_term_tasks;
drop function public.set_long_term_task_root_reference();
alter table public.long_term_tasks drop constraint long_term_tasks_parent_user_fkey;
alter table public.long_term_tasks drop column root_reference_id;
alter table public.long_term_tasks drop column parent_task_id;

\ir ../migrations/20261009122050_long_term_project_subject_groups.sql

select is((select count(*)::integer from public.study_sessions where id in (-9601, -9602) and long_term_project_id = 'e2000000-0000-0000-0000-000000000001'), 2, 'backfill uses historical leaf snapshots even after daily task deletion');
select is((select long_term_project_id from public.study_sessions where id = -9603), null::uuid, 'backfill does not invent attribution for an unlinked record');
select is((select count(*)::integer from original_session_rows as original join public.study_sessions as session using (id) where original.row_data = to_jsonb(session) - 'long_term_project_id'), 3, 'backfill preserves every prior session field including subject, duration, date, leaf and batch');
select is((select parent_task_id from public.long_term_tasks where id = 'e2000000-0000-0000-0000-000000000001'), null::uuid, 'existing projects remain standalone roots');
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is((select duration_seconds from public.get_long_term_task_durations() where long_term_task_id = 'e2000000-0000-0000-0000-000000000001'), 150::bigint, 'migrated root immediately includes historical time exactly once');
reset role;
select * from finish();
rollback;
