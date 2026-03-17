import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { toastMock, supabaseMock } = vi.hoisted(() => ({
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
    },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
  default: toastMock,
}));

vi.mock('../NotificationManager', () => ({
  default: ({ mode }: { mode: string }) => (
    <div data-mode={mode} data-testid="notification-manager" />
  ),
}));

import SettingsModal from '../SettingsModal';

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
  snowEnabled: boolean;
  tasks: string[];
  presets: Array<{ id: string; label: string; minutes: number }>;
};

type SessionUser = { id: string };

type SessionShape = {
  data: {
    session: {
      user: SessionUser;
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
  snowEnabled: true,
  tasks: ['국어', '수학', '영어'],
  presets: [
    { id: '1', label: '프리셋1', minutes: 25 },
    { id: '2', label: '프리셋2', minutes: 50 },
    { id: '3', label: '프리셋3', minutes: 90 },
  ],
};

let userSettingsResult: { data: { settings: SettingsShape } | null };
let selectMock: ReturnType<typeof vi.fn>;
let eqMock: ReturnType<typeof vi.fn>;
let singleMock: ReturnType<typeof vi.fn>;
let upsertMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let dispatchSpy: ReturnType<typeof vi.spyOn>;
let reloadSpy: ReturnType<typeof vi.spyOn>;

function renderModal() {
  const onClose = vi.fn();
  const onSave = vi.fn();

  const view = render(
    <SettingsModal isOpen onClose={onClose} onSave={onSave} />
  );

  return { ...view, onClose, onSave };
}

function getTimeInputs(): HTMLInputElement[] {
  const section = screen.getByText(/기본 시간 설정/).closest('section');
  if (!section) {
    throw new Error('Failed to locate time settings section');
  }

  return Array.from(
    section.querySelectorAll('input[type="number"]')
  ) as HTMLInputElement[];
}

function mockUser(id: string | null) {
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
    'fomopomo_settings',
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      ...settings,
    })
  );
}

function buildFetchResponse(
  ok: boolean,
  status: number,
  payload: Record<string, unknown>
) {
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
      return event instanceof Event
        ? event.type === 'settingsChanged'
        : false;
    })
  ).toBe(true);
}

describe('SettingsModal', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/before');

    userSettingsResult = { data: null };

    singleMock = vi.fn(async () => userSettingsResult);
    eqMock = vi.fn(() => ({ single: singleMock }));
    selectMock = vi.fn(() => ({ eq: eqMock }));
    upsertMock = vi.fn(async () => ({ error: null }));

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_settings') {
        return {
          select: selectMock,
          upsert: upsertMock,
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    });

    mockUser(null);
    mockSession(null);
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });

    toastMock.loading.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.loading.mockReturnValue('toast-id');

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    reloadSpy = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('loads remote settings on open when user settings exist', async () => {
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
          snowEnabled: false,
          tasks: ['물리'],
          presets: [{ id: 'remote', label: '심화', minutes: 61 }],
        },
      },
    };

    renderModal();

    await waitFor(() => {
      expect(screen.getByDisplayValue('77')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('13')).toBeInTheDocument();
    expect(screen.getByDisplayValue('29')).toBeInTheDocument();
    expect(screen.getByDisplayValue('물리')).toBeInTheDocument();
    expect(screen.getByDisplayValue('심화')).toBeInTheDocument();
    expect(screen.getByTestId('notification-manager')).toHaveAttribute(
      'data-mode',
      'inline'
    );
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

    renderModal();

    await waitFor(() => {
      expect(getTimeInputs()[0]).toHaveValue(64);
    });

    expect(getTimeInputs()[1]).toHaveValue(8);
    expect(getTimeInputs()[2]).toHaveValue(19);
    expect(screen.getByDisplayValue('화학')).toBeInTheDocument();
    expect(screen.getByDisplayValue('복습')).toBeInTheDocument();
  });

  it('saves settings to localStorage, dispatches settingsChanged, and closes', async () => {
    mockUser('user-save');

    const { onClose, onSave } = renderModal();

    const [pomoInput] = getTimeInputs();
    fireEvent.change(pomoInput, { target: { value: '33' } });
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalled();
    });

    const savedSettings = JSON.parse(
      window.localStorage.getItem('fomopomo_settings') ?? '{}'
    ) as SettingsShape;

    expect(savedSettings.pomoTime).toBe(33);
    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-save',
      settings: expect.objectContaining({ pomoTime: 33 }),
    });
    expectSettingsChangedEventDispatched();
    expect(toastMock.success).toHaveBeenCalledWith('설정이 저장되었습니다!');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
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

    const { onClose, onSave } = renderModal();

    await waitFor(() => {
      expect(getTimeInputs()[0]).toHaveValue(60);
    });

    fireEvent.click(screen.getByRole('button', { name: /설정 초기화/ }));
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalled();
    });

    const savedSettings = JSON.parse(
      window.localStorage.getItem('fomopomo_settings') ?? '{}'
    ) as SettingsShape;

    expect(savedSettings).toEqual(DEFAULT_SETTINGS);
    expect(toastMock.success).toHaveBeenCalledWith(
      '설정이 기본값으로 초기화되었습니다!'
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends the bearer token to account reset and clears local state on success', async () => {
    mockSession({
      user: { id: 'user-reset' },
      access_token: 'token-reset',
    });
    fetchMock.mockImplementation(() =>
      buildFetchResponse(true, 200, { success: true })
    );

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
      window.localStorage.setItem(
        key,
        key === 'fomopomo_settings' ? JSON.stringify(DEFAULT_SETTINGS) : 'stale'
      )
    );

    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /계정 초기화/ }));
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account-reset', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-reset',
        },
      });
    });

    await waitFor(() => {
      expect(reloadSpy).toHaveBeenCalled();
    });

    expect(window.localStorage.getItem('fomopomo_settings')).toBeNull();
    expect(window.localStorage.getItem('fomopomo_full_state')).toBeNull();
    expect(toastMock.success).toHaveBeenCalledWith('계정 초기화 완료', {
      id: 'toast-id',
    });
  });

  it('shows the leader-conflict message for account reset failures', async () => {
    mockSession({
      user: { id: 'user-conflict' },
      access_token: 'token-conflict',
    });
    fetchMock.mockImplementation(() =>
      buildFetchResponse(false, 409, {
        groups: [{ name: '스터디 A' }],
      })
    );

    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /계정 초기화/ }));
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('스터디 A'),
        expect.objectContaining({ id: 'toast-id', duration: 5000 })
      );
    });
  });

  it('sends the bearer token to account delete, signs out, and redirects home on success', async () => {
    mockSession({
      user: { id: 'user-delete' },
      access_token: 'token-delete',
    });
    fetchMock.mockImplementation(() =>
      buildFetchResponse(true, 200, { success: true })
    );
    window.localStorage.setItem(
      'fomopomo_settings',
      JSON.stringify(DEFAULT_SETTINGS)
    );

    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /계정 탈퇴/ }));
    fireEvent.click(screen.getByRole('button', { name: '탈퇴' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account-delete', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-delete',
        },
      });
    });

    await waitFor(() => {
      expect(supabaseMock.auth.signOut).toHaveBeenCalled();
    });

    expect(window.localStorage.getItem('fomopomo_settings')).toBeNull();
    expect(window.location.href.endsWith('/')).toBe(true);
  });

  it('short-circuits account actions when there is no active session', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /계정 탈퇴/ }));
    fireEvent.click(screen.getByRole('button', { name: '탈퇴' }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('로그인 상태가 아닙니다.');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
