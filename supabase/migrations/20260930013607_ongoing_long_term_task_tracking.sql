-- Ongoing projects can be selected directly on any day without a deadline or
-- subtask. A daily task remains the timer's recording target.
alter table public.long_term_tasks
  add constraint long_term_tasks_id_user_id_key unique (id, user_id);

alter table public.tasks
  add column source_long_term_task_id uuid,
  add constraint tasks_source_long_term_task_id_user_id_fkey
    foreign key (source_long_term_task_id, user_id)
    references public.long_term_tasks (id, user_id)
    on delete set null (source_long_term_task_id),
  add constraint tasks_one_long_term_source_check
    check (source_subtask_id is null or source_long_term_task_id is null);

-- A regular unique index is inferable by PostgREST's on_conflict parameter.
-- due_date is already NOT NULL; NULL sources leave ordinary tasks unrestricted.
create unique index tasks_source_long_term_task_id_due_date_key
  on public.tasks (source_long_term_task_id, due_date);

-- Extend the existing insertion-only subject inheritance to direct projects.
-- Explicit daily classification and previously materialized tasks stay intact.
create or replace function public.inherit_task_study_subject()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.subject_id is null then
    if new.source_long_term_task_id is not null then
      select parent.subject_id into new.subject_id
      from public.long_term_tasks as parent
      where parent.id = new.source_long_term_task_id
        and parent.user_id = new.user_id;
    elsif new.source_subtask_id is not null then
      select parent.subject_id into new.subject_id
      from public.long_term_subtasks as subtask
      join public.long_term_tasks as parent on parent.id = subtask.long_term_task_id
      where subtask.id = new.source_subtask_id
        and subtask.user_id = new.user_id
        and parent.user_id = new.user_id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.inherit_task_study_subject()
  from public, anon, authenticated, service_role;

-- The parent is a session snapshot, not a live join through a daily task. Daily
-- task/subtask deletion or reparenting must not erase or move already earned time.
alter table public.study_sessions
  add column long_term_task_id uuid,
  add constraint study_sessions_long_term_task_id_user_id_fkey
    foreign key (long_term_task_id, user_id)
    references public.long_term_tasks (id, user_id)
    on delete set null (long_term_task_id);

create index study_sessions_user_long_term_task_idx
  on public.study_sessions (user_id, long_term_task_id);

create function public.snapshot_study_session_long_term_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Always derive the snapshot from an owned daily task, never caller input.
  -- The batch RPC runs as definer, so each join must enforce owner equality
  -- explicitly rather than relying on RLS being active inside this trigger.
  select parent.id into new.long_term_task_id
  from public.tasks as task
  left join public.long_term_subtasks as subtask
    on subtask.id = task.source_subtask_id
    and subtask.user_id = new.user_id
  join public.long_term_tasks as parent
    on parent.id = coalesce(task.source_long_term_task_id, subtask.long_term_task_id)
    and parent.user_id = new.user_id
  where task.id = new.task_id
    and task.user_id = new.user_id;

  return new;
end;
$$;

revoke execute on function public.snapshot_study_session_long_term_task()
  from public, anon, authenticated, service_role;

create trigger snapshot_long_term_task_on_study_session_insert
  before insert on public.study_sessions
  for each row execute function public.snapshot_study_session_long_term_task();

-- Include existing subtask recordings without rewriting timestamps, durations,
-- subjects, or batch identities. Previously deleted source links are unknown.
update public.study_sessions as session
set long_term_task_id = parent.id
from public.tasks as task
left join public.long_term_subtasks as subtask
  on subtask.id = task.source_subtask_id
  and subtask.user_id = task.user_id
join public.long_term_tasks as parent
  on parent.id = coalesce(task.source_long_term_task_id, subtask.long_term_task_id)
  and parent.user_id = task.user_id
where session.task_id = task.id
  and session.user_id = task.user_id
  and session.long_term_task_id is null;

-- Aggregate on the database so the API's session row cap cannot truncate a
-- project's lifetime total. Friends' readable sessions must not enter totals.
create function public.get_long_term_task_durations()
returns table (long_term_task_id uuid, duration_seconds bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select parent.id, coalesce(sum(session.duration), 0)::bigint
  from public.long_term_tasks as parent
  left join public.study_sessions as session
    on session.long_term_task_id = parent.id
    and session.user_id = (select auth.uid())
  where parent.user_id = (select auth.uid())
  group by parent.id;
$$;

revoke execute on function public.get_long_term_task_durations()
  from public, anon, authenticated, service_role;
grant execute on function public.get_long_term_task_durations() to authenticated;
