import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ playMotion: vi.fn() }));

vi.mock('@/components/ui/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/motion')>()),
  playMotion: motion.playMotion,
}));

import ContributionGraph from '@/components/profile/ContributionGraph';

const ORIGINAL_MATCH_MEDIA = window.matchMedia;

function setMobile(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
}

const data = [{ date: '2026-10-27', count: 1800 }, { date: '2025-03-02', count: 6 * 3600 }];
const shifts = () => motion.playMotion.mock.calls.map(([, keyframes]) => keyframes[0].transform);
const beadArea = () => screen.getByRole('group', { name: /하루별 집중 시간$/ }).parentElement?.parentElement;

describe('공부 기록 기간 넘기기 움직임', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    motion.playMotion.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: ORIGINAL_MATCH_MEDIA });
  });

  it('모바일 반기를 넘기면 구슬이 넘긴 쪽에서 들어오고, 처음 그릴 때는 움직이지 않는다', () => {
    setMobile(true);
    render(<ContributionGraph data={data} earliestYear={2025} />);
    expect(motion.playMotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '이전 반기' }));
    expect(screen.getByText('2026년 상반기')).toBeInTheDocument();
    expect(motion.playMotion).toHaveBeenLastCalledWith(beadArea(), [{ opacity: 0, transform: 'translateX(-6px)', offset: 0 }]);

    fireEvent.click(screen.getByRole('button', { name: '다음 반기' }));
    expect(shifts()).toEqual(['translateX(-6px)', 'translateX(6px)']);
  });

  it('데스크톱 연도 탭도 고른 쪽 방향으로 나타나고, 같은 연도를 다시 누르면 움직이지 않는다', () => {
    setMobile(false);
    render(<ContributionGraph data={data} earliestYear={2025} />);

    fireEvent.click(screen.getByRole('button', { name: '2026년' }));
    expect(motion.playMotion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2025년' }));
    fireEvent.click(screen.getByRole('button', { name: '2026년' }));
    expect(shifts()).toEqual(['translateX(-6px)', 'translateX(6px)']);
  });
});
