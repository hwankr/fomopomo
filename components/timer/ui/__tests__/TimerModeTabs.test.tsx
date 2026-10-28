import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimerModeTabs } from '../TimerModeTabs';

describe('TimerModeTabs', () => {
  it('exposes one tablist with the selected mode', () => {
    render(<TimerModeTabs value="shortBreak" onSelect={vi.fn()} panelId="panel" />);

    expect(screen.getByRole('tablist', { name: '타이머 모드' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['뽀모도로', '짧은 휴식', '긴 휴식', '스톱워치']);
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('짧은 휴식');
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(selected).toHaveAttribute('aria-controls', 'panel');
    expect(screen.getByRole('tab', { name: '뽀모도로' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus with the arrow keys without switching modes, and selects on click', () => {
    const onSelect = vi.fn();
    render(<TimerModeTabs value="focus" onSelect={onSelect} panelId="panel" />);

    const focusTab = screen.getByRole('tab', { name: '뽀모도로' });
    focusTab.focus();
    fireEvent.keyDown(focusTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '짧은 휴식' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { name: '스톱워치' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(focusTab).toHaveFocus();
    fireEvent.keyDown(focusTab, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: '스톱워치' })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: '스톱워치' }));
    expect(onSelect).toHaveBeenCalledWith('stopwatch');
  });
});
