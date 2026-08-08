-- Forward-only migration.
--
-- 닫는 취약점 (study_sessions 중복 삽입 + 통계 조작):
--   1. 클라이언트 outbox 재시도가 "SELECT로 존재 확인 후 INSERT"(check-then-insert)
--      방식이라, 서버가 INSERT를 커밋했지만 응답만 유실된 경우나 여러 탭이 같은
--      draft를 동시에 복구하는 경우(TOCTOU) 같은 학습 기록이 중복 저장된다.
--      session_batch_id에는 비유일 인덱스만 있어 DB가 중복을 막지 못한다.
--   2. 인증 사용자는 PostgREST로 study_sessions에 직접 INSERT/UPDATE할 수 있고
--      duration/mode/created_at에 아무 제약이 없어(음수, 수백 년, 임의 mode)
--      친구/그룹/관리자 통계(sum(duration))를 마음대로 부풀릴 수 있다.
--      UPDATE 정책에는 WITH CHECK도 없다.
--
-- 수정 전략 (defense in depth):
--   1. 기록 전용 SECURITY DEFINER RPC record_study_session_batch를 추가한다.
--      소유자는 auth.uid()로만 결정하고, batch 전체 검증과 segment INSERT를
--      한 트랜잭션으로 처리하며, 하나라도 유효하지 않으면 전부 롤백한다.
--   2. DB 수준 멱등성: private.study_session_batches 멱등성 테이블
--      (PK (user_id, batch_id) + canonical payload 저장)과
--      study_sessions(user_id, session_batch_id, segment_index) 부분 유니크
--      인덱스의 2중 방어. 같은 키+같은 payload 재호출은 already_processed,
--      같은 키+다른 payload는 명시적 충돌(23505), 동시 최초 호출은 정확히
--      한 번만 저장된다.
--   3. 브라우저 롤(anon/authenticated)의 study_sessions 직접 INSERT와
--      민감 열 UPDATE를 GRANT/정책 양쪽에서 폐기한다. HistoryList의 task 메모
--      수정은 column-level GRANT(task)와 WITH CHECK 있는 UPDATE 정책으로,
--      자기 기록 삭제는 기존 DELETE 정책 그대로 유지한다.
--   4. 신규 행 형태는 CHECK 제약으로 고정한다(과거 데이터는 segment_index가
--      NULL이므로 제약을 즉시 VALID로 추가해도 통과한다).
--
-- created_at의 의미(= interval 종료 시각, 05:00 공부일 경계 분할의 기준)는
-- 유지하고, 서버 수신 시각은 새 열 recorded_at에 별도로 보존한다.
--
-- service_role은 건드리지 않는다: account-delete/account-reset 서버 라우트가
-- service key로 study_sessions를 정리한다.

-- 0. private 스키마는 20260807001129에서 만들었지만 방어적으로 보장한다. ------

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

-- 1. study_sessions 스키마 확장. -----------------------------------------------

alter table public.study_sessions
  add column if not exists segment_index integer;

-- 서버 수신 시각. created_at(클라이언트가 계산한 interval 종료 시각, 통계 기준)
-- 과 달리 이 열은 항상 서버 시계로 기록되어 시각 신뢰 경계를 제공한다.
-- 기본값 없이 추가해 기존 행은 NULL(수신 시각 미상)로 남기고 테이블 재작성을
-- 피한다. 향후 행의 기본값은 별도로 지정한다(RPC는 명시적으로 now()를 넣는다).
alter table public.study_sessions
  add column if not exists recorded_at timestamptz;
alter table public.study_sessions
  alter column recorded_at set default now();

-- 신규(RPC 경유) 행의 형태 고정. RPC만 segment_index를 기록하므로
-- segment_index IS NULL인 과거 행은 모두 통과한다 → 즉시 VALID로 추가 가능.
alter table public.study_sessions
  drop constraint if exists study_sessions_rpc_row_shape_chk;
alter table public.study_sessions
  add constraint study_sessions_rpc_row_shape_chk check (
    segment_index is null
    or (
      segment_index >= 0
      and session_batch_id is not null
      and user_id is not null
      and duration is not null
      and duration >= 10
      and duration < 86400
      and mode in ('pomo', 'stopwatch')
    )
  );

