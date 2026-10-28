import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContributionGraph, { getHeatLevel } from '@/components/profile/ContributionGraph';

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

const data = [
  { date: '2026-01-05', count: 9000 },
  { date: '2026-10-27', count: 1800 },
  { date: '2026-10-28', count: 4 * 3600 },
  { date: '2025-03-02', count: 6 * 3600 },
];

describe('공부 기록 구슬 농도', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    setMobile(false);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: ORIGINAL_MATCH_MEDIA });
  });

  it('하루 시간을 다섯 단계 농도로 나눈다', () => {
    expect([0, 59 * 60, 3600, 3 * 3600 - 1, 3 * 3600, 5 * 3600].map(getHeatLevel)).toEqual([0, 1, 2, 2, 3, 4]);
  });

  it('데스크톱은 연도 탭과 1년치 구슬을 그리고, 구슬을 누르면 그날 시간을 알려 준다', () => {
    render(<ContributionGraph data={data} earliestYear={2025} />);
    const years = screen.getByRole('group', { name: '연도' });
    expect(within(years).getAllByRole('button').map(button => button.textContent)).toEqual(['2026년', '2025년']);
    expect(within(years).getByRole('button', { name: '2026년' })).toHaveAttribute('aria-pressed', 'true');

    const grid = screen.getByRole('group', { name: '2026년 하루별 집중 시간' });
    expect(within(grid).getAllByRole('button')).toHaveLength(365);
    expect(screen.getByText('1월')).toBeInTheDocument();
    expect(screen.getByText('12월')).toBeInTheDocument();
    const jan5 = within(grid).getByRole('button', { name: '1월 5일, 2시간 30분' });
    expect(jan5).toHaveClass('bg-heat-2');
    expect(within(grid).getByRole('button', { name: '10월 28일, 4시간' })).toHaveClass('bg-heat-3');
    expect(within(grid).getByRole('button', { name: '10월 26일, 기록 없음' })).toHaveClass('bg-heat-0');
    // 키보드로는 오늘 구슬 하나만 Tab으로 들어온다.
    expect(within(grid).getAllByRole('button').filter(button => button.tabIndex === 0).map(button => button.getAttribute('aria-label'))).toEqual(['10월 28일, 4시간']);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('구슬을 누르면 그날의 집중 시간을 볼 수 있어요');
    fireEvent.click(jan5);
    expect(jan5).toHaveAttribute('aria-pressed', 'true');
    expect(status).toHaveTextContent('1월 5일 월요일, 2시간 30분');
    fireEvent.click(jan5);
    expect(jan5).toHaveAttribute('aria-pressed', 'false');
    expect(status).toHaveTextContent('구슬을 누르면 그날의 집중 시간을 볼 수 있어요');

    fireEvent.click(within(years).getByRole('button', { name: '2025년' }));
    const lastYear = screen.getByRole('group', { name: '2025년 하루별 집중 시간' });
    expect(within(lastYear).getByRole('button', { name: '3월 2일, 6시간' })).toHaveClass('bg-heat-4');
  });

  it('화살표 키로 하루·한 주씩 옮기며 그날을 고른다', () => {
    render(<ContributionGraph data={data} earliestYear={2026} />);
    const today = screen.getByRole('button', { name: '10월 28일, 4시간' });
    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowUp' });
    const yesterday = screen.getByRole('button', { name: '10월 27일, 30분' });
    expect(yesterday).toHaveFocus();
    expect(yesterday).toHaveAttribute('aria-pressed', 'true');
    expect(yesterday.tabIndex).toBe(0);
    expect(today.tabIndex).toBe(-1);
    fireEvent.keyDown(yesterday, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: '10월 20일, 기록 없음' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('10월 20일 화요일, 기록 없음');
  });

  it('모바일은 반기씩 넘기고, 기록이 시작된 반기와 지금 반기에서 멈춘다', () => {
    setMobile(true);
    render(<ContributionGraph data={data} earliestYear={2026} />);
    expect(screen.getByText('2026년 하반기')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '2026년 하반기 하루별 집중 시간' })).getAllByRole('button')).toHaveLength(184);
    expect(screen.queryByRole('group', { name: '연도' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 반기' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '이전 반기' }));
    expect(screen.getByText('2026년 상반기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1월 5일, 2시간 30분' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 반기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 반기' })).toBeEnabled();
  });

  it('첫 집계 전에는 불러오는 중이라고 알려 준다', () => {
    render(<ContributionGraph data={[]} earliestYear={null} loading />);
    expect(screen.getByText('기록을 불러오는 중이에요…')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /하루별 집중 시간/ })).not.toBeInTheDocument();
  });
});
