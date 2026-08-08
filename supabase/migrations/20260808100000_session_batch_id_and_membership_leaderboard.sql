-- 그룹 리더보드 0 집계 수정
--
-- 버그: 클라이언트는 study_sessions.group_id에 소셜 그룹 ID가 아니라 "저장 배치 ID"
-- (저장 1회당 랜덤 UUID, outbox 멱등성 키 겸용)를 기록해 왔다. 그래서
-- get_group_study_time_v3의 ss.group_id = p_group_id 조인은 절대 매치되지 않고
-- 그룹 상세 페이지의 멤버별 공부시간이 전부 0으로 나온다.
--
-- 수정:
--   1) 배치 ID를 전용 컬럼 session_batch_id로 옮긴다(기존 데이터 백필 포함).
--   2) 리더보드는 "그룹 멤버 전원의 기간 내 총 공부시간" 멤버십 기준 집계로 교체한다.
--      세션은 특정 그룹에 귀속되지 않는다는 제품 의미에 부합한다.

alter table public.study_sessions
  add column if not exists session_batch_id uuid;

-- 백필: 현행 클라이언트는 항상 배치 UUID를 group_id에 썼으므로 그대로 옮겨도 안전하다.
update public.study_sessions
set session_batch_id = group_id
where session_batch_id is null
  and group_id is not null;

-- outbox 복구가 배치 ID로 서버 존재 여부를 확인(멱등성 체크)할 때 쓰는 조회 경로.
create index if not exists study_sessions_session_batch_id_idx
  on public.study_sessions (session_batch_id);

-- 반환형 변경(integer -> bigint, 긴 기간 합산 시 integer 오버플로 예방)은
-- create or replace로 불가능하므로 drop 후 재생성한다.
-- 시그니처(인자)는 동일해서 구버전 클라이언트 호출도 그대로 동작한다
-- (bigint는 JSON number로 직렬화되므로 클라이언트 타입 변화 없음).
drop function if exists public.get_group_study_time_v3(uuid, timestamptz, timestamptz);

create function public.get_group_study_time_v3(
  p_group_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  user_id uuid,
  total_seconds bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_start_time is null
    or p_end_time is null
    or p_start_time >= p_end_time then
    raise exception 'Invalid time range' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.group_members as gm
    where gm.group_id = p_group_id
      and gm.user_id = v_caller_id
  ) then
    raise exception 'Group membership required' using errcode = '42501';
  end if;

  -- 멤버십 기준 집계: 그룹 멤버가 기간 내에 기록한 모든 세션을 합산한다.
  return query
  select
    gm.user_id,
    coalesce(sum(ss.duration), 0)::bigint as total_seconds
  from public.group_members as gm
  left join public.study_sessions as ss
    on ss.user_id = gm.user_id
   and ss.created_at >= p_start_time
   and ss.created_at <= p_end_time
  where gm.group_id = p_group_id
  group by gm.user_id;
end;
$$;

revoke execute on function public.get_group_study_time_v3(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_group_study_time_v3(uuid, timestamptz, timestamptz) to authenticated;
