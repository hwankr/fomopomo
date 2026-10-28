import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Beads, { Bead, buildBeadStates } from '../Beads';

const states = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('.ui-bead')).map((bead) => bead.getAttribute('data-state'));

describe('buildBeadStates', () => {
  it('orders done, current and planned beads before empty ones', () => {
    expect(buildBeadStates({ done: 2, current: true, planned: 1, total: 6 }))
      .toEqual(['done', 'done', 'current', 'planned', 'empty', 'empty']);
  });

  it('caps the row at total and grows without one', () => {
    expect(buildBeadStates({ done: 5, total: 3 })).toEqual(['done', 'done', 'done']);
    expect(buildBeadStates({ done: 1, planned: 2 })).toEqual(['done', 'planned', 'planned']);
    expect(buildBeadStates({ total: 0 })).toEqual([]);
  });
});

describe('Beads', () => {
  afterEach(() => cleanup());

  it('exposes one accessible summary and hides the individual beads', () => {
    render(<Beads label="뽀모도로 2 / 4" done={2} total={4} />);

    const row = screen.getByRole('img', { name: '뽀모도로 2 / 4' });
    expect(states(row)).toEqual(['done', 'done', 'empty', 'empty']);
    row.querySelectorAll('.ui-bead').forEach((bead) => expect(bead).toHaveAttribute('aria-hidden', 'true'));
    expect(row.style.getPropertyValue('--bead-size')).toBe('8px');
    expect(row.style.gap).toBe('4px');
  });

  it('accepts explicit states, mode tone, size and stacking direction', () => {
    render(
      <Beads
        label="화요일 뽀모도로 3개"
        states={['past', 'past', 'current']}
        tone="rest"
        size={10}
        gap={6}
        direction="column-reverse"
      />,
    );

    const column = screen.getByRole('img', { name: '화요일 뽀모도로 3개' });
    expect(states(column)).toEqual(['past', 'past', 'current']);
    expect(column).toHaveAttribute('data-bead-tone', 'rest');
    expect(column).toHaveClass('flex-col-reverse');
    expect(column.style.getPropertyValue('--bead-size')).toBe('10px');
  });

  it('renders a single decorative bead', () => {
    const { container } = render(<Bead state="planned" size={6} />);

    const bead = container.querySelector('.ui-bead');
    expect(bead).toHaveAttribute('data-state', 'planned');
    expect(bead).toHaveAttribute('aria-hidden', 'true');
    expect(bead).toHaveAttribute('data-bead-tone', 'pomo');
  });
});

// happy-dom은 CSS 변수 상속을 계산하지 못하므로 globals.css의 구슬 규칙 구조를 확인한다
// (실제 브라우저 계산 결과는 리디자인 보고서에 기록).
describe('bead colour overrides', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start));
  };

  it('lets an ancestor --bead-on win over every mode tone', () => {
    for (const tone of ['pomo', 'rest', 'watch']) {
      const toneRule = rule(`[data-bead-tone='${tone}']`);
      expect(toneRule).toContain(`--bead-tone: var(--color-${tone});`);
      expect(toneRule).not.toContain('--bead-on');
      expect(toneRule).not.toContain('--bead-off');
    }
    expect(rule(".ui-bead[data-state='current']")).toBeTruthy();
    expect(css).toContain('background: var(--bead-on, var(--bead-tone, var(--color-pomo)));');
    expect(css).toContain('background: var(--bead-off, var(--color-bead));');
    expect(css).toContain('background: var(--bead-planned, var(--color-pomo-soft));');
    expect(css).toContain('background: var(--bead-past, var(--color-bead-past));');
  });
});
