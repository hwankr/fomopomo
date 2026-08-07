-- 그룹 삭제가 클라이언트에서 두 번의 요청(멤버십 삭제 → 그룹 삭제)으로 수행되어,
-- 두 번째 요청이 실패하면 멤버가 모두 사라진 "유령 그룹"이 남는 문제를 수정한다.
-- delete_group RPC가 리더 검증과 그룹 삭제를 단일 트랜잭션으로 처리하고,
-- 멤버십은 group_members.group_id의 ON DELETE CASCADE로 함께 삭제된다.

-- group_members.group_id -> groups FK에 ON DELETE CASCADE가 없는 경우에만 보정한다.
do $$
declare
  v_fk record;
begin
  select c.conname, c.confdeltype
  into v_fk
  from pg_constraint as c
  join pg_attribute as a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
  where c.conrelid = 'public.group_members'::regclass
    and c.confrelid = 'public.groups'::regclass
    and c.contype = 'f'
    and a.attname = 'group_id'
  limit 1;

  if v_fk.conname is null then
    alter table public.group_members
      add constraint group_members_group_id_fkey
      foreign key (group_id)
      references public.groups (id)
      on delete cascade;
  elsif v_fk.confdeltype <> 'c' then
    execute format(
      'alter table public.group_members drop constraint %I',
      v_fk.conname
    );
    execute format(
      'alter table public.group_members
         add constraint %I
         foreign key (group_id)
         references public.groups (id)
         on delete cascade',
      v_fk.conname
    );
  end if;
end;
$$;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.groups as g
  where g.id = p_group_id
    and g.leader_id = v_user_id
  returning g.id
  into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Only the group leader can delete this group'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.delete_group(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_group(uuid) to authenticated;
