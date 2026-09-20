import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatePicker from '../DatePicker';

function ControlledPicker({ initial = '', min, max, onChange = vi.fn() }: {
  initial?: string;
  min?: string;
  max?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return <DatePicker label="공부 날짜" value={value} min={min} max={max}
    onChange={next => { setValue(next); onChange(next); }} />;
}

const day = (date: string) => screen.getByRole('button', { name: new RegExp(`^${date} `) });

async function openCalendar() {
  fireEvent.click(screen.getByRole('button', { name: '공부 날짜' }));
  return screen.findByRole('dialog', { name: '공부 날짜 달력' });
}

describe('DatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 20, 12) });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('opens the selected local date, selects a day, and returns focus to its trigger', async () => {
    const onChange = vi.fn();
    render(<ControlledPicker initial="2026-09-17" onChange={onChange} />);
    expect(screen.getByRole('button', { name: '공부 날짜' })).toHaveTextContent('2026.09.17 (목)');
    const popup = await openCalendar();

    expect(within(popup).getByRole('grid')).toHaveAccessibleName('2026년 9월');
    await waitFor(() => expect(day('2026년 9월 17일')).toHaveFocus());
    expect(day('2026년 9월 20일')).toHaveAttribute('aria-current', 'date');
    fireEvent.click(day('2026년 9월 22일'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-09-22');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '공부 날짜' })).toHaveTextContent('2026.09.22 (화)');
    await waitFor(() => expect(screen.getByRole('button', { name: '공부 날짜' })).toHaveFocus());
  });

  it('enforces inclusive date bounds for pointer, keyboard, month navigation and today', async () => {
    const onChange = vi.fn();
    render(<ControlledPicker initial="2026-09-17" min="2026-09-15" max="2026-09-18" onChange={onChange} />);
    await openCalendar();

    expect(day('2026년 9월 14일')).toBeDisabled();
    expect(day('2026년 9월 15일')).toBeEnabled();
    expect(day('2026년 9월 18일')).toBeEnabled();
    expect(day('2026년 9월 19일')).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '오늘' })).toBeDisabled();
    fireEvent.click(day('2026년 9월 19일'));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(day('2026년 9월 17일'), { key: 'ArrowDown' });
    await waitFor(() => expect(day('2026년 9월 18일')).toHaveFocus());
    fireEvent.keyDown(day('2026년 9월 18일'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-09-18');
  });

  it('focuses the nearest allowed date when an empty calendar opens outside the range', async () => {
    render(<ControlledPicker min="2026-11-10" max="2026-11-30" />);
    await openCalendar();
    expect(screen.getByRole('grid')).toHaveAccessibleName('2026년 11월');
    await waitFor(() => expect(day('2026년 11월 10일')).toHaveFocus());
  });

  it('moves across a leap-year month edge with arrows and commits with Space', async () => {
    const onChange = vi.fn();
    render(<ControlledPicker initial="2024-02-28" onChange={onChange} />);
    await openCalendar();
    fireEvent.keyDown(day('2024년 2월 28일'), { key: 'ArrowRight' });
    await waitFor(() => expect(day('2024년 2월 29일')).toHaveFocus());
    fireEvent.keyDown(day('2024년 2월 29일'), { key: 'ArrowRight' });
    await waitFor(() => expect(day('2024년 3월 1일')).toHaveFocus());
    expect(screen.getByRole('grid')).toHaveAccessibleName('2024년 3월');
    fireEvent.keyDown(day('2024년 3월 1일'), { key: ' ' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2024-03-01');
  });

  it('supports Home, End, PageUp and PageDown without selecting until Enter', async () => {
    const onChange = vi.fn();
    render(<ControlledPicker initial="2024-01-31" onChange={onChange} />);
    await openCalendar();
    fireEvent.keyDown(day('2024년 1월 31일'), { key: 'PageDown' });
    await waitFor(() => expect(day('2024년 2월 29일')).toHaveFocus());
    fireEvent.keyDown(day('2024년 2월 29일'), { key: 'Home' });
    await waitFor(() => expect(day('2024년 2월 25일')).toHaveFocus());
    fireEvent.keyDown(day('2024년 2월 25일'), { key: 'End' });
    await waitFor(() => expect(day('2024년 3월 2일')).toHaveFocus());
    fireEvent.keyDown(day('2024년 3월 2일'), { key: 'PageUp' });
    await waitFor(() => expect(day('2024년 2월 2일')).toHaveFocus());
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(day('2024년 2월 2일'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2024-02-02');
  });

  it('changes months with navigation controls, clears the value, and can choose today', async () => {
    const onChange = vi.fn();
    render(<ControlledPicker initial="2026-09-17" onChange={onChange} />);
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('grid')).toHaveAccessibleName('2026년 10월');
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByRole('grid')).toHaveAccessibleName('2026년 9월');
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '공부 날짜' })).toHaveTextContent('날짜 선택');

    await openCalendar();
    await waitFor(() => expect(day('2026년 9월 20일')).toHaveFocus());
    expect(screen.getByRole('button', { name: '지우기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-09-20');
  });

  it('closes with Escape without changing the controlled value or closing a surrounding overlay', async () => {
    const onChange = vi.fn();
    const parentKeyDown = vi.fn();
    render(<div onKeyDown={parentKeyDown}><ControlledPicker initial="2026-09-17" onChange={onChange} /></div>);
    await openCalendar();
    fireEvent.keyDown(day('2026년 9월 17일'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: '공부 날짜' })).toHaveFocus());
  });

  it('dismisses on the first outside click after interacting inside the calendar', async () => {
    const onChange = vi.fn();
    render(<><ControlledPicker initial="2026-09-17" onChange={onChange} /><button type="button">달력 밖</button></>);
    await openCalendar();
    // Radix installs its outside pointer listener in the next macrotask so
    // the press that opened a popup cannot immediately dismiss it.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const nextMonth = screen.getByRole('button', { name: '다음 달' });
    fireEvent.pointerDown(nextMonth, { pointerType: 'mouse', button: 0 });
    fireEvent.click(nextMonth);
    const outside = screen.getByRole('button', { name: '달력 밖' });
    fireEvent.pointerDown(outside, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(outside, { pointerType: 'mouse', button: 0 });
    fireEvent.click(outside);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not open while disabled or when min exceeds max', () => {
    const { rerender } = render(<DatePicker label="공부 날짜" value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: '공부 날짜' })).toBeDisabled();
    rerender(<DatePicker label="공부 날짜" value="" onChange={vi.fn()} min="2026-10-01" max="2026-09-01" />);
    expect(screen.getByRole('button', { name: '공부 날짜' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps calendar keyboard controls from triggering a surrounding timer Space shortcut', async () => {
    const onKeyDown = vi.fn();
    render(<div onKeyDown={onKeyDown}><ControlledPicker /></div>);
    fireEvent.keyDown(screen.getByRole('button', { name: '공부 날짜' }), { key: ' ' });
    expect(onKeyDown).not.toHaveBeenCalled();
    await openCalendar();
    fireEvent.keyDown(screen.getByRole('button', { name: '다음 달' }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: '오늘' }), { key: 'Enter' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
