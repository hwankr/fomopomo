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

import SeasonalEffect from '../SeasonalEffect';
import { ThemeProvider } from '../ThemeProvider';

const SETTINGS_KEY = 'fomopomo_settings';
const THEME_KEY = 'theme';

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <SeasonalEffect />
    </ThemeProvider>
  );
}

describe('SeasonalEffect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark', 'seasonal-spring');
    // Set spring theme so the effect renders
    window.localStorage.setItem(THEME_KEY, 'spring');
    window.dispatchEvent(new Event('themeChanged'));
  });

  it('renders by default when no persisted settings exist and theme is spring', () => {
    const { container } = renderWithTheme();

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('hides when persisted settings disable seasonal effect', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ seasonalEffectEnabled: false })
    );

    const { container } = renderWithTheme();

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('hides when theme is not spring', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    window.dispatchEvent(new Event('themeChanged'));

    const { container } = renderWithTheme();

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('updates when settingsChanged is dispatched after a toggle write', async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ seasonalEffectEnabled: true })
    );

    const { container } = renderWithTheme();

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    act(() => {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ seasonalEffectEnabled: false })
      );
      window.dispatchEvent(new Event('settingsChanged'));
    });

    await waitFor(() => {
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    });
  });

  it('falls back to enabled when persisted JSON is invalid', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    window.localStorage.setItem(SETTINGS_KEY, 'not-json');

    const { container } = renderWithTheme();

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('migrates old snowEnabled field to seasonalEffectEnabled', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ snowEnabled: false })
    );

    const { container } = renderWithTheme();

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
