import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const sessionsLteMock = vi.fn();
  const sessionsGteMock = vi.fn(() => ({ lte: sessionsLteMock }));
  const updateEqMock = vi.fn();
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));
  const fromMock = vi.fn((table: string) => {
    if (table === 'friendships') {
      return { select: () => ({ eq: () => ({ order: orderMock }) }), update: updateMock };
    }
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) };
    }
    if (table === 'study_sessions') {
      return { select: () => ({ eq: () => ({ gte: sessionsGteMock }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  const rpcMock = vi.fn();
  const subscribeMock = vi.fn((callback?: (status: string) => void) => {
    callback?.('SUBSCRIBED');
    return {};
  });
  const onMock = vi.fn(function on() {
    return { on: onMock, subscribe: subscribeMock };
  });
  const channelMock = vi.fn(() => ({ on: onMock, subscribe: subscribeMock }));

  return {
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
    },
    supabaseMock: {
      from: fromMock,
      rpc: rpcMock,
      channel: channelMock,
      removeChannel: vi.fn(),
      __mocks: {
        orderMock,
        maybeSingleMock,
        sessionsGteMock,
        sessionsLteMock,
        updateMock,
        updateEqMock,
        fromMock,
        rpcMock,
        channelMock,
        onMock,
        subscribeMock,
      },
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
  toast: toastMock,
}));

vi.mock('../MemberReportModal', () => ({
  default: ({ isOpen, userId, userName }: { isOpen: boolean; userId: string; userName: string }) =>
    isOpen ? <div role="dialog" aria-label={`${userName} 리포트`}>{userId}</div> : null,
}));

import FriendList from '../friends/FriendList';

const session = {
  user: {
    id: 'user-1',
    email: 'me@example.com',
    user_metadata: { nickname: '민지' },
  },
};

type ChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type StudyTimeParams = { p_user_id: string; p_start_time: string; p_end_time: string; p_date?: string };

function getChangeListener(table: string) {
  const calls = supabaseMock.__mocks.onMock.mock.calls as unknown as Array<[
    string,
    { table: string },
    (payload: ChangePayload) => void,
  ]>;
  const call = calls.filter(([, filter]) => filter.table === table).at(-1);
  expect(call, `subscription for ${table}`).toBeDefined();
  return call![2];
}

const studyTimeResponse = (seconds: number, friendId = 'friend-1') => ({
  data: [{ friend_id: friendId, total_seconds: seconds }],
  error: null,
});

// 오늘(24시간) 범위인지 이번 주(7일) 범위인지 길이로 가른다.
const isWeekRange = (params: StudyTimeParams) =>
  new Date(params.p_end_time).getTime() - new Date(params.p_start_time).getTime() > 2 * 24 * 60 * 60 * 1000;

type StudyTimeReply = ReturnType<typeof studyTimeResponse> | Promise<ReturnType<typeof studyTimeResponse>>;

// get_friends_study_time 응답: today/week 각각 값 또는 호출마다 다른 값을 돌려주는 함수.
function mockStudyTimes(today: number | (() => StudyTimeReply), week: number | (() => StudyTimeReply) = 3600) {
  supabaseMock.__mocks.rpcMock.mockImplementation((fnName: string, params: StudyTimeParams) => {
    if (fnName !== 'get_friends_study_time') return Promise.resolve({ data: null, error: null });
    const reply = isWeekRange(params) ? week : today;
    return Promise.resolve(typeof reply === 'function' ? reply() : studyTimeResponse(reply));
  });
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

function getRankingRow(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^순위 \\d+.*${name}`) });
}

function rankingNames() {
  return screen
    .getAllByRole('button', { name: /^순위 \d+/ })
    .map((row) => row.querySelector('.truncate')?.textContent);
}

async function renderStudyingFriend() {
  setupFriendshipResponse({
    status: 'studying',
    current_task: 'Reading',
    last_active_at: '2026-03-18T00:00:00.000Z',
    // 막 시작한 공부라 실시간 시간은 아직 1분이 안 된다.
    study_start_time: new Date().toISOString(),
    total_stopwatch_time: 0,
  });
  mockStudyTimes(600);
  const result = render(<FriendList session={session as never} refreshTrigger={0} />);
  await waitFor(() => {
    expect(getRankingRow('Buddy')).toHaveAccessibleName(/오늘 0:10/);
  });
  return result;
}

function setupFriendshipResponse(friend: unknown, extra: Array<Record<string, unknown>> = []) {
  const {
    orderMock,
    maybeSingleMock,
    sessionsLteMock,
    updateEqMock,
    fromMock,
    channelMock,
    onMock,
    subscribeMock,
  } = supabaseMock.__mocks;

  orderMock.mockResolvedValue({
    data: [
      {
        id: 'friendship-1',
        friend_email: 'friend@example.com',
        friend_id: 'friend-1',
        nickname: 'Buddy',
        created_at: '2026-03-18T00:00:00.000Z',
        is_notification_enabled: true,
        friend,
      },
      ...extra,
    ],
    error: null,
  });
  maybeSingleMock.mockResolvedValue({
    data: { status: 'offline', current_task: null, last_active_at: null, study_start_time: null, total_stopwatch_time: 0 },
    error: null,
  });
  sessionsLteMock.mockResolvedValue({ data: [], error: null });
  updateEqMock.mockResolvedValue({ error: null });
  mockStudyTimes(0, 0);

  fromMock.mockClear();
  channelMock.mockClear();
  onMock.mockClear();
  subscribeMock.mockClear();
}

const onlineFriend = {
  status: 'online',
  current_task: null,
  last_active_at: '2026-03-18T00:00:00.000Z',
  study_start_time: null,
  total_stopwatch_time: 0,
};

describe('FriendList', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders friends when the embedded friend payload is an object', async () => {
    setupFriendshipResponse({ ...onlineFriend, current_task: 'Reading' });

    render(<FriendList session={session as never} refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    const row = getRankingRow('Buddy');
    expect(row).toHaveAccessibleName(/접속 중/);
    // 공부 중이 아니면 작업은 보이지 않는다.
    expect(row).not.toHaveAccessibleName(/Reading/);

    // 이메일과 친구가 된 날은 줄 끝의 메뉴에서 보인다.
    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    expect(await screen.findByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByText(/친구가 됐어요/)).toBeInTheDocument();
  });

  it('오늘 공부시간을 공부일(로컬 05:00) 절대 범위로 조회한다', async () => {
    setupFriendshipResponse(onlineFriend);

    render(<FriendList session={session as never} refreshTrigger={0} />);

    const { rpcMock } = supabaseMock.__mocks;
    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });

    const [fnName, params] = rpcMock.mock.calls[0] as [string, StudyTimeParams];
    expect(fnName).toBe('get_friends_study_time');
    expect(params.p_user_id).toBe('user-1');
    // 날짜 문자열(p_date)이 아니라 timestamptz 절대 범위를 전달한다.
    expect(params.p_date).toBeUndefined();

    const start = new Date(params.p_start_time);
    const end = new Date(params.p_end_time);
    expect(params.p_start_time).toBe(start.toISOString());
    expect(params.p_end_time).toBe(end.toISOString());
    // 로컬 05:00 경계에서 시작하는 24시간(-1ms) 범위다.
    expect(start.getHours()).toBe(5);
    expect(start.getMinutes()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('이번 주 공부시간은 오늘이 속한 공부주(월요일 05:00부터 7일) 범위로 조회한다', async () => {
    setupFriendshipResponse(onlineFriend);

    render(<FriendList session={session as never} refreshTrigger={0} />);

    const { rpcMock, sessionsGteMock, sessionsLteMock } = supabaseMock.__mocks;
    // 처음 불러올 때와 구독 연결 직후에 한 번씩 오늘·이번 주를 함께 조회한다.
    await waitFor(() => {
      expect(rpcMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const [todayParams, weekParams] = rpcMock.mock.calls.map(([, params]) => params as StudyTimeParams);
    const todayStart = new Date(todayParams.p_start_time);
    const weekStart = new Date(weekParams.p_start_time);
    const weekEnd = new Date(weekParams.p_end_time);
    expect(rpcMock.mock.calls[1][0]).toBe('get_friends_study_time');
    expect(weekStart.getDay()).toBe(1);
    expect(weekStart.getHours()).toBe(5);
    expect(weekStart.getTime()).toBeLessThanOrEqual(todayStart.getTime());
    expect(weekEnd.getTime()).toBeGreaterThan(todayStart.getTime());
    expect(Math.round((weekEnd.getTime() - weekStart.getTime()) / (60 * 60 * 1000))).toBe(7 * 24);

    // 내 기록도 같은 공부주 범위로 읽는다.
    expect(sessionsGteMock).toHaveBeenCalledWith('created_at', weekParams.p_start_time);
    expect(sessionsLteMock).toHaveBeenCalledWith('created_at', weekParams.p_end_time);
  });

  it('preserves array-shaped embedded friend payloads', async () => {
    setupFriendshipResponse([
      {
        status: 'paused',
        current_task: 'Review',
        last_active_at: '2026-03-18T00:00:00.000Z',
        study_start_time: null,
        total_stopwatch_time: 120,
      },
    ]);

    render(<FriendList session={session as never} refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    expect(getRankingRow('Buddy')).toHaveAccessibleName(/일시정지/);
  });

  it('ranks friends and me by today’s focus time and marks my row', async () => {
    setupFriendshipResponse(onlineFriend, [
      {
        id: 'friendship-2',
        friend_email: 'pal@example.com',
        friend_id: 'friend-2',
        nickname: null,
        created_at: '2026-03-17T00:00:00.000Z',
        is_notification_enabled: true,
        friend: { ...onlineFriend, status: 'offline' },
      },
    ]);
    supabaseMock.__mocks.rpcMock.mockImplementation((_fn: string, params: StudyTimeParams) =>
      Promise.resolve({
        data: isWeekRange(params)
          ? [{ friend_id: 'friend-1', total_seconds: 7200 }, { friend_id: 'friend-2', total_seconds: 9000 }]
          : [{ friend_id: 'friend-1', total_seconds: 600 }, { friend_id: 'friend-2', total_seconds: 2700 }],
        error: null,
      })
    );
    supabaseMock.__mocks.sessionsLteMock.mockResolvedValue({
      data: [{ duration: 1200, created_at: new Date().toISOString() }],
      error: null,
    });

    render(<FriendList session={session as never} refreshTrigger={0} />);

    await waitFor(() => {
      expect(getRankingRow('pal@example.com')).toHaveAccessibleName(/오늘 0:45/);
    });

    expect(rankingNames()).toEqual(['pal@example.com', '민지', 'Buddy']);
    const me = getRankingRow('민지');
    expect(me).toHaveAccessibleName(/순위 2/);
    expect(within(me).getByText('나')).toBeInTheDocument();
    expect(me).toHaveAccessibleName(/오늘 0:20/);
    expect(getRankingRow('Buddy')).toHaveAccessibleName(/오늘 0:10.*이번 주 2:00/);
    expect(getRankingRow('pal@example.com')).toHaveAccessibleName(/이번 주 2:30/);
    // 내 줄에는 친구 메뉴가 없다.
    expect(screen.queryByRole('button', { name: '민지 친구 메뉴' })).not.toBeInTheDocument();
  });

  it('adds live study time to saved totals while a friend is studying or paused', async () => {
    setupFriendshipResponse(
      { ...onlineFriend, status: 'studying', current_task: 'Reading', study_start_time: minutesAgo(30) },
      [
        {
          id: 'friendship-2',
          friend_email: 'pal@example.com',
          friend_id: 'friend-2',
          nickname: 'Pal',
          created_at: '2026-03-17T00:00:00.000Z',
          is_notification_enabled: true,
          friend: { ...onlineFriend, status: 'paused', current_task: 'Review', total_stopwatch_time: 120 },
        },
      ]
    );
    supabaseMock.__mocks.rpcMock.mockImplementation(() =>
      Promise.resolve({
        data: [{ friend_id: 'friend-1', total_seconds: 600 }, { friend_id: 'friend-2', total_seconds: 600 }],
        error: null,
      })
    );

    render(<FriendList session={session as never} refreshTrigger={0} />);

    // 저장 10분 + 진행 중 30분
    await waitFor(() => {
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/공부 중.*Reading.*오늘 0:40/);
    });
    // 저장 10분 + 일시정지 전까지 2분
    // 일시정지한 친구의 작업도 상태 옆에 남는다.
    expect(getRankingRow('Pal')).toHaveAccessibleName(/일시정지.*Review.*오늘 0:12/);
    expect(screen.getByText('Review')).toBeVisible();
  });

  it('refreshes the saved total when a friend finishes and records a session', async () => {
    await renderStudyingFriend();
    mockStudyTimes(900);

    await act(async () => {
      getChangeListener('profiles')({
        eventType: 'UPDATE',
        new: { id: 'friend-1', status: 'online', study_start_time: null, total_stopwatch_time: 0 },
        old: {},
      });
      getChangeListener('study_sessions')({
        eventType: 'INSERT', new: { id: 1, user_id: 'friend-1' }, old: {},
      });
    });

    await waitFor(() => {
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/접속 중/);
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/오늘 0:15/);
    });
  });

  it('updates my row from my own realtime status and sessions', async () => {
    await renderStudyingFriend();
    supabaseMock.__mocks.sessionsLteMock.mockResolvedValue({
      data: [{ duration: 1500, created_at: new Date().toISOString() }],
      error: null,
    });

    await act(async () => {
      getChangeListener('profiles')({
        eventType: 'UPDATE',
        new: { id: 'user-1', status: 'studying', current_task: '논문 읽기', study_start_time: new Date().toISOString(), total_stopwatch_time: 0 },
        old: {},
      });
      getChangeListener('study_sessions')({
        eventType: 'INSERT', new: { id: 3, user_id: 'user-1' }, old: {},
      });
    });

    await waitFor(() => {
      expect(getRankingRow('민지')).toHaveAccessibleName(/공부 중.*논문 읽기.*오늘 0:25/);
    });
  });

  it('refreshes after a session DELETE containing only its primary key', async () => {
    await renderStudyingFriend();
    mockStudyTimes(300);

    await act(async () => {
      getChangeListener('study_sessions')({ eventType: 'DELETE', new: {}, old: { id: 1 } });
    });

    await waitFor(() => {
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/오늘 0:05/);
    });
  });

  it('keeps the latest total when an older refresh finishes later', async () => {
    await renderStudyingFriend();
    let resolveOlder!: (value: ReturnType<typeof studyTimeResponse>) => void;
    const olderResponse = new Promise<ReturnType<typeof studyTimeResponse>>((resolve) => {
      resolveOlder = resolve;
    });
    let todayCalls = 0;
    mockStudyTimes(() => {
      todayCalls += 1;
      return todayCalls === 1 ? olderResponse : studyTimeResponse(1200);
    });
    const onChange = getChangeListener('study_sessions');

    await act(async () => {
      onChange({ eventType: 'INSERT', new: { id: 1, user_id: 'friend-1' }, old: {} });
      onChange({ eventType: 'INSERT', new: { id: 2, user_id: 'friend-1' }, old: {} });
    });
    await waitFor(() => {
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/오늘 0:20/);
    });

    await act(async () => { resolveOlder(studyTimeResponse(900)); });
    expect(getRankingRow('Buddy')).toHaveAccessibleName(/오늘 0:20/);
  });

  it('discards old responses and queued realtime events after an account switch', async () => {
    const { rerender } = await renderStudyingFriend();
    const oldListener = getChangeListener('study_sessions');
    let resolveOlder!: (value: ReturnType<typeof studyTimeResponse>) => void;
    const olderResponse = new Promise<ReturnType<typeof studyTimeResponse>>((resolve) => { resolveOlder = resolve; });
    mockStudyTimes(() => olderResponse);
    await act(async () => {
      oldListener({ eventType: 'INSERT', new: { id: 1, user_id: 'friend-1' }, old: {} });
    });

    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [], error: null });
    mockStudyTimes(0, 0);
    rerender(<FriendList session={{ user: { id: 'user-2' } } as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText(/아직 친구가 없어요/)).toBeInTheDocument();
    });
    const callsAfterSwitch = supabaseMock.__mocks.rpcMock.mock.calls.length;

    await act(async () => {
      resolveOlder(studyTimeResponse(900));
      oldListener({ eventType: 'INSERT', new: { id: 2, user_id: 'friend-1' }, old: {} });
    });

    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(supabaseMock.__mocks.rpcMock).toHaveBeenCalledTimes(callsAfterSwitch);
    expect(supabaseMock.removeChannel).toHaveBeenCalled();
  });

  it('opens the member report when a ranking row is clicked', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    fireEvent.click(getRankingRow('Buddy'));
    expect(screen.getByRole('dialog', { name: 'Buddy 리포트' })).toHaveTextContent('friend-1');
  });

  it('turns study-start notifications off from the row menu', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '공부 시작 알림 끄기' }));

    await waitFor(() => {
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/공부 시작 알림 꺼짐/);
    });
    expect(supabaseMock.__mocks.updateMock).toHaveBeenCalledWith({ is_notification_enabled: false });
    expect(supabaseMock.__mocks.updateEqMock).toHaveBeenCalledWith('id', 'friendship-1');
    expect(toastMock.success).toHaveBeenCalledWith('공부 시작 알림을 껐어요.');
  });

  it('keeps only the keys the row menu uses away from window shortcuts', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    const reached: string[] = [];
    const record = (event: KeyboardEvent) => reached.push(event.key);
    window.addEventListener('keydown', record);
    try {
      // 닫힌 트리거는 Enter·Space만 막고 Escape·Tab은 대화상자·폼으로 올려 보낸다.
      const trigger = screen.getByRole('button', { name: 'Buddy 친구 메뉴' });
      for (const key of [' ', 'Enter', 'Escape', 'Tab']) fireEvent.keyDown(trigger, { key });
      expect(reached).toEqual(['Escape', 'Tab']);

      // 열린 메뉴는 키보드를 가진다.
      reached.length = 0;
      fireEvent.click(trigger);
      const item = await screen.findByRole('button', { name: '닉네임 수정' });
      for (const key of [' ', 'Enter', 'Tab']) fireEvent.keyDown(item, { key });
      expect(reached).toEqual([]);
    } finally {
      window.removeEventListener('keydown', record);
    }
  });

  it('renames a friend through the nickname dialog', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '닉네임 수정' }));

    const dialog = await screen.findByRole('dialog', { name: '닉네임 수정' });
    const input = within(dialog).getByRole('textbox', { name: '친구 닉네임' });
    expect(input).toHaveValue('Buddy');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  Study Pal  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.getByText('Study Pal')).toBeInTheDocument();
    });
    expect(supabaseMock.__mocks.updateMock).toHaveBeenCalledWith({ nickname: 'Study Pal' });
    expect(screen.queryByRole('dialog', { name: '닉네임 수정' })).not.toBeInTheDocument();
  });

  it('clears the nickname back to the email when saved empty, and cancels with 취소', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '닉네임 수정' }));
    let dialog = await screen.findByRole('dialog', { name: '닉네임 수정' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '닉네임 수정' })).not.toBeInTheDocument();
    expect(supabaseMock.__mocks.updateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '닉네임 수정' }));
    dialog = await screen.findByRole('dialog', { name: '닉네임 수정' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.submit(within(dialog).getByRole('textbox').closest('form')!);

    await waitFor(() => {
      expect(getRankingRow('friend@example.com')).toBeInTheDocument();
    });
    expect(supabaseMock.__mocks.updateMock).toHaveBeenCalledWith({ nickname: null });
  });

  it('deletes a friend after confirming', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '친구 삭제' }));

    const confirm = await screen.findByRole('alertdialog', { name: '친구 삭제' });
    expect(confirm).toHaveTextContent('Buddy 님을 친구 목록에서 삭제할까요?');
    // 되돌릴 수 없는 확인이라 처음 포커스는 취소에 둔다.
    expect(within(confirm).getByRole('button', { name: '취소' })).toHaveFocus();
    fireEvent.click(within(confirm).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    });
    expect(supabaseMock.__mocks.rpcMock).toHaveBeenCalledWith('delete_friend', { friend_uuid: 'friend-1' });
    expect(toastMock.success).toHaveBeenCalledWith('친구를 삭제했어요.');
  });

  it('keeps the friend and reports an error when deletion fails', async () => {
    setupFriendshipResponse(onlineFriend);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });
    supabaseMock.__mocks.rpcMock.mockImplementation((fnName: string) =>
      Promise.resolve(fnName === 'delete_friend' ? { error: { message: 'nope' } } : { data: [], error: null })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '친구 삭제' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('친구를 삭제하지 못했어요.');
    });
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('raises only a friend that first appears after a refresh, once', async () => {
    setupFriendshipResponse(onlineFriend);
    const { rerender } = render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });
    // 처음 불러온 친구는 움직이지 않는다.
    expect(getRankingRow('Buddy').closest('li')).not.toHaveClass('animate-fade-up');

    // 받은 요청을 수락해 목록을 다시 불러오면 새 친구 줄만 떠오른다.
    setupFriendshipResponse(onlineFriend, [{
      id: 'friendship-2',
      friend_email: 'sua@example.com',
      friend_id: 'friend-2',
      nickname: null,
      created_at: '2026-10-28T00:00:00.000Z',
      is_notification_enabled: true,
      friend: onlineFriend,
    }]);
    rerender(<FriendList session={session as never} refreshTrigger={1} />);

    const newRow = (await screen.findByText('sua@example.com')).closest('li')!;
    expect(newRow).toHaveClass('animate-fade-up');
    expect(getRankingRow('Buddy').closest('li')).not.toHaveClass('animate-fade-up');

    // 한 번 돌면 표시를 떼어, 탭을 다시 열거나 다시 불러와도 되풀이하지 않는다.
    fireEvent.animationEnd(newRow);
    expect(newRow).not.toHaveClass('animate-fade-up');
    rerender(<FriendList session={session as never} refreshTrigger={2} />);
    await waitFor(() => expect(supabaseMock.__mocks.orderMock).toHaveBeenCalledTimes(3));
    expect(screen.getByText('sua@example.com').closest('li')).not.toHaveClass('animate-fade-up');
  });

  it('pops the muted bell in once when the user turns notifications off', async () => {
    setupFriendshipResponse(onlineFriend, [{
      id: 'friendship-2',
      friend_email: 'quiet@example.com',
      friend_id: 'friend-2',
      nickname: 'Quiet',
      created_at: '2026-03-18T00:00:00.000Z',
      is_notification_enabled: false,
      friend: onlineFriend,
    }]);
    render(<FriendList session={session as never} refreshTrigger={0} />);
    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });
    const bellIn = (name: string) => getRankingRow(name).querySelector('svg');
    // 이미 꺼져 있던 친구의 표시는 처음부터 그대로 있다.
    expect(bellIn('Quiet')).not.toHaveClass('animate-pop-in');

    fireEvent.click(screen.getByRole('button', { name: 'Buddy 친구 메뉴' }));
    fireEvent.click(await screen.findByRole('button', { name: '공부 시작 알림 끄기' }));

    await waitFor(() => {
      expect(getRankingRow('Buddy')).toHaveAccessibleName(/공부 시작 알림 꺼짐/);
    });
    expect(bellIn('Buddy')).toHaveClass('animate-pop-in');
    expect(bellIn('Quiet')).not.toHaveClass('animate-pop-in');

    fireEvent.animationEnd(bellIn('Buddy')!);
    expect(bellIn('Buddy')).not.toHaveClass('animate-pop-in');
  });

  it('reports friend and studying counts for the page heading', async () => {
    setupFriendshipResponse({ ...onlineFriend, status: 'studying', study_start_time: new Date().toISOString() });
    const onSummaryChange = vi.fn();

    render(<FriendList session={session as never} refreshTrigger={0} onSummaryChange={onSummaryChange} />);

    await waitFor(() => {
      expect(onSummaryChange).toHaveBeenLastCalledWith({ friendCount: 1, studyingCount: 1 });
    });
    expect(onSummaryChange).toHaveBeenCalledWith(null);
  });
});
