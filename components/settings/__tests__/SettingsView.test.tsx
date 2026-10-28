import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { toastMock, supabaseMock, routerReplaceMock } = vi.hoisted(() => ({
  toastMock: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
  routerReplaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => '/settings',
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
  default: toastMock,
}));

vi.mock('@/lib/pushSubscriptionLifecycle', () => ({
  signOutWithPushCleanup: () => supabaseMock.auth.signOut(),
}));

vi.mock('@/components/NotificationManager', () => ({
  default: ({ mode }: { mode: string }) => <div data-mode={mode} data-testid="notification-manager" />,
}));

const subjectMocks = vi.hoisted(() => ({ create: vi.fn(), rename: vi.fn() }));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({ subjects: [], loading: false, error: null, refresh: vi.fn(), createSubject: subjectMocks.create, renameSubject: subjectMocks.rename }),
}));

import SettingsView from '../SettingsView';
import { getSettingsStorageKey } from '@/components/timer/hooks/settingsStore';
import { getStorageOwner } from '@/lib/userScopedStorage';

type SettingsShape = {
  pomoTime: number;
  shortBreak: number;
  longBreak: number;
  autoStartBreaks: boolean;
  autoStartPomos: boolean;
  longBreakInterval: number;
  volume: number;
  isMuted: boolean;
  taskPopupEnabled: boolean;
  seasonalTheme?: 'light' | 'dark' | 'spring';
  tasks: string[];
  presets: Array<{ id: string; label: string; minutes: number }>;
};

type SessionShape = {
  data: {
    session: {
      user: { id: string };
      access_token: string;
    } | null;
  };
  error: unknown;
};

const DEFAULT_SETTINGS: SettingsShape = {
  pomoTime: 25,
  shortBreak: 5,
  longBreak: 15,
  autoStartBreaks: false,
  autoStartPomos: false,
  longBreakInterval: 4,
  volume: 50,
  isMuted: false,
  taskPopupEnabled: true,
  tasks: [],
  presets: [
    { id: '1', label: '집중', minutes: 25 },
    { id: '2', label: '집중', minutes: 50 },
    { id: '3', label: '집중', minutes: 90 },
  ],
};

let userSettingsResult: { data: { settings: SettingsShape } | null };
let upsertMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let dispatchSpy: ReturnType<typeof vi.spyOn>;
let reloadSpy: ReturnType<typeof vi.spyOn>;

const sessionFor = (id: string) => ({ user: { id, email: `${id}@example.com`, user_metadata: {} } }) as unknown as Session;

// The page host (SettingsScreen) remounts the view per storage owner.
function renderPage({ signedIn = getStorageOwner() !== 'guest' }: { signedIn?: boolean } = {}) {
  const onOpenLogin = vi.fn();
  const element = () => (
    <SettingsView
      key={getStorageOwner()}
      session={signedIn ? sessionFor(getStorageOwner()) : null}
      onOpenLogin={onOpenLogin}
    />
  );
  const view = render(element());
  return { ...view, onOpenLogin, rerenderPage: () => view.rerender(element()) };
}

const pomoInput = () => screen.getByRole('spinbutton', { name: '집중 시간 (분)' });
const shortBreakInput = () => screen.getByRole('spinbutton', { name: '짧은 휴식 시간 (분)' });
const longBreakInput = () => screen.getByRole('spinbutton', { name: '긴 휴식 시간 (분)' });
const intervalInput = () => screen.getByRole('spinbutton', { name: '긴 휴식 간격 (사이클)' });
const saveButton = () => screen.getByRole('button', { name: '저장하기' });
const topBarSaveButton = () => screen.getByRole('button', { name: '저장' });
const storedSettings = () => JSON.parse(window.localStorage.getItem(getSettingsStorageKey()) ?? '{}') as SettingsShape;
const dialog = () => screen.getByRole('alertdialog');

function mockUser(id: string | null) {
  if (id) window.localStorage.setItem('sb-testproj-auth-token', JSON.stringify({ access_token: 'token', user: { id } }));
  else window.localStorage.removeItem('sb-testproj-auth-token');
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: id ? { id } : null },
  });
}

function mockSession(session: SessionShape['data']['session']) {
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session },
    error: null,
  } satisfies SessionShape);
}

function setStoredSettings(settings: Partial<SettingsShape>) {
  window.localStorage.setItem(
    getSettingsStorageKey(),
    JSON.stringify({
      ...(getStorageOwner() === 'guest' ? {} : { ownerUserId: getStorageOwner() }),
      ...DEFAULT_SETTINGS,
      ...settings,
    })
  );
}

