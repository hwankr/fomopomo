import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

const mock = vi.hoisted(() => ({
  session: null as Session | null,
  loading: false,
  total: 0,
  fetchStats: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({ session: mock.session, loading: false }) }));
vi.mock('@/hooks/useStudyStats', () => ({ useStudyStats: () => ({
  fetchStats: mock.fetchStats, heatmapData: [], totalFocusTime: mock.total, todayFocusTime: 2.5 * 3600, earliestYear: 2025, loading: mock.loading,
}) }));
vi.mock('@/lib/pushSubscriptionLifecycle', () => ({ signOutWithPushCleanup: mock.signOut }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mock.replace, push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ toast: { error: mock.toastError } }));
// 헤더·리포트·로그인 창은 각자의 테스트가 다룬다. 여기서는 페이지 배치와 로그아웃 흐름만 본다.
vi.mock('@/components/Navbar', () => ({ default: ({ mobileTopBar, onOpenLogin }: { mobileTopBar?: ReactNode; onOpenLogin?: () => void }) => (
  <header>{mobileTopBar}<button type="button" onClick={onOpenLogin}>헤더 로그인</button></header>
) }));
vi.mock('@/components/LoginModal', () => ({ default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <p>로그인 창</p> : null) }));
vi.mock('@/components/StudyReport', () => ({ default: ({ stats }: { stats: { fetchStats: unknown; todayFocusTime: number } }) => (
  <p>상세 리포트{stats.fetchStats === mock.fetchStats ? ` 오늘 ${stats.todayFocusTime}초` : ''}</p>
) }));
vi.mock('@/components/profile/ContributionGraph', () => ({ default: ({ earliestYear }: { earliestYear: number | null }) => <p>공부 기록 {earliestYear}</p> }));

import ProfilePage from '@/app/profile/page';

const user = { id: 'user-a', email: 'minji@example.com', user_metadata: { full_name: '민지' } } as unknown as User;

describe('프로필 화면', () => {
  beforeEach(() => {
    mock.session = { user } as Session;
    mock.loading = false;
    mock.total = 312 * 3600 + 1200;
    mock.fetchStats.mockClear();
    mock.signOut.mockReset().mockResolvedValue({ error: null });
    mock.replace.mockClear();
    mock.toastError.mockClear();
  });
  afterEach(cleanup);

  it('내 정보와 누적·오늘 집중 시간, 설정 링크를 보여 주고 등급처럼 없는 정보는 그리지 않는다', () => {
    render(<ProfilePage />);
    const info = screen.getByRole('region', { name: '내 정보' });
    expect(within(info).getByRole('heading', { level: 1, name: '민지' })).toBeInTheDocument();
    expect(within(info).getByText('minji@example.com')).toBeInTheDocument();
    expect(within(info).getByText('누적 집중 시간').nextElementSibling).toHaveTextContent('312시간');
    expect(within(info).getByText(/오전 5시부터/).nextElementSibling).toHaveTextContent('2시간 30분');
    expect(within(info).queryByText(/등급/)).not.toBeInTheDocument();
    expect(within(info).getByRole('link', { name: '설정' })).toHaveAttribute('href', '/settings');
    // 모바일 상단 바의 둥근 설정 링크
    expect(within(screen.getByRole('banner')).getByRole('link', { name: '설정' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('공부 기록 2025')).toBeInTheDocument();
    // 머리와 리포트가 같은 집계(같은 fetchStats·오늘 합계)를 쓴다. 조회는 리포트가 기간에 맞춰 한다.
    expect(screen.getByText('상세 리포트 오늘 9000초')).toBeInTheDocument();
    expect(mock.fetchStats).not.toHaveBeenCalled();
    // 레이아웃이 <main>을 그리므로 페이지는 main을 또 만들지 않는다.
    expect(document.querySelector('main')).toBeNull();
    // 설정은 /settings 화면으로 옮겨 갔다.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('첫 집계 전에는 0 대신 자리 표시를 보여 준다', () => {
    mock.loading = true;
    mock.total = 0;
    render(<ProfilePage />);
    expect(screen.getByText('누적 집중 시간').nextElementSibling).toHaveTextContent('–');
    expect(screen.getByText(/오전 5시부터/).nextElementSibling).toHaveTextContent('–');
  });

  it('로그아웃을 확인하면 정리 로그아웃 후 타이머로 돌아가고, 취소하면 그대로 둔다', async () => {
    render(<ProfilePage />);
    // 데스크톱(내 정보 줄)과 모바일(페이지 맨 아래)에 하나씩 있다.
    const [desktopLogout, mobileLogout] = screen.getAllByRole('button', { name: '로그아웃' });
    fireEvent.click(desktopLogout);
    let dialog = screen.getByRole('alertdialog', { name: '로그아웃할까요?' });
    expect(dialog).toHaveAccessibleDescription('공부 기록은 계정에 남아 있어요. 다시 로그인하면 그대로 볼 수 있어요.');
    expect(within(dialog).getByRole('button', { name: '로그아웃' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mock.signOut).not.toHaveBeenCalled();

    fireEvent.click(mobileLogout);
    dialog = screen.getByRole('alertdialog', { name: '로그아웃할까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(mock.replace).toHaveBeenCalledWith('/'));
    expect(mock.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('로그아웃에 실패하면 알리고 대화상자를 열어 둔다', async () => {
    mock.signOut.mockResolvedValueOnce({ error: new Error('network') });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProfilePage />);
    fireEvent.click(screen.getAllByRole('button', { name: '로그아웃' })[0]);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(mock.toastError).toHaveBeenCalledWith('로그아웃하지 못했어요. 다시 시도해 주세요.'));
    expect(mock.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('로그아웃 상태에서는 개인 기록 없이 로그인 안내만 보여 준다', () => {
    mock.session = null;
    render(<ProfilePage />);
    expect(screen.getByText('로그인하면 공부 기록과 상세 리포트를 볼 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '내 정보' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^상세 리포트/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
    expect(mock.fetchStats).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '로그인하기' }));
    expect(screen.getByText('로그인 창')).toBeInTheDocument();
  });
});
