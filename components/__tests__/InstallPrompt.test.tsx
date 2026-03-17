import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InstallPrompt from '../InstallPrompt';

const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ORIGINAL_MATCH_MEDIA = window.matchMedia;
const ORIGINAL_USER_AGENT = window.navigator.userAgent;

type BeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function mockBrowser({
  userAgent = IOS_USER_AGENT,
  standalone = false,
}: {
  userAgent?: string;
  standalone?: boolean;
} = {}) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: standalone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      media: '(display-mode: standalone)',
      onchange: null,
    })),
  });
}

function dispatchBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  event.preventDefault = vi.fn();
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'dismissed' });
  window.dispatchEvent(event);
  return event;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    window.localStorage.clear();
    mockBrowser();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: ORIGINAL_USER_AGENT,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: ORIGINAL_MATCH_MEDIA,
    });
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the iOS install instructions when the prompt is eligible', () => {
    render(<InstallPrompt />);

    expect(
      screen.getByText('Install this app for faster access.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Don't show again" })
    ).toBeInTheDocument();
  });

  it('stores a cooldown dismissal when the close button is clicked', () => {
    render(<InstallPrompt />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close install prompt' }));
      vi.runAllTimers();
    });

    expect(window.localStorage.getItem('pwa_prompt_dismissed_at')).not.toBeNull();
    expect(
      window.localStorage.getItem('pwa_prompt_permanently_dismissed')
    ).toBeNull();
  });

  it('stores a permanent dismissal and hides the prompt', () => {
    render(<InstallPrompt />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: "Don't show again" }));
      vi.runAllTimers();
    });

    expect(
      window.localStorage.getItem('pwa_prompt_permanently_dismissed')
    ).toBe('true');

    expect(
      screen.queryByText('Install this app for faster access.')
    ).not.toBeInTheDocument();
  });

  it('does not render when the prompt was permanently dismissed earlier', () => {
    window.localStorage.setItem('pwa_prompt_permanently_dismissed', 'true');

    render(<InstallPrompt />);

    expect(
      screen.queryByText('Install this app for faster access.')
    ).not.toBeInTheDocument();
  });

  it('keeps the install CTA while adding permanent dismiss on the Android prompt', () => {
    mockBrowser({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    });

    render(<InstallPrompt />);

    act(() => {
      dispatchBeforeInstallPrompt();
    });

    expect(
      screen.getByRole('button', { name: 'Install app' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Don't show again" })
    ).toBeInTheDocument();
  });
});
