import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ playMotion: vi.fn() }));

vi.mock('@/components/ui/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/motion')>()),
  playMotion: motion.playMotion,
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
  beforeEach(() => motion.playMotion.mockClear());
  afterEach(cleanup);

  it('pops the value it stepped to without replacing the input, and stays still while typing', () => {
    render(<FocusStepper />);
    const input = screen.getByRole('spinbutton', { name: '집중 시간 (분)' });

    fireEvent.click(screen.getByRole('button', { name: '집중 늘리기' }));
    expect(input).toHaveValue(30);
    expect(motion.playMotion).toHaveBeenCalledTimes(1);
    expect(motion.playMotion).toHaveBeenCalledWith(input.parentElement, [{ transform: 'scale(1.08)', offset: 0.45 }], { duration: 'emphasized', easing: 'pop' });

    fireEvent.change(input, { target: { value: '42' } });
    expect(motion.playMotion).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '집중 줄이기' }));
    expect(screen.getByRole('spinbutton', { name: '집중 시간 (분)' })).toBe(input);
    expect(input).toHaveValue(40);
    expect(motion.playMotion).toHaveBeenCalledTimes(2);
  });
});
