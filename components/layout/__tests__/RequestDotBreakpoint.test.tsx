import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simulateCssAnimations } from '@/components/ui/__tests__/motionTestUtils';

const navigation = vi.hoisted(() => ({ pathname: '/plan' }));
const shell = vi.hoisted(() => ({ friendRequestCount: 1, friendRequestPulse: 0 }));

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('@/components/layout/ShellProvider', () => ({
  useShell: () => ({ session: null, ...shell }),
}));

import MobileTabBar from '../MobileTabBar';
import NotificationBell from '../NotificationBell';

// 앱 셸처럼 데스크톱 헤더의 종, 모바일 상단 바의 종, 하단 탭 바를 함께 그린다. 너비에 따라 한쪽만 보인다.
function Shell() {
  return (
    <>
      <header data-testid="header" className="hidden md:grid">
        <NotificationBell />
      </header>
      <div data-testid="topbar" className="md:hidden">
        <NotificationBell variant="topbar" />
      </div>
      <MobileTabBar />
    </>
  );
}

// Tailwind의 반응형 숨김: 모바일에서는 `hidden`, 데스크톱(md 이상: 1280, 가로로 돌린 844)에서는 `md:hidden`.
const viewport = { desktop: true };
function hiddenAtViewport(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.classList.contains(viewport.desktop ? 'md:hidden' : 'hidden')) return true;
  }
  return false;
}

const headerDot = () => screen.getByTestId('header').querySelector('button > span[aria-hidden="true"]')!;
const topbarDot = () => screen.getByTestId('topbar').querySelector('button > span[aria-hidden="true"]')!;
const tabDot = () => screen.getByRole('link', { name: /^친구/ }).querySelector('span.relative > span')!;
const dots = () => [headerDot(), topbarDot(), tabDot()];

describe('request dots across breakpoints', () => {
  let animations: ReturnType<typeof simulateCssAnimations>;

  beforeEach(() => {
    navigation.pathname = '/plan';
    shell.friendRequestCount = 1;
    shell.friendRequestPulse = 0;
    viewport.desktop = true;
    animations = simulateCssAnimations({ isHidden: hiddenAtViewport });
  });
  afterEach(() => {
    cleanup();
    animations.restore();
  });

  const newRequest = (rerender: (ui: React.ReactElement) => void) => {
    shell.friendRequestCount += 1;
    shell.friendRequestPulse += 1;
    rerender(<Shell />);
  };
  const resize = async (desktop: boolean) => {
    viewport.desktop = desktop;
    await animations.sync();
  };

  it('pops only the visible bell for a new request and never again when the breakpoint flips', async () => {
    const { rerender } = render(<Shell />);
    dots().forEach((dot) => expect(dot).not.toHaveClass('animate-pop-in'));

    newRequest(rerender);
    const [header, topbar, tab] = dots();
    expect(header).toHaveClass('animate-pop-in');
    expect(animations.isRunning(header)).toBe(true);
    // 숨은 쪽(모바일 상단 바·탭 바)은 돌 것이 없어 바로 뗀다.
    expect(topbar).not.toHaveClass('animate-pop-in');
    expect(tab).not.toHaveClass('animate-pop-in');
    await animations.finish(header);
    expect(header).not.toHaveClass('animate-pop-in');

    // 새 요청 없이 1280 → 390 → 1280 → 390 → 844(가로).
    for (const desktop of [false, true, false, true]) {
      await resize(desktop);
      dots().forEach((dot) => expect(dot).not.toHaveClass('animate-pop-in'));
    }
    expect(dots()).toEqual([header, topbar, tab]);
    expect(animations.started(header)).toBe(1);
    expect(animations.started(topbar)).toBe(0);
    expect(animations.started(tab)).toBe(0);
  });

  it('consumes a pop cut short by a breakpoint change', async () => {
    const { rerender } = render(<Shell />);
    newRequest(rerender);
    const header = headerDot();
    expect(animations.isRunning(header)).toBe(true);

    await resize(false);
    dots().forEach((dot) => expect(dot).not.toHaveClass('animate-pop-in'));
    await resize(true);
    expect(header).not.toHaveClass('animate-pop-in');
    expect(animations.started(header)).toBe(1);
  });

  it('pops the mobile bell and the tab dot once per new request while they are shown', async () => {
    viewport.desktop = false;
    const { rerender } = render(<Shell />);

    newRequest(rerender);
    const [header, topbar, tab] = dots();
    expect(topbar).toHaveClass('animate-pop-in');
    expect(tab).toHaveClass('animate-pop-in');
    expect(header).not.toHaveClass('animate-pop-in');
    await animations.finish();
    expect(topbar).not.toHaveClass('animate-pop-in');
    expect(tab).not.toHaveClass('animate-pop-in');

    // 데스크톱으로 넓혔다 돌아와도(폰 회전 포함) 다시 튀지 않는다.
    await resize(true);
    await resize(false);
    dots().forEach((dot) => expect(dot).not.toHaveClass('animate-pop-in'));
    expect(animations.started(header)).toBe(0);
    expect(animations.started(topbar)).toBe(1);
    expect(animations.started(tab)).toBe(1);

    // 다음 새 요청은 다시 한 번 튄다.
    newRequest(rerender);
    expect(topbarDot()).toHaveClass('animate-pop-in');
    expect(tabDot()).toHaveClass('animate-pop-in');
    expect(animations.started(topbarDot())).toBe(1);
    expect(animations.started(tabDot())).toBe(1);
  });

  it('does not pop a request that arrived while a dot was hidden when it is revealed', async () => {
    viewport.desktop = false;
    const { rerender } = render(<Shell />);
    newRequest(rerender);
    expect(headerDot()).not.toHaveClass('animate-pop-in');
    await animations.finish();

    await resize(true);
    expect(headerDot()).not.toHaveClass('animate-pop-in');
    expect(animations.started(headerDot())).toBe(0);
  });

  it('does not pop any dot under reduced motion', () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }),
    });
    try {
      viewport.desktop = false;
      const { rerender } = render(<Shell />);
      newRequest(rerender);
      dots().forEach((dot) => expect(dot).not.toHaveClass('animate-pop-in'));
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
    }
  });
});
