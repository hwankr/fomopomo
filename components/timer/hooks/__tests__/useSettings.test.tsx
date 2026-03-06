import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

import { useSettings } from '../useSettings';

describe('useSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns a stable snapshot reference when settings have not changed', () => {
    window.localStorage.setItem(
      'fomopomo_settings',
      JSON.stringify({
        pomoTime: 30,
        shortBreak: 10,
        longBreak: 20,
        autoStartBreaks: false,
        autoStartPomos: false,
        longBreakInterval: 4,
        volume: 50,
        isMuted: false,
        taskPopupEnabled: true,
        presets: [{ id: '1', label: '집중', minutes: 30 }],
      })
    );

    const { result, rerender } = renderHook(() => useSettings(0));
    const firstSnapshot = result.current.settings;

    rerender();

    expect(result.current.settings).toBe(firstSnapshot);
  });
});
