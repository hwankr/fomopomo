import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BeadState } from '@/components/ui/Beads';
import { StageBeads, balancedBeadRowWidth } from '../stageParts';

const viewport = vi.hoisted(() => ({ desktop: false }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => viewport.desktop }));

// 한 줄에 들어가는 구슬 수(flex-wrap이 채우는 수)
const fitsPerLine = (width: number, size: number, gap: number) => Math.floor((width + gap) / (size + gap));

describe('balancedBeadRowWidth', () => {
  it.each([
    // 구슬 수, 지름, 간격, 쓸 수 있는 폭 → 줄 폭
    [25, 8, 5, 289, 164], // 22 + 3 → 13 + 12
    [25, 8, 5, 329, 320], // 한 줄에 들어가면 그대로
    [27, 8, 5, 340, 177], // 26 + 1 → 14 + 13
    [30, 8, 5, 340, 190], // 26 + 4 → 15 + 15
    [35, 6, 4, 340, 176], // 34 + 1 → 18 + 17
    [50, 6, 4, 340, 246], // 34 + 16 → 25 + 25
    [50, 7, 6, 560, 319], // 데스크톱 43 + 7 → 25 + 25
    [25, 10, 8, 560, 442], // 데스크톱 한 줄
    [1, 8, 5, 289, 8],
  ])('%i beads of %ipx (gap %i) in %ipx → %ipx', (count, size, gap, available, width) => {
    expect(balancedBeadRowWidth(count, size, gap, available)).toBe(width);
  });

  it('keeps one bead per line on a tiny width and needs no width for no beads', () => {
    expect(balancedBeadRowWidth(25, 8, 5, 4)).toBe(8);
    expect(balancedBeadRowWidth(25, 8, 5, 0)).toBe(8);
    expect(balancedBeadRowWidth(0, 8, 5, 289)).toBe(0);
  });

  it('never needs more lines or more width than the available width, and fills every line but the last evenly', () => {
    for (const [size, gap] of [[8, 5], [6, 4], [10, 8], [7, 6]]) {
      for (let count = 2; count <= 60; count += 1) {
        for (let available = size; available <= 600; available += 7) {
          const width = balancedBeadRowWidth(count, size, gap, available);
          const lines = Math.ceil(count / fitsPerLine(available, size, gap));
          const perLine = fitsPerLine(width, size, gap);
          expect(width).toBeLessThanOrEqual(available);
          expect(Math.ceil(count / perLine)).toBe(lines);
          expect(perLine).toBe(Math.ceil(count / lines));
        }
      }
    }
  });
});

describe('StageBeads', () => {
  const beads = (count: number) => Array<BeadState>(count).fill('empty');
  const renderBeads = (count: number) => render(<StageBeads label={`${count}분 중 0분 지남`} states={beads(count)} tone="pomo" />);
  const row = () => screen.getByRole('img');
  const rowMax = () => row().parentElement!.style.getPropertyValue('--stage-beads-max');

  type ResizeEntry = { contentRect: { width: number } };
  const observers: Array<{ callback: (entries: ResizeEntry[]) => void; target: Element | null; disconnect: () => void }> = [];
  class ResizeObserverStub {
    callback: (entries: ResizeEntry[]) => void;
    target: Element | null = null;
    constructor(callback: (entries: ResizeEntry[]) => void) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target: Element) {
      this.target = target;
    }
    disconnect() {
      this.target = null;
    }
  }

  afterEach(() => {
    viewport.desktop = false;
    observers.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('caps the row at the balanced width, guarded by the stage width + 24px', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const view = renderBeads(27);
    // 재기 전에는 340px 안에서 고르게: 26 + 1이 아니라 14 + 13
    expect(rowMax()).toBe('177px');
    expect(row().className.split(/\s+/).filter((name) => name.includes('max-w-'))).toEqual([
      'max-w-[min(var(--stage-beads-max),calc(100%+24px))]',
    ]);
    expect(row()).toHaveClass('flex-wrap', 'justify-center');
    // 폭이 바뀌어도 움직이지 않는다(움직임 줄이기의 전역 전환도 받지 않는다).
    expect(row()).toHaveClass('transition-none');
    expect(row()).toHaveStyle({ gap: '5px', '--bead-size': '8px' });
    view.unmount();

    viewport.desktop = true;
    renderBeads(50);
    expect(rowMax()).toBe('319px');
    expect(row()).toHaveStyle({ gap: '6px', '--bead-size': '7px' });
  });

  it('measures the stage on mount even without a ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const measured = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 285, height: 8 }));
    renderBeads(25);
    expect(measured).toHaveBeenCalled();
    // 285 + 24 = 309px에는 24알이 들어간다 → 24 + 1이 아니라 13 + 12
    expect(rowMax()).toBe('164px');
  });

  it('re-balances when the stage width changes and stops watching on unmount', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const view = renderBeads(25);
    const observer = observers.find((item) => item.target === row().parentElement);
    expect(observer).toBeTruthy();
    expect(rowMax()).toBe('320px');

    act(() => observer!.callback([{ contentRect: { width: 285 } }]));
    expect(rowMax()).toBe('164px');
    // 숨어서 0이 되면 마지막으로 잰 폭을 그대로 쓴다.
    act(() => observer!.callback([{ contentRect: { width: 0 } }]));
    expect(rowMax()).toBe('164px');
    act(() => observer!.callback([{ contentRect: { width: 335 } }]));
    expect(rowMax()).toBe('320px');

    const disconnect = vi.spyOn(observer!, 'disconnect');
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(observer!.target).toBeNull();
  });
});
