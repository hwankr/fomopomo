-- Stable recurring-template identity; names and subjects remain editable data.
alter table public.pinned_tasks
  add constraint pinned_tasks_id_user_id_key unique (id, user_id);
alter table public.tasks
  add column source_pinned_task_id uuid,
  add constraint tasks_source_pinned_task_id_user_id_fkey
    foreign key (source_pinned_task_id, user_id)
    references public.pinned_tasks (id, user_id)
    on delete set null (source_pinned_task_id);
create unique index tasks_source_pinned_task_id_due_date_key
  on public.tasks (source_pinned_task_id, due_date);

-- The previous UI associated pins by title. Preserve only unambiguous legacy
-- matches, additionally requiring the same owner and null-safe subject. Never
-- guess among duplicate templates/tasks or attach a long-term materialization.
with candidates as (
  select task.id as task_id, pin.id as pin_id,
    count(*) over (partition by task.id) as matching_pins,
    count(*) over (partition by pin.id, task.due_date) as matching_tasks
  from public.tasks as task
  join public.pinned_tasks as pin
    on pin.user_id = task.user_id
    and pin.title = task.title
    and pin.subject_id is not distinct from task.subject_id
  where task.source_subtask_id is null
    and task.source_long_term_task_id is null
)
update public.tasks as task
set source_pinned_task_id = candidates.pin_id
from candidates
where task.id = candidates.task_id
  and candidates.matching_pins = 1 and candidates.matching_tasks = 1;

-- Lock the original task so two pin requests cannot create two templates.
-- RLS remains active; an old account's callback cannot pin the new user's data.
create function public.pin_daily_task(p_task_id uuid)
returns setof public.pinned_tasks
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_pin public.pinned_tasks%rowtype;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_task from public.tasks
  where id = p_task_id and user_id = v_owner for update;
  if not found then
    raise exception 'Task does not belong to the caller' using errcode = '42501';
  end if;
  if v_task.source_pinned_task_id is not null then
    return query select * from public.pinned_tasks
      where id = v_task.source_pinned_task_id and user_id = v_owner;
    return;
  end if;
  insert into public.pinned_tasks (user_id, title, subject_id, position)
  values (v_owner, v_task.title, v_task.subject_id,
    (select coalesce(max(position), -1) + 1 from public.pinned_tasks where user_id = v_owner))
  returning * into v_pin;
  update public.tasks set source_pinned_task_id = v_pin.id
    where id = v_task.id and user_id = v_owner;
  return next v_pin;
end;
$$;

-- A unique source/date key arbitrates simultaneous tabs on the database. The
-- second statement reads the winning rows even after ON CONFLICT waited for a
-- concurrent transaction. Existing completion, title, subject and order survive.
create function public.materialize_pinned_tasks(p_user_id uuid, p_due_date date)
returns setof public.tasks
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or p_user_id is distinct from v_owner then
    raise exception 'User does not match the caller' using errcode = '42501';
  end if;
  if p_due_date is null then
    raise exception 'A calendar date is required' using errcode = '22004';
  end if;
  insert into public.tasks (user_id, title, subject_id, due_date, status, position, source_pinned_task_id)
  select v_owner, pin.title, pin.subject_id, p_due_date, 'todo',
    coalesce((select max(task.position) from public.tasks as task
      where task.user_id = v_owner and task.due_date = p_due_date), -1)
      + row_number() over (order by pin.position nulls last, pin.id),
    pin.id
  from public.pinned_tasks as pin
  where pin.user_id = v_owner
  order by pin.position nulls last, pin.id
  on conflict (source_pinned_task_id, due_date) do nothing;

  return query select task.* from public.tasks as task
    where task.user_id = v_owner and task.due_date = p_due_date
      and task.source_pinned_task_id is not null
    order by task.position, task.created_at, task.id;
end;
$$;

-- Editing a daily occurrence and its reusable template is one transaction.
-- Historic daily occurrences and saved sessions retain their original values.
create function public.update_daily_task_with_pin(p_task_id uuid, p_title text, p_subject_id uuid)
returns setof public.tasks
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_task public.tasks%rowtype;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'A task title is required' using errcode = '22023';
  end if;
  select * into v_task from public.tasks
    where id = p_task_id and user_id = v_owner for update;
  if not found then
    raise exception 'Task does not belong to the caller' using errcode = '42501';
  end if;
  update public.tasks set title = btrim(p_title), subject_id = p_subject_id
    where id = v_task.id and user_id = v_owner;
  if v_task.source_pinned_task_id is not null then
    update public.pinned_tasks set title = btrim(p_title), subject_id = p_subject_id
      where id = v_task.source_pinned_task_id and user_id = v_owner;
  end if;
  return query select * from public.tasks where id = v_task.id and user_id = v_owner;
end;
$$;

revoke execute on function public.pin_daily_task(uuid),
  public.materialize_pinned_tasks(uuid, date),
  public.update_daily_task_with_pin(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.pin_daily_task(uuid),
  public.materialize_pinned_tasks(uuid, date),
  public.update_daily_task_with_pin(uuid, text, uuid) to authenticated;
grant select, insert, update, delete on public.pinned_tasks to authenticated;

-- Refresh other tabs after pin/unpin; existing task links are cleared by the FK.
alter table public.pinned_tasks replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pinned_tasks') then
    alter publication supabase_realtime add table public.pinned_tasks;
  end if;
end;
$$;
