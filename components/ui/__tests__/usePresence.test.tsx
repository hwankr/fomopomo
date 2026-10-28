import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePresence } from '../usePresence';

function Panel({ open }: { open: boolean }) {
  const { ref, mounted, closing, key } = usePresence<HTMLDivElement>(open);
  if (!mounted) return null;
  return <div ref={ref} data-testid="panel" data-state={closing ? 'closed' : 'open'} data-key={key} />;
}

describe('usePresence', () => {
  afterEach(() => {
    cleanup();
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  });

  it('mounts on open and unmounts in the same commit when no exit animation runs', () => {
    const { rerender } = render(<Panel open={false} />);
    expect(screen.queryByTestId('panel')).toBeNull();

    rerender(<Panel open />);
    expect(screen.getByTestId('panel')).toHaveAttribute('data-state', 'open');

    rerender(<Panel open={false} />);
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('stays mounted as closing until the exit animation finishes, with a new key on reopen', async () => {
    let finish!: () => void;
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element) {
        if (this.getAttribute('data-state') !== 'closed') return [];
        const finished = new Promise<void>((resolve) => { finish = resolve; });
        return [{ playState: 'running', currentTime: 0, finished, effect: { getTiming: () => ({ iterations: 1 }), getComputedTiming: () => ({ endTime: 140 }) } }];
      },
    });
    const { rerender } = render(<Panel open />);
    const first = screen.getByTestId('panel');
    expect(first).toHaveAttribute('data-key', '1');

    rerender(<Panel open={false} />);
    expect(screen.getByTestId('panel')).toHaveAttribute('data-state', 'closed');

    rerender(<Panel open />);
    expect(screen.getByTestId('panel')).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('panel')).toHaveAttribute('data-key', '2');

    rerender(<Panel open={false} />);
    await act(async () => finish());
    expect(screen.queryByTestId('panel')).toBeNull();
  });
});
