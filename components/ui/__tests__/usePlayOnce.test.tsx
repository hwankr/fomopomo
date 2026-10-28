import { useRef, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEntrance, usePlayOnce } from '../usePlayOnce';

// 요소마다 따로 끝내거나 취소할 수 있는 가짜 애니메이션. happy-dom에는 Web Animations가 없다.
type Fake = { animation: Animation; finish: () => void; cancel: () => void };
let running: Map<Element, Fake>;

function play(element: Element) {
  let finish!: () => void;
  let cancel!: () => void;
  const animation = {
    playState: 'running' as AnimationPlayState,
    currentTime: 0,
    finished: new Promise<void>((resolve, reject) => {
      finish = () => { animation.playState = 'finished'; resolve(); };
      cancel = () => { animation.playState = 'idle'; reject(new DOMException('cancelled', 'AbortError')); };
    }),
    effect: { getTiming: () => ({ iterations: 1 }), getComputedTiming: () => ({ endTime: 60_000 }) },
  };
  const fake = { animation: animation as unknown as Animation, finish, cancel };
  running.set(element, fake);
  return fake;
}

beforeEach(() => {
  running = new Map();
  // 등장 클래스가 붙은 요소는 그 클래스가 붙는 순간 애니메이션 하나를 돌린다(CSS처럼).
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value(this: Element, options?: { subtree?: boolean }) {
      const elements = [this, ...(options?.subtree ? this.querySelectorAll('*') : [])];
      return elements.flatMap((element) => {
        // 숨겨진(display: none) 요소에는 애니메이션이 없다.
        if (!element.classList.contains('animate-fade-up') || element.closest('[hidden]')) return [];
        const fake = running.get(element) ?? play(element);
        return fake.animation.playState === 'running' ? [fake.animation] : [];
      });
    },
  });
});
afterEach(() => {
  cleanup();
  delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
});

function Editors({ editing }: { editing: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const entering = useEntrance(editing, ref);
  return (
    <div>
      {editing ? (
        <div key={editing} ref={ref} data-testid={editing} className={entering ? 'animate-fade-up' : undefined}>
          {editing}
        </div>
      ) : null}
    </div>
  );
}

describe('useEntrance', () => {
  it('plays once per opening and stays still while open', async () => {
    const { rerender } = render(<Editors editing={null} />);
    rerender(<Editors editing="A" />);
    const a = screen.getByTestId('A');
    expect(a).toHaveClass('animate-fade-up');
    await act(async () => running.get(a)!.finish());
    expect(a).not.toHaveClass('animate-fade-up');
    rerender(<Editors editing="A" />);
    expect(a).not.toHaveClass('animate-fade-up');

    rerender(<Editors editing={null} />);
    rerender(<Editors editing="A" />);
    expect(screen.getByTestId('A')).toHaveClass('animate-fade-up');
  });

  it('keeps B’s entrance when switching from A before A finishes and A is cancelled', async () => {
    const { rerender } = render(<Editors editing={null} />);
    rerender(<Editors editing="A" />);
    const a = screen.getByTestId('A');
    const aAnimation = running.get(a)!;

    rerender(<Editors editing="B" />);
    const b = screen.getByTestId('B');
    expect(b).toHaveClass('animate-fade-up');
    // A가 내려가며 A의 애니메이션이 취소돼도 B의 등장은 그대로 돈다.
    await act(async () => aAnimation.cancel());
    expect(b).toHaveClass('animate-fade-up');
    // B가 끝나야 뗀다.
    await act(async () => running.get(b)!.finish());
    expect(b).not.toHaveClass('animate-fade-up');
  });

  it('does not move what is already open at mount', () => {
    render(<Editors editing="A" />);
    expect(screen.getByTestId('A')).not.toHaveClass('animate-fade-up');
  });
});

function Rows() {
  const ref = useRef<HTMLUListElement>(null);
  const [marker, setMarker] = useState<{ id: string } | null>(null);
  const [rows, setRows] = useState(['A']);
  usePlayOnce(marker, ref, (played) => setMarker((current) => (current === played ? null : current)));
  const add = (id: string) => {
    setRows((current) => [...current, id]);
    setMarker({ id });
  };
  return (
    <>
      <button type="button" onClick={() => add('B')}>add B</button>
      <button type="button" onClick={() => add('C')}>add C</button>
      <ul ref={ref}>
        {rows.map((id) => <li key={id} className={marker?.id === id ? 'animate-fade-up' : undefined}>{id}</li>)}
      </ul>
    </>
  );
}

describe('usePlayOnce', () => {
  it('consumes the marker after its animation, and an older playback never clears a newer marker', async () => {
    render(<Rows />);
    act(() => screen.getByRole('button', { name: 'add B' }).click());
    const b = screen.getByText('B');
    expect(b).toHaveClass('animate-fade-up');
    const bAnimation = running.get(b)!;

    act(() => screen.getByRole('button', { name: 'add C' }).click());
    const c = screen.getByText('C');
    expect(c).toHaveClass('animate-fade-up');
    await act(async () => bAnimation.finish());
    expect(c).toHaveClass('animate-fade-up');
    await act(async () => running.get(c)!.finish());
    expect(screen.getByRole('list').querySelectorAll('.animate-fade-up')).toHaveLength(0);
  });

  it('waits for the restarted animation when the node moves mid-play, and not when it is hidden', async () => {
    render(<Rows />);
    act(() => screen.getByRole('button', { name: 'add B' }).click());
    const b = screen.getByText('B');
    // 옮겨진 노드: 앞의 애니메이션이 취소되고 새 애니메이션이 처음부터 돈다.
    const first = running.get(b)!;
    running.delete(b);
    await act(async () => first.cancel());
    expect(b).toHaveClass('animate-fade-up');
    await act(async () => running.get(b)!.finish());
    expect(b).not.toHaveClass('animate-fade-up');

    // 숨겨진 패널: 취소된 뒤 다시 도는 것이 없으면 바로 떼어, 다시 보여도 돌지 않는다.
    act(() => screen.getByRole('button', { name: 'add C' }).click());
    const c = screen.getByText('C');
    expect(c).toHaveClass('animate-fade-up');
    const list = screen.getByRole('list');
    list.hidden = true;
    await act(async () => running.get(c)!.cancel());
    list.hidden = false;
    expect(c).not.toHaveClass('animate-fade-up');
  });

  it('consumes at once when nothing runs (reduced motion, no animation)', () => {
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    render(<Rows />);
    act(() => screen.getByRole('button', { name: 'add B' }).click());
    expect(screen.getByText('B')).not.toHaveClass('animate-fade-up');
  });
});
