import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import SnowEffect from '../SnowEffect';

const SETTINGS_KEY = 'fomopomo_settings';

describe('SnowEffect', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders by default when no persisted settings exist', () => {
    const { container } = render(<SnowEffect />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('hides when persisted settings disable snow', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ snowEnabled: false })
    );

    const { container } = render(<SnowEffect />);

    expect(container.firstChild).toBeNull();
  });

  it('updates when settingsChanged is dispatched after a snow toggle write', async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ snowEnabled: true })
    );

    const { container } = render(<SnowEffect />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    act(() => {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ snowEnabled: false })
      );
      window.dispatchEvent(new Event('settingsChanged'));
    });

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('falls back to enabled when persisted JSON is invalid', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    window.localStorage.setItem(SETTINGS_KEY, 'not-json');

    const { container } = render(<SnowEffect />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