-- task 길이 상한. 과거 데이터에 200자 초과 task가 존재할 수 있어 NOT VALID로
-- 추가한다(신규 INSERT/UPDATE부터 강제). 위반 데이터 탐지 SQL:
--   select id, char_length(task) from public.study_sessions
--   where task is not null and char_length(task) > 200;
-- 위반이 없음을 확인한 뒤 후속 절차로 검증한다:
--   alter table public.study_sessions
--     validate constraint study_sessions_task_length_chk;
alter table public.study_sessions
  drop constraint if exists study_sessions_task_length_chk;
alter table public.study_sessions
  add constraint study_sessions_task_length_chk
  check (task is null or char_length(task) <= 200)
  not valid;

-- segment 수준 멱등성 백스톱: 같은 batch의 같은 segment는 물리적으로 한 번만
-- 존재할 수 있다. 과거 행은 segment_index가 NULL이라 제외된다.
create unique index if not exists study_sessions_user_batch_segment_key
  on public.study_sessions (user_id, session_batch_id, segment_index)
  where session_batch_id is not null and segment_index is not null;

-- 2. batch 수준 멱등성 테이블. --------------------------------------------------
-- private 스키마에 두어 Data API(PostgREST)에서 아예 노출되지 않는다.

create table if not exists private.study_session_batches (
  user_id uuid not null references auth.users (id) on delete cascade,
  batch_id uuid not null,
  -- canonical payload 원본(멱등성 비교 기준). 해시 대신 원본을 저장해
  -- pgcrypto 의존 없이 정확한 비교와 사후 진단이 가능하다.
  payload jsonb not null,
  segment_count integer not null,
  total_seconds bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);

revoke all privileges on table private.study_session_batches
  from public, anon, authenticated, service_role;

-- 백필: 기존 batch를 멱등성 테이블에 등록한다. 배포 시점에 localStorage에
-- 남아 있던 "이미 서버에 저장됐지만 draft가 지워지지 않은" outbox draft가
-- 새 RPC로 재전송될 때 already_processed로 수렴하게 만들기 위함이다.
-- payload는 RPC와 동일한 canonical 형식으로 구성한다.
insert into private.study_session_batches
  (user_id, batch_id, payload, segment_count, total_seconds, created_at)
