-- get_friends_study_time을 timestamptz 절대 범위 시그니처로 교체
--
-- 버그: 기존 text(날짜) 버전은 ss.created_at::date = p_date 비교라서 UTC 달력일
-- 기준으로 집계했다. 앱의 공부일 정의(기기 로컬 05:00 경계)와도, KST와도 다른
-- 기준이라 친구 위젯의 "오늘 공부시간"이 실제와 어긋난다.
--
-- 수정: 경계 계산은 전적으로 클라이언트(lib/dateUtils.ts)가 수행하고, 서버는
-- timestamptz 절대 범위만 받아 날짜 캐스트 없이 집계한다.
--
-- 주의: Postgres에서 인자 타입이 다른 함수는 오버로드로 남는다. 기존
-- (uuid, text) 시그니처를 명시적으로 drop한 뒤, 마이그레이션 → 클라이언트 배포
-- 사이 구간의 구버전 클라이언트를 위해 같은 시그니처를 "새 로직을 호출하는
-- 호환 래퍼"로 재생성한다(기존 UTC 달력일 기준을 절대 범위로 변환해 위임).
-- 신 클라이언트 배포가 완전히 끝나면 래퍼는 후속 마이그레이션에서 제거해도 된다.

drop function if exists public.get_friends_study_time(uuid, text);
drop function if exists public.get_friends_study_time(uuid, timestamptz, timestamptz);

create function public.get_friends_study_time(
  p_user_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  friend_id uuid,
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

  if p_user_id is distinct from v_caller_id then
    raise exception 'Not authorized to read another user''s friend stats'
      using errcode = '42501';
  end if;

  if p_start_time is null
    or p_end_time is null
    or p_start_time >= p_end_time then
    raise exception 'Invalid time range' using errcode = '22023';
  end if;

  return query
  select
    f.friend_id,
    coalesce(sum(ss.duration), 0)::bigint as total_seconds
  from public.friendships as f
  left join public.study_sessions as ss
    on ss.user_id = f.friend_id
   and ss.created_at >= p_start_time
   and ss.created_at <= p_end_time
  where f.user_id = v_caller_id
  group by f.friend_id;
end;
$$;

revoke execute on function public.get_friends_study_time(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_friends_study_time(uuid, timestamptz, timestamptz) to authenticated;

-- 구버전 클라이언트용 호환 래퍼: 이전 구현과 동일한 UTC 달력일 [00:00, 24:00)
-- 을 절대 범위로 변환해 새 함수에 위임한다. 인증·범위 검사는 새 함수 안에서
-- 수행된다. (반환형 integer -> bigint 변경은 JSON 직렬화상 동일한 number라서
-- 구버전 클라이언트에 영향이 없다.)
create function public.get_friends_study_time(p_user_id uuid, p_date text)
returns table (
  friend_id uuid,
  total_seconds bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_date::date)::timestamp at time zone 'UTC';
begin
  return query
  select *
  from public.get_friends_study_time(
    p_user_id,
    v_start,
    v_start + interval '1 day' - interval '1 millisecond'
  );
end;
$$;

revoke execute on function public.get_friends_study_time(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.get_friends_study_time(uuid, text) to authenticated;
