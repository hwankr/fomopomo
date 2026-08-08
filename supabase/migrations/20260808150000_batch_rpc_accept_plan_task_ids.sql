-- Forward-only migration.
--
-- 닫는 버그 (weekly/monthly plan의 task_id 유실):
--   타이머의 TaskSidebar는 daily(tasks)뿐 아니라 weekly_plans/monthly_plans의
--   행도 작업으로 선택할 수 있고, 그 id가 record_study_session_batch의
--   p_task_id로 전달된다. 그런데 20260808130000의 소유 검증은 public.tasks만
--   조회하므로 weekly/monthly plan id는 "존재하지 않는 task" 분기로 빠져
--   task_id가 조용히 NULL로 저장된다. 그 결과 계획 페이지의 주간/월간 작업별
--   누적 시간(study_sessions를 task_id로 합산)이 항상 0으로 보인다.
--
-- 수정:
--   task_id 소유 검증을 tasks / weekly_plans / monthly_plans 3개 테이블로
--   확장한다. 분기 계약은 그대로 유지한다:
--     - 셋 중 어디든 내 소유 행이면 유지
--     - 어디든 존재하지만 타인 소유면 42501 거부
--     - 어디에도 없으면 NULL (outbox draft 보관 중 작업이 삭제된 정상 경로:
--       연결만 끊고 기록은 보존한다)
--   함수 본문의 나머지와 시그니처는 20260808130000과 동일하다.

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

  -- task_id 소유 검증: 타이머는 daily(tasks) 외에 weekly_plans/monthly_plans의
  -- 행도 작업으로 선택할 수 있으므로 세 테이블 모두에서 소유를 확인한다.
  -- 타인 소유는 거부하고, 어디에도 존재하지 않는 task_id는 (outbox draft 보관
  -- 중 작업이 삭제된 정상 경로가 있으므로) 연결만 끊고 기록 자체는 보존한다.
  if p_task_id is not null then
    if exists (
      select 1
      from public.tasks as t
      where t.id = p_task_id
        and t.user_id = v_caller_id
    ) or exists (
      select 1
      from public.weekly_plans as w
      where w.id = p_task_id
        and w.user_id = v_caller_id
    ) or exists (
      select 1
      from public.monthly_plans as m
      where m.id = p_task_id
        and m.user_id = v_caller_id
    ) then
      v_effective_task_id := p_task_id;
    elsif exists (
      select 1
      from public.tasks as t
      where t.id = p_task_id
    ) or exists (
      select 1
      from public.weekly_plans as w
      where w.id = p_task_id
    ) or exists (
      select 1
      from public.monthly_plans as m
      where m.id = p_task_id
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