select
  ss.user_id,
  ss.session_batch_id,
  jsonb_build_object(
    'mode', min(ss.mode),
    'task', min(ss.task),
    'task_id', min(ss.task_id::text)::uuid,
    'segments', jsonb_agg(
      jsonb_build_object(
        'index', ss.rn - 1,
        'duration', ss.duration,
        'ended_at',
          to_char(ss.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      order by ss.rn
    )
  ),
  count(*)::integer,
  coalesce(sum(ss.duration), 0)::bigint,
  min(ss.created_at)
from (
  select
    s.*,
    row_number() over (
      partition by s.user_id, s.session_batch_id
      order by s.created_at, s.id
    ) as rn
  from public.study_sessions as s
  where s.session_batch_id is not null
    and s.user_id is not null
) as ss
group by ss.user_id, ss.session_batch_id
on conflict (user_id, batch_id) do nothing;

-- 3. 기록 전용 트랜잭션 RPC. ----------------------------------------------------

create or replace function public.record_study_session_batch(
  p_batch_id uuid,
  p_mode text,
  p_task text,
  p_task_id uuid,
  p_segments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 검증 한계값과 근거:
  --   c_min_segment_seconds  : 기존 클라이언트 계약(10초 미만 저장 안 함).
  --   c_max_segment_seconds  : segment는 05:00 공부일 경계에서 분할되므로
  --                            24시간(86400초) 미만이어야 한다.
  --   c_max_segments         : 정상 세션은 분할+일시정지를 합쳐도 한 자릿수다.
  --                            여유를 크게 둔 상한(비정상 payload 차단용).
  --   c_max_batch_total      : 스톱워치를 며칠씩 방치하는 극단 사용까지 허용하는
  --                            7일 상한. 그 이상은 정상 사용으로 볼 수 없다.
  --   c_future_skew          : 클라이언트 시계 오차 허용치. created_at은 통계의
  --                            기준 시각이므로 서버 기준 15분 이상 미래는 거부.
  --   c_past_recovery_window : outbox draft는 장기간 보존될 수 있어(제품 요구:
  --                            복구를 임의로 포기하지 않는다) 400일까지 과거
  --                            기록 복구를 허용한다. 그보다 오래된 payload는
  --                            복구가 아니라 조작으로 본다.
  --   c_task_max_length      : task 메모 상한. 초과분은 자르지 않고 거부한다.
  --   c_overlap_tolerance    : duration이 초 단위 반올림이라 segment 경계 비교에
  --                            ±0.5초씩 오차가 생길 수 있어 2초의 여유를 둔다.
  c_min_segment_seconds constant bigint := 10;
  c_max_segment_seconds constant bigint := 86399;
  c_max_segments constant integer := 64;
  c_max_batch_total constant bigint := 604800;
  c_future_skew constant interval := interval '15 minutes';
  c_past_recovery_window constant interval := interval '400 days';
  c_task_max_length constant integer := 200;
  c_overlap_tolerance constant interval := interval '2 seconds';

  v_caller_id uuid := auth.uid();
  v_now timestamptz := now();
  v_task text;
  v_effective_task_id uuid;
  v_segment_count integer;
  v_total_seconds bigint := 0;
  v_durations bigint[] := array[]::bigint[];
  v_ended_ats timestamptz[] := array[]::timestamptz[];
  v_canonical_segments jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_existing private.study_session_batches%rowtype;
  v_elem jsonb;
  v_index numeric;
  v_duration_num numeric;
  v_duration bigint;
  v_ended_at timestamptz;
  v_prev_ended_at timestamptz;
  i integer;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_batch_id is null then
    raise exception 'session_batch_id is required' using errcode = '22023';
  end if;

  if p_mode is null or p_mode not in ('pomo', 'stopwatch') then
    raise exception 'mode must be pomo or stopwatch' using errcode = '22023';
  end if;

  -- task는 trim 후 빈 문자열을 NULL로 정규화하고, 초과 길이는 거부한다.
  v_task := nullif(btrim(coalesce(p_task, '')), '');
  if v_task is not null and char_length(v_task) > c_task_max_length then
    raise exception 'task must be at most % characters', c_task_max_length
      using errcode = '22023';
  end if;

  if p_segments is null or jsonb_typeof(p_segments) <> 'array' then
    raise exception 'segments must be a json array' using errcode = '22023';
  end if;

  v_segment_count := jsonb_array_length(p_segments);
  if v_segment_count < 1 or v_segment_count > c_max_segments then
    raise exception 'segment count must be between 1 and %', c_max_segments
      using errcode = '22023';
  end if;

  -- 결정적(시각과 무관한) 검증 + canonical payload 구성.
  -- 같은 payload는 언제 재전송돼도 같은 canonical 형태가 되어야
  -- 멱등성 비교가 안정적으로 동작한다.
  for i in 0 .. v_segment_count - 1 loop
    v_elem := p_segments -> i;

    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'segment % must be an object', i using errcode = '22023';
    end if;

    if jsonb_typeof(v_elem -> 'index') <> 'number'
      or jsonb_typeof(v_elem -> 'duration') <> 'number'
      or jsonb_typeof(v_elem -> 'ended_at') <> 'string' then
      raise exception 'segment % must carry numeric index/duration and ended_at', i
        using errcode = '22023';
    end if;

    v_index := (v_elem ->> 'index')::numeric;
    if v_index <> i then
      raise exception 'segment indexes must be contiguous starting at 0'
        using errcode = '22023';
    end if;

    v_duration_num := (v_elem ->> 'duration')::numeric;
    if v_duration_num <> floor(v_duration_num) then
      raise exception 'segment duration must be an integer number of seconds'
        using errcode = '22023';
    end if;
    if v_duration_num < c_min_segment_seconds
      or v_duration_num > c_max_segment_seconds then
      raise exception 'segment duration must be between % and % seconds',
        c_min_segment_seconds, c_max_segment_seconds
        using errcode = '22023';
    end if;
    v_duration := v_duration_num::bigint;

    begin
      v_ended_at := (v_elem ->> 'ended_at')::timestamptz;
    exception
      when others then
        raise exception 'segment ended_at must be a valid timestamp'
          using errcode = '22023';
    end;

    -- segment는 시간순으로 정렬되어야 하고 서로 겹칠 수 없다.
    -- 시작 시각은 ended_at - duration으로 유도한다(초 단위 반올림 오차 허용).
    if v_prev_ended_at is not null then
      if v_ended_at <= v_prev_ended_at then
        raise exception 'segments must be strictly ordered by ended_at'
          using errcode = '22023';
      end if;
      if v_ended_at - make_interval(secs => v_duration)
        < v_prev_ended_at - c_overlap_tolerance then
        raise exception 'segments must not overlap' using errcode = '22023';
      end if;
    end if;
    v_prev_ended_at := v_ended_at;

    v_total_seconds := v_total_seconds + v_duration;
    v_durations := v_durations || v_duration;
    v_ended_ats := v_ended_ats || v_ended_at;
    v_canonical_segments := v_canonical_segments || jsonb_build_array(
      jsonb_build_object(
        'index', i,
        'duration', v_duration,
        'ended_at',
          to_char(v_ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
  end loop;

  if v_total_seconds > c_max_batch_total then
    raise exception 'batch total duration must be at most % seconds', c_max_batch_total
      using errcode = '22023';
  end if;

  -- canonical payload. task_id는 제출값 그대로 기록한다(소유 검증 결과로
  -- 치환하면 task 삭제 이후의 재시도가 already_processed로 수렴하지 못한다).
  v_payload := jsonb_build_object(
    'mode', p_mode,
    'task', v_task,
    'task_id', p_task_id,
    'segments', v_canonical_segments
  );

  -- batch 수준 멱등성. 동시 최초 호출이 경합하면 유니크 인덱스 대기로
  -- 직렬화되고, 패자는 승자가 커밋한 행을 다음 문장의 새 스냅샷에서 본다.
  insert into private.study_session_batches
    (user_id, batch_id, payload, segment_count, total_seconds)
  values
    (v_caller_id, p_batch_id, v_payload, v_segment_count, v_total_seconds)
  on conflict (user_id, batch_id) do nothing;

  if not found then
    select b.* into v_existing
    from private.study_session_batches as b
    where b.user_id = v_caller_id
      and b.batch_id = p_batch_id;

    if v_existing.batch_id is null then
      -- 경합 승자가 롤백한 극히 드문 창: 재시도 가능 오류로 알린다.
      raise exception 'concurrent recording of this batch was rolled back; retry'
        using errcode = '40001';
    end if;

    if v_existing.payload = v_payload then
      -- 같은 키 + 같은 payload = 같은 성공 결과. 행 추가 없음.
      return jsonb_build_object(
        'status', 'already_processed',
        'total_seconds', v_existing.total_seconds,
        'segment_count', v_existing.segment_count
      );
    end if;

    -- 같은 키 + 다른 payload = 명시적 충돌. 기존 기록은 바뀌지 않는다.
    raise exception
      'study_session_batch_conflict: batch % was already recorded with a different payload',
      p_batch_id
      using errcode = '23505';
  end if;

  -- 이하 검증은 신규 batch에만 적용한다. (시각 창처럼 시간이 지나면 결과가
  -- 달라지는 검사를 멱등성 판정 앞에 두면, 이미 커밋된 batch의 늦은 재시도가
  -- already_processed 대신 오류를 받게 된다.)

  -- created_at(= interval 종료 시각)의 신뢰 창.
  for i in 1 .. v_segment_count loop
    if v_ended_ats[i] > v_now + c_future_skew then
      raise exception 'segment ended_at is too far in the future'
        using errcode = '22023';
    end if;
    if v_ended_ats[i] < v_now - c_past_recovery_window then
      raise exception 'segment ended_at is too far in the past'
        using errcode = '22023';
    end if;
  end loop;

  -- task_id 소유 검증: 타인 소유 task는 거부한다. 존재하지 않는 task_id는
  -- (outbox draft 보관 중 task가 삭제된 정상 경로가 있으므로) 연결만 끊고
  -- 기록 자체는 보존한다.
  if p_task_id is not null then
    if exists (
      select 1
      from public.tasks as t
      where t.id = p_task_id
        and t.user_id = v_caller_id
    ) then
      v_effective_task_id := p_task_id;
    elsif exists (
      select 1
      from public.tasks as t
      where t.id = p_task_id
    ) then
      raise exception 'task_id does not belong to the caller'
        using errcode = '42501';
    else
      v_effective_task_id := null;
    end if;
  end if;

  -- 모든 segment를 한 트랜잭션에서 INSERT. 소유자는 auth.uid()로만 결정되고,
  -- recorded_at은 서버 시계로만 기록된다. 위 검증 중 하나라도 실패하면 함수
  -- 전체가 예외로 중단되어 batch 행을 포함한 모든 변경이 롤백된다.
  for i in 1 .. v_segment_count loop
    insert into public.study_sessions
      (user_id, mode, duration, task, task_id,
       created_at, recorded_at, session_batch_id, segment_index)
    values
      (v_caller_id, p_mode, v_durations[i], v_task, v_effective_task_id,
       v_ended_ats[i], v_now, p_batch_id, i - 1);
  end loop;

  return jsonb_build_object(
    'status', 'saved',
    'total_seconds', v_total_seconds,
    'segment_count', v_segment_count
  );
end;
$$;

revoke execute on function public.record_study_session_batch(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_study_session_batch(uuid, text, text, uuid, jsonb)
  to authenticated;

-- 4. 브라우저 롤의 직접 쓰기 표면 봉쇄. -----------------------------------------

-- INSERT는 전면 폐기: 신규 기록은 RPC만 가능하다.
revoke insert on public.study_sessions from public, anon, authenticated;
revoke insert (
  id,
  created_at,
  duration,
  mode,
  user_id,
  task,
  task_id,
  group_id,
  session_batch_id,
  segment_index,
  recorded_at
) on public.study_sessions from public, anon, authenticated;

-- UPDATE는 task 메모 한 열만 허용(HistoryList의 작업 메모 수정 UX 유지).
-- duration/created_at/mode/user_id/session_batch_id/segment_index 등 통계에
-- 영향을 주는 열은 직접 수정이 불가능해진다.
revoke update on public.study_sessions from public, anon, authenticated;
revoke update (
  id,
  created_at,
  duration,
  mode,
  user_id,
  task,
  task_id,
  group_id,
  session_batch_id,
  segment_index,
  recorded_at
) on public.study_sessions from public, anon, authenticated;

grant update (task) on public.study_sessions to authenticated;

-- anon은 정책상 아무 행에도 닿을 수 없지만 GRANT 표면도 함께 좁힌다.
revoke delete on public.study_sessions from anon;

-- 자기 기록 삭제 UX는 유지: authenticated DELETE GRANT와 기존 DELETE 정책은
-- 건드리지 않는다.

drop policy if exists "Users can insert their own study sessions" on public.study_sessions;

-- 기존 UPDATE 정책에는 WITH CHECK가 없어 (column-level GRANT가 없다면)
-- user_id를 타인으로 바꿔치기할 수 있었다. WITH CHECK를 갖춘 정책으로 교체한다.
drop policy if exists "Users can update their own study sessions" on public.study_sessions;
create policy "Users can update their own study sessions"
on public.study_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 벨트와 멜빵: 수동 부트스트랩 이력과 무관하게 INSERT/ALL 쓰기 정책이
-- 하나도 남지 않음을 보장한다. (SELECT/UPDATE/DELETE 정책은 유지.)
do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'study_sessions'
      and p.cmd in ('INSERT', 'ALL')
  loop
    execute format(
      'drop policy if exists %I on public.study_sessions',
      v_policy.policyname
    );
  end loop;
end;
$$;