function buildFetchResponse(ok: boolean, status: number, payload: Record<string, unknown>) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
  });
}

function expectSettingsChangedEventDispatched() {
  expect(
    dispatchSpy.mock.calls.some((call: unknown[]) => {
      const event = call[0] as Event | undefined;
      return event instanceof Event ? event.type === 'settingsChanged' : false;
    })
  ).toBe(true);
}

describe('SettingsView (/settings)', () => {
  beforeEach(() => {
    cleanup();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproj.supabase.co');
    window.localStorage.clear();
    subjectMocks.create.mockReset();
    subjectMocks.create.mockImplementation(async (name: string) => ({ id: name, user_id: getStorageOwner(), name }));

    userSettingsResult = { data: null };
    const singleMock = vi.fn(async () => userSettingsResult);
    const eqMock = vi.fn(() => ({ single: singleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    upsertMock = vi.fn(async () => ({ error: null }));

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_settings') {
        return { select: selectMock, upsert: upsertMock };
      }
      throw new Error(`Unexpected table access: ${table}`);
    });

    mockUser(null);
    mockSession(null);
    supabaseMock.auth.signOut.mockReset();
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });
    routerReplaceMock.mockReset();

    toastMock.loading.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.loading.mockReturnValue('toast-id');

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    cleanup();
  });

  it('renders the board sections in order with the mobile top bar', async () => {
    renderPage();
    await screen.findByText(/로그인하면 과목/);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['과목 관리', '집중 프리셋', '기본 시간', '자동 시작', '알림 소리', '알림 설정', '계정', '후원']);
    expect(screen.getAllByRole('heading', { level: 1, name: '설정' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: '프로필로 돌아가기' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: '프로필로' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: '후원하기' })).toHaveAttribute('href', '/support');
    expect(screen.getByTestId('notification-manager')).toHaveAttribute('data-mode', 'inline');
  });

  it('saves selective legacy imports without overwriting current form edits or reoffering imported names', async () => {
    mockUser('user-import');
    setStoredSettings({ pomoTime: 31, tasks: [' DB ', '남길 메모', ''] });
    let finish!: (value: { id: string; user_id: string; name: string }) => void;
    subjectMocks.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = renderPage();
    await screen.findByText('이전 작업 목록 가져오기 (3)');
    fireEvent.change(pomoInput(), { target: { value: '44' } });
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (3)'));
    fireEvent.click(screen.getByRole('checkbox', { name: '이전 항목 1 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    // While the subject write is in flight every other setting is locked.
    expect(saveButton()).toBeDisabled();
    expect(topBarSaveButton()).toBeDisabled();
    expect(pomoInput()).toBeDisabled();
    expect(screen.getByText('과목을 저장하고 있어요.')).toBeInTheDocument();
    expect(upsertMock).not.toHaveBeenCalled();
    await act(async () => finish({ id: 'db', user_id: 'user-import', name: 'DB' }));
    await waitFor(() => expect(screen.queryByDisplayValue(' DB ')).not.toBeInTheDocument());
    expect(pomoInput()).toHaveValue(44);
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText('저장했어요.')).toBeInTheDocument());
    expect(upsertMock).toHaveBeenCalledWith({ user_id: 'user-import', settings: expect.objectContaining({ pomoTime: 44, tasks: ['남길 메모', ''] }) });
    unmount();
    renderPage();
    await screen.findByText('이전 작업 목록 가져오기 (2)');
    expect(screen.queryByDisplayValue(' DB ')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('남길 메모')).toBeInTheDocument();
  });

  it('preserves guest legacy names without offering them to the next signed-in account', async () => {
    setStoredSettings({ tasks: ['게스트 메모'] });
    const { rerenderPage } = renderPage();
    await screen.findByText(/이 기기에 저장된 이전 작업 목록은 그대로 보관/);
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText('저장했어요.')).toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem('fomopomo_settings') ?? '{}').tasks).toEqual(['게스트 메모']);
    mockUser('fresh-account');
    rerenderPage();
    await screen.findByText('아직 과목이 없어요. 자주 공부하는 과목을 추가해보세요.');
    expect(screen.queryByText(/이전 작업 목록 가져오기/)).not.toBeInTheDocument();
    expect(subjectMocks.create).not.toHaveBeenCalled();
  });

  it('loads remote settings when user settings exist', async () => {
    mockUser('user-remote');
    setStoredSettings({
      pomoTime: 31,
      tasks: ['로컬'],
      presets: [{ id: 'local', label: '로컬', minutes: 31 }],
    });
    userSettingsResult = {
      data: {
        settings: {
          ...DEFAULT_SETTINGS,
          pomoTime: 77,
          shortBreak: 13,
          longBreak: 29,
          longBreakInterval: 9,
          volume: 12,
          taskPopupEnabled: false,
          seasonalTheme: 'spring' as const,
          tasks: ['물리'],
          presets: [{ id: 'remote', label: '심화', minutes: 61 }],
        },
      },
    };

    renderPage();

    await waitFor(() => expect(pomoInput()).toHaveValue(77));
    expect(shortBreakInput()).toHaveValue(13);
    expect(longBreakInput()).toHaveValue(29);
    expect(intervalInput()).toHaveValue(9);
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '저장 시 작업 메모 팝업' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByDisplayValue('물리')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '프리셋 1 이름' })).toHaveValue('심화');
    expect(screen.getByRole('spinbutton', { name: '프리셋 1 시간 (분)' })).toHaveValue(61);
    // A fresh load is not an edit.
    expect(screen.queryByText('변경 사항은 나갈 때 자동으로 저장돼요.')).not.toBeInTheDocument();
  });

  it('falls back to localStorage settings when remote settings are absent', async () => {
    setStoredSettings({
      pomoTime: 64,
      shortBreak: 8,
      longBreak: 19,
      longBreakInterval: 6,
      tasks: ['화학'],
      presets: [{ id: 'fallback', label: '복습', minutes: 64 }],
    });

    renderPage();

    await waitFor(() => expect(pomoInput()).toHaveValue(64));
    expect(shortBreakInput()).toHaveValue(8);
    expect(longBreakInput()).toHaveValue(19);
    expect(intervalInput()).toHaveValue(6);
    expect(screen.getByText(/이 기기에 저장된 이전 작업 목록은 그대로 보관/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('화학')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('복습')).toBeInTheDocument();
  });

  it('saves settings to localStorage and the server, dispatches settingsChanged, and stays on the page', async () => {
    mockUser('user-save');
    setStoredSettings({ pomoTime: 26 });

    renderPage();
    // Saves are gated on the stored settings having hydrated the form.
    await waitFor(() => expect(pomoInput()).toHaveValue(26));

    fireEvent.change(pomoInput(), { target: { value: '33' } });
    expect(screen.getByText('변경 사항은 나갈 때 자동으로 저장돼요.')).toBeInTheDocument();
    fireEvent.click(saveButton());

    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(storedSettings().pomoTime).toBe(33);
    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-save',
      settings: expect.objectContaining({ pomoTime: 33 }),
    });
    expectSettingsChangedEventDispatched();
    expect(await screen.findByText('저장했어요.')).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it('saves from the mobile top bar button too', async () => {
    mockUser('user-topbar');
    setStoredSettings({ shortBreak: 6 });
    renderPage();
    await waitFor(() => expect(shortBreakInput()).toHaveValue(6));
    fireEvent.click(screen.getByRole('button', { name: '짧은 휴식 늘리기' }));
    fireEvent.click(topBarSaveButton());
    await waitFor(() => expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-topbar',
      settings: expect.objectContaining({ shortBreak: 7 }),
    }));
  });

  it('shows an error and keeps the edits pending when persisting settings fails', async () => {
    mockUser('user-save-fail');
    setStoredSettings({ pomoTime: 26 });
    upsertMock.mockImplementationOnce(async () => {
      throw new Error('save failed');
    });

    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(26));

    fireEvent.change(pomoInput(), { target: { value: '33' } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        '설정을 저장할 수 없습니다. 데이터를 복구하거나 초기화한 뒤 다시 시도해주세요.'
      );
    });
    expect(screen.queryByText('저장했어요.')).not.toBeInTheDocument();
    expect(screen.getByText('변경 사항은 나갈 때 자동으로 저장돼요.')).toBeInTheDocument();
  });

  it('does not save before the stored settings have loaded', async () => {
    setStoredSettings({ pomoTime: 40 });
    // Keep the load permanently in flight.
    supabaseMock.auth.getUser.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderPage();

    expect(saveButton()).toBeDisabled();
    expect(topBarSaveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    fireEvent.change(pomoInput(), { target: { value: '41' } });
    unmount();
    await act(async () => {});

    // The stored settings survive: the untouched default form was never
    // persisted over them, not even when leaving the page.
    expect(upsertMock).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(storedSettings().pomoTime).toBe(40);
  });

  it('recovers cleared inputs to the stored values and clamps zeros on save', async () => {
    mockUser('user-clamp');
    setStoredSettings({ pomoTime: 30 });

    renderPage();
    // Wait for the async settings load so it cannot overwrite the edits below.
    await waitFor(() => expect(pomoInput()).toHaveValue(30));

    // Clearing a field is allowed while typing — no snap to 0…
    fireEvent.change(pomoInput(), { target: { value: '' } });
    expect(pomoInput()).toHaveValue(null);
    fireEvent.change(shortBreakInput(), { target: { value: '0' } });
    fireEvent.change(intervalInput(), { target: { value: '0' } });

    fireEvent.click(saveButton());
    await waitFor(() => expect(upsertMock).toHaveBeenCalled());

    // …but the save stores sane values: a field left cleared keeps the value
    // the user already had, and an explicit 0 clamps to the minimum.
    const saved = storedSettings();
    expect(saved.pomoTime).toBe(30);
    expect(saved.shortBreak).toBe(1);
    expect(saved.longBreakInterval).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-clamp',
      settings: expect.objectContaining({ pomoTime: 30, shortBreak: 1, longBreakInterval: 1 }),
    });

    // The form reflects exactly what was stored.
    expect(pomoInput()).toHaveValue(30);
    expect(shortBreakInput()).toHaveValue(1);
    expect(intervalInput()).toHaveValue(1);
  });

  it('keeps a preset whose minutes were cleared instead of saving a 1-minute preset', async () => {
    mockUser('user-preset');
    setStoredSettings({ presets: [{ id: 'p1', label: '심화', minutes: 47 }] });

    renderPage();
    const presetMinutes = await screen.findByDisplayValue('47');
    // Clearing shows an empty field, not a snap to 0…
    fireEvent.change(presetMinutes, { target: { value: '' } });
    expect(presetMinutes).toHaveValue(null);

    fireEvent.click(saveButton());
    await waitFor(() => expect(upsertMock).toHaveBeenCalled());

    // …and saving recovers the preset's previous minutes.
    expect(storedSettings().presets).toEqual([{ id: 'p1', label: '심화', minutes: 47 }]);
  });

  it('steps durations along the step grid within the stored bounds', async () => {
    setStoredSettings({ pomoTime: 31, shortBreak: 1, longBreakInterval: 99 });
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(31));

    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    expect(pomoInput()).toHaveValue(35);
    fireEvent.click(screen.getByRole('button', { name: '집중 줄이기' }));
    fireEvent.click(screen.getByRole('button', { name: '집중 줄이기' }));
    expect(pomoInput()).toHaveValue(25);

    expect(screen.getByRole('button', { name: '짧은 휴식 줄이기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '짧은 휴식 늘리기' }));
    expect(shortBreakInput()).toHaveValue(2);

    expect(screen.getByRole('button', { name: '긴 휴식 간격 늘리기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '긴 휴식 간격 줄이기' }));
    expect(intervalInput()).toHaveValue(98);

    // A cleared field steps from the value it would recover to.
    fireEvent.change(pomoInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    expect(pomoInput()).toHaveValue(35);
  });

  it('adds presets up to three and removes them', async () => {
    mockUser('user-presets');
    setStoredSettings({});
    renderPage();
    await screen.findByRole('spinbutton', { name: '프리셋 3 시간 (분)' });
    expect(screen.queryByRole('button', { name: '프리셋 추가' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '프리셋 2 삭제' }));
    expect(screen.queryByRole('spinbutton', { name: '프리셋 3 시간 (분)' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '프리셋 2 시간 (분)' })).toHaveValue(90);

    fireEvent.click(screen.getByRole('button', { name: '프리셋 추가' }));
    expect(screen.getByRole('textbox', { name: '프리셋 3 이름' })).toHaveValue('집중');
    expect(screen.getByRole('spinbutton', { name: '프리셋 3 시간 (분)' })).toHaveValue(25);
    fireEvent.click(screen.getByRole('button', { name: '프리셋 3 시간 늘리기' }));
    fireEvent.change(screen.getByRole('textbox', { name: '프리셋 3 이름' }), { target: { value: '복습' } });
    expect(screen.queryByRole('button', { name: '프리셋 추가' })).not.toBeInTheDocument();

    fireEvent.click(saveButton());
    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(storedSettings().presets).toEqual([
      { id: '1', label: '집중', minutes: 25 },
      { id: '3', label: '집중', minutes: 90 },
      { id: expect.any(String), label: '복습', minutes: 30 },
    ]);
  });

  it('persists the toggles and sound settings', async () => {
    mockUser('user-toggles');
    setStoredSettings({ volume: 40 });
    renderPage();
    await screen.findByText('40%');

    fireEvent.click(screen.getByRole('switch', { name: '휴식 자동 시작' }));
    fireEvent.click(screen.getByRole('switch', { name: '뽀모도로 자동 시작' }));
    fireEvent.click(screen.getByRole('switch', { name: '저장 시 작업 메모 팝업' }));
    fireEvent.change(screen.getByLabelText('볼륨'), { target: { value: '70' } });
    expect(screen.getByText('70%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: '음소거' }));
    expect(screen.getByRole('switch', { name: '음소거' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('볼륨')).toBeDisabled();

    fireEvent.click(saveButton());
    await waitFor(() => expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-toggles',
      settings: expect.objectContaining({
        autoStartBreaks: true,
        autoStartPomos: true,
        taskPopupEnabled: false,
        volume: 70,
        isMuted: true,
      }),
    }));
  });

  it('saves pending edits when the page is left without saving', async () => {
    mockUser('user-leave');
    setStoredSettings({ longBreak: 20 });
    const { unmount } = renderPage();
    await waitFor(() => expect(longBreakInput()).toHaveValue(20));

    fireEvent.click(screen.getByRole('button', { name: '긴 휴식 늘리기' }));
    unmount();

    await waitFor(() => expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-leave',
      settings: expect.objectContaining({ longBreak: 25 }),
    }));
    expect(storedSettings().longBreak).toBe(25);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('설정을 저장했어요.'));
  });

  it('keeps a failed leave-time save recoverable even though the server still has the old value', async () => {
    mockUser('user-leave-fail');
    setStoredSettings({});
    // The server row stays at the old 25 minutes; only the write fails.
    userSettingsResult = { data: { settings: { ...DEFAULT_SETTINGS } } };
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    const first = renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    fireEvent.change(pomoInput(), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('switch', { name: '휴식 자동 시작' }));
    first.unmount();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('설정을 저장하지 못했어요. 다음에 설정을 열면 변경 사항을 다시 불러와요.'));
    expect(toastMock.success).not.toHaveBeenCalled();

    // Coming back: the remote-first load restores 25 into storage, but the
    // unsaved edits win in the form and are still pending.
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(45));
    expect(storedSettings().pomoTime).toBe(25);
    expect(screen.getByRole('switch', { name: '휴식 자동 시작' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    // Saving now succeeds and settles everything.
    fireEvent.click(saveButton());
    await screen.findByText('저장했어요.');
    expect(upsertMock).toHaveBeenLastCalledWith({
      user_id: 'user-leave-fail',
      settings: expect.objectContaining({ pomoTime: 45, autoStartBreaks: true }),
    });
    expect(storedSettings().pomoTime).toBe(45);
    expect(window.localStorage.getItem('fomopomo_settings_draft::user-leave-fail')).toBeNull();
  });

  it('retries a recovered draft when the page is left again and forgets it once saved', async () => {
    mockUser('user-leave-retry');
    setStoredSettings({});
    userSettingsResult = { data: { settings: { ...DEFAULT_SETTINGS } } };
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    const first = renderPage();
    await waitFor(() => expect(longBreakInput()).toHaveValue(15));
    fireEvent.click(screen.getByRole('button', { name: '긴 휴식 늘리기' }));
    first.unmount();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());

    // Browser back / any in-app navigation away from the recovered form saves it.
    const second = renderPage();
    await waitFor(() => expect(longBreakInput()).toHaveValue(20));
    second.unmount();
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('설정을 저장했어요.'));
    expect(upsertMock).toHaveBeenLastCalledWith({
      user_id: 'user-leave-retry',
      settings: expect.objectContaining({ longBreak: 20 }),
    });
    expect(window.localStorage.getItem('fomopomo_settings_draft::user-leave-retry')).toBeNull();

    // With the server updated, the next visit is clean.
    userSettingsResult = { data: { settings: { ...DEFAULT_SETTINGS, longBreak: 20 } } };
    renderPage();
    await waitFor(() => expect(longBreakInput()).toHaveValue(20));
    expect(screen.queryByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).not.toBeInTheDocument();
    expect(screen.queryByText('변경 사항은 나갈 때 자동으로 저장돼요.')).not.toBeInTheDocument();
  });

  it('keeps unsaved edits as a draft when the page is unloaded (reload or tab close)', async () => {
    mockUser('user-unload');
    setStoredSettings({});
    renderPage();
    await waitFor(() => expect(shortBreakInput()).toHaveValue(5));
    window.dispatchEvent(new Event('pagehide'));
    // A clean page leaves no draft behind.
    expect(window.localStorage.getItem('fomopomo_settings_draft::user-unload')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '짧은 휴식 늘리기' }));
    window.dispatchEvent(new Event('pagehide'));
    // Unloading cannot finish a server write, so only the owner's draft is kept;
    // the next load restores it over the stored settings (see the tests above).
    const draft = JSON.parse(window.localStorage.getItem('fomopomo_settings_draft::user-unload') ?? 'null');
    expect(draft).toMatchObject({
      ownerUserId: 'user-unload',
      settings: { shortBreak: 6 },
      base: { shortBreak: 5 },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('forgets reverted recovered edits right away, so a reload stays at the saved value', async () => {
    mockUser('user-revert-reload');
    setStoredSettings({});
    userSettingsResult = { data: { settings: { ...DEFAULT_SETTINGS } } };
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    const first = renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    fireEvent.change(pomoInput(), { target: { value: '35' } });
    first.unmount();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    const draftKey = 'fomopomo_settings_draft::user-revert-reload';
    expect(window.localStorage.getItem(draftKey)).not.toBeNull();

    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(35));
    expect(screen.getByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).toBeInTheDocument();

    // Reverting to the saved value settles the form and drops the draft
    // immediately — no React unmount (a real reload never runs one).
    fireEvent.change(pomoInput(), { target: { value: '25' } });
    await waitFor(() => expect(window.localStorage.getItem(draftKey)).toBeNull());
    expect(screen.queryByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).not.toBeInTheDocument();
    expect(screen.queryByText('변경 사항은 나갈 때 자동으로 저장돼요.')).not.toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    window.dispatchEvent(new Event('pagehide'));
    expect(window.localStorage.getItem(draftKey)).toBeNull();

    // "Reload": a fresh page instance while the old one is never cleaned up
    // (it stays mounted, as no React cleanup runs on a document unload).
    upsertMock.mockClear();
    const reloaded = within(renderPage().container);
    await waitFor(() => expect(reloaded.getByRole('spinbutton', { name: '집중 시간 (분)' })).toHaveValue(25));
    expect(reloaded.queryByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).not.toBeInTheDocument();
    expect(reloaded.queryByText('변경 사항은 나갈 때 자동으로 저장돼요.')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey)).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('shows a new edit on top of recovered edits as an ordinary pending change', async () => {
    mockUser('user-recover-edit');
    setStoredSettings({});
    userSettingsResult = { data: { settings: { ...DEFAULT_SETTINGS } } };
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    const first = renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    fireEvent.change(pomoInput(), { target: { value: '35' } });
    first.unmount();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());

    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(35));
    fireEvent.click(screen.getByRole('button', { name: '짧은 휴식 늘리기' }));
    expect(screen.queryByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).not.toBeInTheDocument();
    expect(screen.getByText('변경 사항은 나갈 때 자동으로 저장돼요.')).toBeInTheDocument();
    // The stored draft is still there until the edits are saved or reverted.
    expect(window.localStorage.getItem('fomopomo_settings_draft::user-recover-edit')).not.toBeNull();
  });

  it('drops a recovered draft when the edits are reverted before leaving', async () => {
    mockUser('user-revert');
    setStoredSettings({});
    userSettingsResult = { data: { settings: { ...DEFAULT_SETTINGS } } };
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    const first = renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    fireEvent.change(pomoInput(), { target: { value: '40' } });
    first.unmount();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());

    const second = renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(40));
    fireEvent.change(pomoInput(), { target: { value: '25' } });
    upsertMock.mockClear();
    second.unmount();
    await act(async () => {});
    expect(upsertMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('fomopomo_settings_draft::user-revert')).toBeNull();
  });

  it('never applies one account\'s draft to another account', async () => {
    window.localStorage.setItem('fomopomo_settings_draft::user-b', JSON.stringify({
      settings: { ...DEFAULT_SETTINGS, pomoTime: 55 },
      base: DEFAULT_SETTINGS,
      ownerUserId: 'user-a',
    }));
    mockUser('user-b');
    setStoredSettings({});
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    expect(screen.queryByText('저장하지 못한 변경 사항을 다시 불러왔어요.')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('fomopomo_settings_draft::user-b')).toBeNull();
  });

  it('does not write anything when leaving an unchanged page', async () => {
    mockUser('user-clean');
    setStoredSettings({ pomoTime: 27 });
    const { unmount } = renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(27));
    // An edit that is reverted is not pending either.
    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    fireEvent.change(pomoInput(), { target: { value: '27' } });
    unmount();
    await act(async () => {});
    expect(upsertMock).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('asks the browser to confirm a reload or tab close only while edits are pending', async () => {
    setStoredSettings({});
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));

    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    expect(unload()).toBe(true);
    fireEvent.click(saveButton());
    await screen.findByText('저장했어요.');
    expect(unload()).toBe(false);
  });

  it('resets settings to defaults through the confirm flow', async () => {
    mockUser('user-reset-settings');
    setStoredSettings({
      pomoTime: 60,
      shortBreak: 20,
      longBreak: 30,
      tasks: ['생물'],
      presets: [{ id: 'custom', label: '커스텀', minutes: 60 }],
    });

    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(60));

    fireEvent.click(screen.getByRole('button', { name: '설정 초기화' }));
    expect(within(dialog()).getByRole('heading', { name: '설정을 초기화할까요?' })).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: '초기화' }));

    await waitFor(() => expect(upsertMock).toHaveBeenCalled());
    expect(storedSettings()).toEqual({ ...DEFAULT_SETTINGS, ownerUserId: getStorageOwner() });
    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-reset-settings',
      settings: DEFAULT_SETTINGS,
    });
    expect(await screen.findByText('설정을 기본값으로 되돌렸어요.')).toBeInTheDocument();
    expect(pomoInput()).toHaveValue(25);
  });

  it('closes a confirm dialog on Escape without acting', async () => {
    mockUser('user-escape');
    setStoredSettings({ pomoTime: 60 });
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(60));
    fireEvent.click(screen.getByRole('button', { name: '설정 초기화' }));
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(upsertMock).not.toHaveBeenCalled();
    expect(pomoInput()).toHaveValue(60);
  });

  it('repairs corrupt local settings during reset but reports when remote persistence fails', async () => {
    mockUser('user-reset-fail');
    window.localStorage.setItem(getSettingsStorageKey(), 'not-json');
    upsertMock.mockImplementationOnce(async () => {
      throw new Error('reset failed');
    });

    renderPage();
    await screen.findByLabelText('새 과목 이름');

    fireEvent.click(screen.getByRole('button', { name: '설정 초기화' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '초기화' }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('설정을 기본값으로 저장할 수 없습니다. 다시 시도해주세요.');
    });
    expect(storedSettings()).toEqual({ ...DEFAULT_SETTINGS, ownerUserId: getStorageOwner() });
    expect(screen.queryByText('설정을 기본값으로 되돌렸어요.')).not.toBeInTheDocument();
  });

  it('sends the bearer token to account reset and clears local state on success', async () => {
    mockSession({ user: { id: 'user-reset' }, access_token: 'token-reset' });
    fetchMock.mockImplementation(() => buildFetchResponse(true, 200, { success: true }));

    [
      'fomopomo_settings',
      'fomopomo_pomoTime',
      'fomopomo_initialPomoTime',
      'fomopomo_stopwatchTime',
      'fomopomo_selectedTask',
      'fomopomo_selectedTaskId',
      'fomopomo_full_state',
      'fomopomo_task_state',
      'fomopomo_notification_dismissed',
      'fomopomo_changelog_last_viewed',
    ].forEach((key) =>
      window.localStorage.setItem(key, key === 'fomopomo_settings' ? JSON.stringify(DEFAULT_SETTINGS) : 'stale')
    );
    // User-scoped variants and the pending-session outbox must be cleared for
    // the resetting account only.
    window.localStorage.setItem('fomopomo_full_state::user-reset', 'stale-owned');
    window.localStorage.setItem(
      'fomopomo_pending_sessions',
      JSON.stringify({
        'draft-mine': { sessionId: 'draft-mine', rows: [{ duration: 60, user_id: 'user-reset', group_id: 'draft-mine' }], failedAt: 1 },
        'draft-other': { sessionId: 'draft-other', rows: [{ duration: 60, user_id: 'user-other', group_id: 'draft-other' }], failedAt: 1 },
      })
    );

    const { unmount } = renderPage({ signedIn: true });
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    // A pending edit must not be written back over the erased settings.
    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));

    fireEvent.click(screen.getByRole('button', { name: '계정 초기화' }));
    expect(within(dialog()).getByText('다음 데이터가 모두 초기화돼요.')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: '계정 초기화' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account-reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-reset' },
      });
    });
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());

    expect(window.localStorage.getItem('fomopomo_settings')).toBeNull();
    expect(window.localStorage.getItem('fomopomo_full_state')).toBeNull();
    expect(window.localStorage.getItem('fomopomo_full_state::user-reset')).toBeNull();
    expect(Object.keys(JSON.parse(window.localStorage.getItem('fomopomo_pending_sessions') ?? '{}'))).toEqual(['draft-other']);
    expect(toastMock.success).toHaveBeenCalledWith('계정 초기화 완료', { id: 'toast-id' });

    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(false);
    unmount();
    await act(async () => {});
    expect(upsertMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('fomopomo_settings')).toBeNull();
  });

  it('shows the leader-conflict message for account reset failures', async () => {
    mockSession({ user: { id: 'user-conflict' }, access_token: 'token-conflict' });
    fetchMock.mockImplementation(() => buildFetchResponse(false, 409, { groups: [{ name: '스터디 A' }] }));

    renderPage({ signedIn: true });

    fireEvent.click(screen.getByRole('button', { name: '계정 초기화' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '계정 초기화' }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('스터디 A'),
        expect.objectContaining({ id: 'toast-id', duration: 5000 })
      );
    });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('sends the bearer token to account delete, signs out, and redirects home on success', async () => {
    mockSession({ user: { id: 'user-delete' }, access_token: 'token-delete' });
    fetchMock.mockImplementation(() => buildFetchResponse(true, 200, { success: true }));
    window.localStorage.setItem('fomopomo_settings', JSON.stringify(DEFAULT_SETTINGS));

    renderPage({ signedIn: true });

    fireEvent.click(screen.getByRole('button', { name: '계정 탈퇴' }));
    expect(within(dialog()).getByRole('heading', { name: '정말 탈퇴할까요?' })).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account-delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-delete' },
      });
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalled());
    expect(window.localStorage.getItem('fomopomo_settings')).toBeNull();
    expect(routerReplaceMock).toHaveBeenCalledWith('/');
  });

  it('short-circuits account actions when there is no active session', async () => {
    renderPage({ signedIn: true });

    fireEvent.click(screen.getByRole('button', { name: '계정 탈퇴' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('로그인 상태가 아닙니다.'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves pending edits, signs out, and goes home through the logout dialog', async () => {
    mockUser('user-logout');
    setStoredSettings({});
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    fireEvent.change(pomoInput(), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(within(dialog()).getByRole('heading', { name: '로그아웃할까요?' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: '로그아웃' })).toHaveFocus());
    fireEvent.click(within(dialog()).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/'));
    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-logout',
      settings: expect.objectContaining({ pomoTime: 50 }),
    });
    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.invocationCallOrder[0]).toBeLessThan(supabaseMock.auth.signOut.mock.invocationCallOrder[0]);
  });

  it('keeps the user signed in when pending edits cannot be saved before logout', async () => {
    mockUser('user-logout-fail');
    setStoredSettings({});
    upsertMock.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    renderPage();
    await waitFor(() => expect(pomoInput()).toHaveValue(25));
    fireEvent.change(pomoInput(), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('설정을 저장하지 못해 로그아웃하지 않았어요. 다시 시도해주세요.'));
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
    expect(routerReplaceMock).not.toHaveBeenCalled();
    // The dialog stays open so the user can retry.
    expect(within(dialog()).getByRole('button', { name: '로그아웃' })).toBeEnabled();
  });

  it('shows login prompts instead of account actions for guests while timer settings stay editable', async () => {
    setStoredSettings({});
    const { onOpenLogin } = renderPage();
    await screen.findByText(/로그인하면 과목/);

    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정 초기화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정 탈퇴' })).not.toBeInTheDocument();
    expect(screen.getByText(/로그인하면 계정을 관리할 수 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정 초기화' })).toBeEnabled();
    expect(pomoInput()).toBeEnabled();

    // Logging in leaves the page (OAuth), so pending edits are saved first.
    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    fireEvent.click(within(screen.getByRole('region', { name: '과목 관리' })).getByRole('button', { name: '로그인' }));
    await waitFor(() => expect(onOpenLogin).toHaveBeenCalledTimes(1));
    expect(JSON.parse(window.localStorage.getItem('fomopomo_settings') ?? '{}').pomoTime).toBe(30);
    fireEvent.click(within(screen.getByRole('region', { name: '계정' })).getByRole('button', { name: '로그인' }));
    await waitFor(() => expect(onOpenLogin).toHaveBeenCalledTimes(2));
  });
});
