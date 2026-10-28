import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FOMOPOMO_SETTINGS } from '../../hooks/settingsStore';
import { TimerSettingsDialog } from '../TimerSettingsDialog';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const settings = {
  ...DEFAULT_FOMOPOMO_SETTINGS,
  presets: [
    { id: 'preset-25', label: '집중', minutes: 25 },
    { id: 'preset-50', label: '집중', minutes: 50 },
  ],
};

const renderDialog = (overrides: Partial<Parameters<typeof TimerSettingsDialog>[0]> = {}) => {
  const props = {
    open: true,
    onClose: vi.fn(),
    settings,
    onSave: vi.fn().mockResolvedValue(true),
    onPresetClick: vi.fn().mockReturnValue(true),
    ...overrides,
  };
  render(<TimerSettingsDialog {...props} />);
  return props;
};

const row = (label: string) => screen.getByRole('group', { name: label });

describe('TimerSettingsDialog', () => {
  it('steps durations from the current settings and saves only on 저장', async () => {
    const props = renderDialog();

    expect(screen.getByRole('dialog', { name: '타이머 설정' })).toBeInTheDocument();
    expect(row('뽀모도로')).toHaveTextContent('25분');
    expect(row('긴 휴식까지 사이클')).toHaveTextContent('4회');

    fireEvent.click(screen.getByRole('button', { name: '뽀모도로 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '뽀모도로 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '짧은 휴식 줄이기' }));
    fireEvent.click(screen.getByRole('button', { name: '긴 휴식까지 사이클 늘리기' }));
    expect(row('뽀모도로')).toHaveTextContent('27분');
    expect(props.onSave).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(props.onSave).toHaveBeenCalledWith({ pomoTime: 27, shortBreak: 4, longBreak: 15, longBreakInterval: 5 });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('keeps the dialog open when saving fails', async () => {
    const props = renderDialog({ onSave: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });
    expect(props.onSave).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('cancels without saving', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '뽀모도로 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('stops at the board bounds but never shortens a longer existing value', () => {
    renderDialog({ settings: { ...settings, shortBreak: 1, longBreakInterval: 8, pomoTime: 120 } });

    expect(screen.getByRole('button', { name: '짧은 휴식 줄이기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '긴 휴식까지 사이클 늘리기' })).toBeDisabled();
    expect(row('뽀모도로')).toHaveTextContent('120분');
    expect(screen.getByRole('button', { name: '뽀모도로 늘리기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '뽀모도로 줄이기' }));
    expect(row('뽀모도로')).toHaveTextContent('119분');
  });

  it('applies a preset right away and closes, telling identical labels apart by minutes', () => {
    const props = renderDialog();

    const preset50 = screen.getByRole('button', { name: '집중 50분' });
    expect(within(preset50).getByText('집중')).toBeInTheDocument();
    expect(within(preset50).getByText('50분')).toBeInTheDocument();
    fireEvent.click(preset50);

    expect(props.onPresetClick).toHaveBeenCalledWith(50);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('stays open when a preset cannot be applied', () => {
    const props = renderDialog({ onPresetClick: vi.fn().mockReturnValue(false) });
    fireEvent.click(screen.getByRole('button', { name: '집중 25분' }));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('pops only the number that was just stepped, not on open', () => {
    renderDialog();
    const number = (label: string) => within(row(label)).getByText(/\d+(분|회)/);
    expect(document.querySelectorAll('.animate-pop')).toHaveLength(0);

    fireEvent.click(within(row('뽀모도로')).getByRole('button', { name: '뽀모도로 늘리기' }));
    expect(number('뽀모도로')).toHaveClass('animate-pop');
    expect(number('짧은 휴식')).not.toHaveClass('animate-pop');
    // 숫자는 알림 영역(aria-live) 안에서 바뀐다.
    expect(number('뽀모도로').parentElement).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(within(row('짧은 휴식')).getByRole('button', { name: '짧은 휴식 줄이기' }));
    expect(number('뽀모도로')).not.toHaveClass('animate-pop');
    expect(number('짧은 휴식')).toHaveClass('animate-pop');
  });

  it('links to the full settings page', () => {
    renderDialog();
    expect(screen.getByRole('link', { name: '과목·알림·계정 설정' })).toHaveAttribute('href', '/settings');
  });
});
