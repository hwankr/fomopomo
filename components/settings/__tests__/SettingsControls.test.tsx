import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ playPop: vi.fn() }));

vi.mock('@/components/ui/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/motion')>()),
  playPop: motion.playPop,
}));

import { Stepper } from '../SettingsControls';
import type { NumberField } from '../useSettingsForm';

function FocusStepper() {
  const [value, setValue] = useState<NumberField>(25);
  return (
    <Stepper
      inputLabel="집중 시간 (분)"
      decreaseLabel="집중 줄이기"
      increaseLabel="집중 늘리기"
      value={value}
      fallback={25}
      onChange={setValue}
      unit="분"
      step={5}
      min={1}
      max={999}
    />
  );
}

describe('Stepper', () => {
  beforeEach(() => motion.playPop.mockClear());
  afterEach(cleanup);

  it('pops the value it stepped to without replacing the input, and stays still while typing', () => {
    render(<FocusStepper />);
    const input = screen.getByRole('spinbutton', { name: '집중 시간 (분)' });

    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    expect(input).toHaveValue(30);
    // CSS ui-pop과 같은 공용 팝(playPop)을 값 칸에 재생한다.
    expect(motion.playPop).toHaveBeenCalledTimes(1);
    expect(motion.playPop).toHaveBeenCalledWith(input.parentElement);

    fireEvent.change(input, { target: { value: '42' } });
    expect(motion.playPop).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '집중 줄이기' }));
    expect(screen.getByRole('spinbutton', { name: '집중 시간 (분)' })).toBe(input);
    expect(input).toHaveValue(40);
    expect(motion.playPop).toHaveBeenCalledTimes(2);
  });
});
