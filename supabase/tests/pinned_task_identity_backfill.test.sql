-- Replay the real migration against legacy data in a rolled-back transaction.
begin;
set local search_path = extensions, public, pg_catalog;
select no_plan();
-- Reset only the dedicated fixture owner; rollback restores any existing data.
delete from auth.users where id = '7e000000-0000-0000-0000-0000000000a1';
drop function public.pin_daily_task(uuid);
drop function public.materialize_pinned_tasks(uuid, date);
drop function public.update_daily_task_with_pin(uuid, text, uuid);
alter table public.tasks drop column source_pinned_task_id;
alter table public.pinned_tasks drop constraint pinned_tasks_id_user_id_key;

insert into auth.users (id, email, created_at, confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('7e000000-0000-0000-0000-0000000000a1', 'pin-legacy@example.invalid', now(), now(), '{}', '{}');
insert into public.profiles (id, email, role, nickname)
values ('7e000000-0000-0000-0000-0000000000a1', 'pin-legacy@example.invalid', 'user', 'Pin legacy');
insert into public.study_subjects (id, user_id, name) values
('7e100000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-0000000000a1', 'Database'),
('7e100000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-0000000000a1', 'Blockchain');
insert into public.pinned_tasks (id, user_id, title, subject_id) values
('7e200000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-0000000000a1', 'Review', '7e100000-0000-0000-0000-000000000001'),
('7e200000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-0000000000a1', 'Review', '7e100000-0000-0000-0000-000000000002'),
('7e200000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-0000000000a1', 'Duplicate template', null),
('7e200000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-0000000000a1', 'Duplicate template', null),
('7e200000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-0000000000a1', 'Duplicate occurrence', null),
('7e200000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-0000000000a1', 'Sourced', null),
('7e200000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-0000000000a1', 'Null subject', null);
insert into public.long_term_tasks (id, user_id, title)
values ('7e400000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-0000000000a1', 'Sourced');
insert into public.tasks (id, user_id, title, subject_id, due_date, source_long_term_task_id) values
('7e300000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-0000000000a1', 'Review', '7e100000-0000-0000-0000-000000000001', current_date, null),
('7e300000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-0000000000a1', 'Review', '7e100000-0000-0000-0000-000000000002', current_date, null),
('7e300000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-0000000000a1', 'Duplicate template', null, current_date, null),
('7e300000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-0000000000a1', 'Duplicate occurrence', null, current_date, null),
('7e300000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-0000000000a1', 'Duplicate occurrence', null, current_date, null),
('7e300000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-0000000000a1', 'Sourced', null, current_date, '7e400000-0000-0000-0000-000000000001'),
('7e300000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-0000000000a1', 'Null subject', null, current_date, null),
('7e300000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-0000000000a1', 'Review', '7e100000-0000-0000-0000-000000000001', current_date - 1, null);
\ir ../migrations/20261003050311_pinned_task_identity.sql

select is((select source_pinned_task_id from public.tasks where id = '7e300000-0000-0000-0000-000000000001'), '7e200000-0000-0000-0000-000000000001'::uuid, 'backfill matches the database subject independently');
select is((select source_pinned_task_id from public.tasks where id = '7e300000-0000-0000-0000-000000000002'), '7e200000-0000-0000-0000-000000000002'::uuid, 'backfill distinguishes same-title blockchain subject');
select is((select count(*)::integer from public.tasks where id in ('7e300000-0000-0000-0000-000000000003', '7e300000-0000-0000-0000-000000000004', '7e300000-0000-0000-0000-000000000005', '7e300000-0000-0000-0000-000000000006') and source_pinned_task_id is null), 4, 'ambiguous templates, duplicate occurrences and long-term sources stay unlinked');
select is((select source_pinned_task_id from public.tasks where id = '7e300000-0000-0000-0000-000000000007'), '7e200000-0000-0000-0000-000000000007'::uuid, 'backfill matches null subjects safely');
select is((select source_pinned_task_id from public.tasks where id = '7e300000-0000-0000-0000-000000000008'), '7e200000-0000-0000-0000-000000000001'::uuid, 'one template links independent historical dates without rewriting content');

select is((select count(*)::integer from public.tasks where user_id = '7e000000-0000-0000-0000-0000000000a1'), 8, 'backfill preserves every legacy daily task');
select set_config('request.jwt.claim.sub', '7e000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select lives_ok($$select * from public.materialize_pinned_tasks('7e000000-0000-0000-0000-0000000000a1', current_date)$$, 'upgraded current day materializes safely');
select is((select count(*)::integer from public.tasks where user_id = '7e000000-0000-0000-0000-0000000000a1' and title = 'Review' and due_date = current_date), 2, 'unambiguous existing current-day occurrences are not duplicated');
reset role;
select * from finish();
rollback;
