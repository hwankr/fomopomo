-- A project can stay standalone, have direct subtasks, or contain subject
-- groups. Subject groups reuse the existing studyable long-term task identity.
alter table public.long_term_tasks
  add column parent_task_id uuid,
  add column root_reference_id uuid;

-- Use an ordinary column with a trigger and row-local CHECK, not a generated
-- column: generated columns conflict with this table's REPLICA IDENTITY FULL
-- and its existing realtime publication. The client never sets this marker.
create function public.set_long_term_task_root_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.root_reference_id := case when new.parent_task_id is null then new.id else null end;
  return new;
end;
$$;

revoke execute on function public.set_long_term_task_root_reference()
  from public, anon, authenticated, service_role;

create trigger set_long_term_task_root_reference_before_write
  before insert or update on public.long_term_tasks
  for each row execute function public.set_long_term_task_root_reference();

update public.long_term_tasks set root_reference_id = id;

alter table public.long_term_tasks
  add constraint long_term_tasks_root_reference_check check (
    root_reference_id is not distinct from
      case when parent_task_id is null then id else null end
  ),
  add constraint long_term_tasks_root_reference_user_key
    unique (root_reference_id, user_id),
  add constraint long_term_tasks_parent_user_fkey
    foreign key (parent_task_id, user_id)
    references public.long_term_tasks (root_reference_id, user_id)
    on delete cascade,
  add constraint long_term_tasks_subject_group_check
    check (parent_task_id is null or subject_id is not null);

-- Referencing a derived root-only key makes cycles and deeper nesting
-- impossible, including concurrent writes and converting a root with children.
-- FK enforcement also covers privileged writes independently of RLS.
create unique index long_term_tasks_parent_subject_key
  on public.long_term_tasks (parent_task_id, subject_id);

-- Keep the root project at recording time alongside the leaf task snapshot.
-- Removing or moving a subject group must not erase or move earned root time.
alter table public.study_sessions
  add column long_term_project_id uuid,
  add constraint study_sessions_long_term_project_id_user_id_fkey
    foreign key (long_term_project_id, user_id)
    references public.long_term_tasks (id, user_id)
    on delete set null (long_term_project_id);

create index study_sessions_user_long_term_project_idx
  on public.study_sessions (user_id, long_term_project_id);

create or replace function public.snapshot_study_session_long_term_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Never trust caller-supplied attribution. The batch RPC runs as definer,
  -- therefore all source lookups explicitly enforce ownership as well.
  select leaf.id, coalesce(leaf.parent_task_id, leaf.id)
  into new.long_term_task_id, new.long_term_project_id
  from public.tasks as task
  left join public.long_term_subtasks as subtask
    on subtask.id = task.source_subtask_id
    and subtask.user_id = new.user_id
  join public.long_term_tasks as leaf
    on leaf.id = coalesce(task.source_long_term_task_id, subtask.long_term_task_id)
    and leaf.user_id = new.user_id
  where task.id = new.task_id
    and task.user_id = new.user_id;

  return new;
end;
$$;

revoke execute on function public.snapshot_study_session_long_term_task()
  from public, anon, authenticated, service_role;

-- Existing projects are all roots at this migration boundary. Backfill only
-- the new snapshot; durations, dates, subjects, leaf snapshots and batches stay
-- untouched. Deleted/unknown source links cannot be reconstructed reliably.
update public.study_sessions as session
set long_term_project_id = coalesce(leaf.parent_task_id, leaf.id)
from public.long_term_tasks as leaf
where session.long_term_task_id = leaf.id
  and session.user_id = leaf.user_id
  and session.long_term_project_id is null;

create or replace function public.get_long_term_task_durations()
returns table (long_term_task_id uuid, duration_seconds bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with leaf_totals as (
    select session.long_term_task_id as id, sum(session.duration)::bigint as seconds
    from public.study_sessions as session
    where session.user_id = (select auth.uid())
      and session.long_term_task_id is not null
    group by session.long_term_task_id
  ), project_totals as (
    select session.long_term_project_id as id, sum(session.duration)::bigint as seconds
    from public.study_sessions as session
    where session.user_id = (select auth.uid())
      and session.long_term_project_id is not null
    group by session.long_term_project_id
  )
  select task.id,
    coalesce(case when task.parent_task_id is null then project_totals.seconds
      else leaf_totals.seconds end, 0)::bigint
  from public.long_term_tasks as task
  left join leaf_totals on leaf_totals.id = task.id
  left join project_totals on project_totals.id = task.id
  where task.user_id = (select auth.uid());
$$;

revoke execute on function public.get_long_term_task_durations()
  from public, anon, authenticated, service_role;
grant execute on function public.get_long_term_task_durations() to authenticated;
