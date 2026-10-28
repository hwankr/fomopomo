import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteEnter, { getRouteEnterTargets } from '../RouteEnter';

const ORIGINAL_MATCH_MEDIA = window.matchMedia;
const animate = vi.fn(function (this: Element) {
  return { cancel: vi.fn() } as unknown as Animation;
});

const animatedElements = () => [...new Set(animate.mock.contexts as Element[])];
const animationCount = (element: Element) => (animate.mock.contexts as Element[]).filter((context) => context === element).length;
const cancelsOf = (element: Element) => animate.mock.results
  .filter((_, index) => animate.mock.contexts[index] === element)
  .map((result) => (result.value as { cancel: ReturnType<typeof vi.fn> }).cancel);

function Screen({ loading = false }: { loading?: boolean }) {
  if (loading) return <div data-testid="spinner" />;
  return (
    <div data-testid="page">
      <header data-shell-header="" data-testid="header">헤더</header>
      <div data-shell-header="" data-testid="topbar">상단 바</div>
      <div data-testid="intro" />
      <main data-testid="content">본문</main>
    </div>
  );
}

describe('RouteEnter', () => {
  beforeEach(() => {
    animate.mockClear();
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  });

  afterEach(() => {
    cleanup();
    delete (Element.prototype as { animate?: unknown }).animate;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: ORIGINAL_MATCH_MEDIA });
  });

  // 모듈 상태(처음 그리기)를 쓰므로 이 테스트가 맨 앞에 와야 한다.
  it('does not animate the first render (server render + hydration), only later screens', () => {
    const first = render(<RouteEnter><Screen /></RouteEnter>);
    expect(animate).not.toHaveBeenCalled();
    first.unmount();

    render(<RouteEnter><Screen /></RouteEnter>);
    // 데스크톱 헤더와 모바일 상단 바는 그대로, 그 아래 본문만 움직인다.
    expect(animatedElements()).toEqual([screen.getByTestId('intro'), screen.getByTestId('content')]);
    // 투명도와(덧붙이는) 6px 오름을 따로 재생한다.
    expect(animate).toHaveBeenCalledWith([{ opacity: 0, offset: 0 }], expect.objectContaining({ duration: 200 }));
    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translateY(6px)', offset: 0 }],
      expect.objectContaining({ duration: 200, composite: 'add' }),
    );
  });

  it('wraps the screen without a layout box and does not replay on re-renders', () => {
    const { container, rerender } = render(<RouteEnter><Screen /></RouteEnter>);
    expect(container.firstElementChild).toHaveClass('contents');
    animate.mockClear();

    rerender(<RouteEnter><Screen /></RouteEnter>);
    expect(animate).not.toHaveBeenCalled();
  });

  it('animates the real content once the shell header appears after a loading state', async () => {
    const { rerender } = render(<RouteEnter><Screen loading /></RouteEnter>);
    expect(animatedElements()).toEqual([screen.getByTestId('spinner')]);
    animate.mockClear();

    rerender(<RouteEnter><Screen /></RouteEnter>);
    await act(async () => {});
    expect(animatedElements()).toEqual([screen.getByTestId('intro'), screen.getByTestId('content')]);

    animate.mockClear();
    rerender(<RouteEnter><Screen /></RouteEnter>);
    await act(async () => {});
    expect(animate).not.toHaveBeenCalled();
  });

  // 타이머 화면처럼 불러오는 중 상자(같은 div)가 그대로 화면 틀이 되는 경우
  function ReusedRoot({ loading, status = true }: { loading: boolean; status?: boolean }) {
    return (
      <div data-testid="root" role={loading && status ? 'status' : undefined}>
        {loading ? <span data-testid="spinner" /> : (
          <>
            <div data-testid="stage">
              <header data-shell-header="" data-testid="header">헤더</header>
              <div data-shell-header="" data-testid="topbar">상단 바</div>
              <div data-testid="timer">타이머</div>
            </div>
            <section data-testid="sheet">시트</section>
          </>
        )}
      </div>
    );
  }

  it('waits while a reused root shows a loading status, then moves only the blocks below the header, once', async () => {
    const { rerender } = render(<RouteEnter><ReusedRoot loading /></RouteEnter>);
    expect(animate).not.toHaveBeenCalled();

    rerender(<RouteEnter><ReusedRoot loading={false} /></RouteEnter>);
    await act(async () => {});

    expect(animatedElements()).toEqual([screen.getByTestId('timer'), screen.getByTestId('sheet')]);
    for (const id of ['timer', 'sheet']) expect(animationCount(screen.getByTestId(id))).toBe(2);
    for (const id of ['root', 'stage', 'header', 'topbar']) expect(animationCount(screen.getByTestId(id))).toBe(0);

    rerender(<RouteEnter><ReusedRoot loading={false} /></RouteEnter>);
    await act(async () => {});
    expect(animate).toHaveBeenCalledTimes(4);
  });

  it('stops a block that later gains the header before it paints, and never moves anything twice', async () => {
    const { rerender } = render(<RouteEnter><ReusedRoot loading status={false} /></RouteEnter>);
    const root = screen.getByTestId('root');
    expect(animatedElements()).toEqual([root]);

    rerender(<RouteEnter><ReusedRoot loading={false} status={false} /></RouteEnter>);
    await act(async () => {});

    // 머리를 품게 된 상자의 움직임은 멈추고, 머리 바깥 덩어리만 한 번 움직인다.
    expect(cancelsOf(root).every((cancel) => cancel.mock.calls.length === 1)).toBe(true);
    expect(animatedElements()).toEqual([root, screen.getByTestId('timer'), screen.getByTestId('sheet')]);
    for (const id of ['timer', 'sheet', 'root']) expect(animationCount(screen.getByTestId(id))).toBe(2);
    for (const id of ['stage', 'header', 'topbar']) expect(animationCount(screen.getByTestId(id))).toBe(0);
  });

  it('does not move anything with reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query }),
    });
    render(<RouteEnter><Screen /></RouteEnter>);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('getRouteEnterTargets', () => {
  it('returns the largest blocks that do not contain the shell header', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div id="page">
        <div id="stage"><header data-shell-header=""></header><div id="timer"></div></div>
        <section id="sheet"></section>
        <script></script>
      </div>
      <div id="after"></div>`;
    expect(getRouteEnterTargets(root).map((element) => element.id)).toEqual(['timer', 'sheet', 'after']);
  });

  it('leaves both the desktop header and the mobile top bar out, wherever they sit', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div id="page">
        <header data-shell-header=""></header>
        <div id="settings">
          <div data-shell-header="" id="topbar"></div>
          <form id="form"></form>
        </div>
        <footer id="foot"></footer>
      </div>`;
    expect(getRouteEnterTargets(root).map((element) => element.id)).toEqual(['form', 'foot']);
  });

  it('returns the top-level blocks of a screen without a header', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div id="a"></div><div id="b"></div>';
    expect(getRouteEnterTargets(root).map((element) => element.id)).toEqual(['a', 'b']);
  });
});
