import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InstallPrompt from '../InstallPrompt';

const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ORIGINAL_MATCH_MEDIA = window.matchMedia;
const ORIGINAL_USER_AGENT = window.navigator.userAgent;
const ORIGINAL_STANDALONE = Object.getOwnPropertyDescriptor(
  window.navigator,
  'standalone'
);
const hydratedRoots: { root: Root; container: HTMLDivElement }[] = [];

type BeforeInstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function mockBrowser({
  userAgent = IOS_USER_AGENT,
  standalone = false,
  iosStandalone = false,
}: {
  userAgent?: string;
  standalone?: boolean;
  iosStandalone?: boolean;
} = {}) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    value: iosStandalone,
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

function dispatchBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'dismissed') {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  event.preventDefault = vi.fn();
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

function renderServerHTML(ui: ReactElement) {
  vi.stubGlobal('window', undefined);
  try {
    return renderToString(ui);
  } finally {
    vi.unstubAllGlobals();
  }
}

async function hydrateInstallPrompt(ui: ReactElement = <InstallPrompt />) {
  const serverHTML = renderServerHTML(ui);
  const container = document.createElement('div');
  container.innerHTML = serverHTML;
  document.body.appendChild(container);
  const onRecoverableError = vi.fn();

  await act(async () => {
    const root = hydrateRoot(container, ui, { onRecoverableError });
    hydratedRoots.push({ root, container });
  });

  return { container, serverHTML, onRecoverableError };
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    window.localStorage.clear();
    mockBrowser();
  });

  afterEach(() => {
    for (const { root, container } of hydratedRoots.splice(0)) {
      act(() => root.unmount());
      container.remove();
    }
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
    if (ORIGINAL_STANDALONE) {
      Object.defineProperty(window.navigator, 'standalone', ORIGINAL_STANDALONE);
    } else {
      Reflect.deleteProperty(window.navigator, 'standalone');
    }
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the iOS install instructions when the prompt is eligible', () => {
    render(<InstallPrompt />);

    expect(
      screen.getByText('더 빠르게 이용하려면 앱을 설치하세요.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '다시 보지 않기' })
    ).toBeInTheDocument();
  });

  it('stores a cooldown dismissal when the close button is clicked', () => {
    render(<InstallPrompt />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '설치 안내 닫기' }));
      vi.runAllTimers();
    });

    expect(window.localStorage.getItem('pwa_prompt_dismissed_at')).not.toBeNull();
    expect(
      window.localStorage.getItem('pwa_prompt_permanently_dismissed')
    ).toBeNull();
  });

  it('shows the prompt as a modal dialog and closes it from the backdrop with a cooldown', () => {
    render(<InstallPrompt />);

    const dialog = screen.getByRole('dialog', {
      name: '더 빠르게 이용하려면 앱을 설치하세요.',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const backdrop = dialog.parentElement as HTMLElement;

    // 패널 안을 눌러도 닫히지 않는다.
    fireEvent.click(dialog);
    expect(window.localStorage.getItem('pwa_prompt_dismissed_at')).toBeNull();

    act(() => {
      fireEvent.click(backdrop);
    });
    // 따로 기다리지 않는다: 퇴장 애니메이션이 없으면(테스트 환경·동작 줄이기) 바로 닫힌다.
    expect(window.localStorage.getItem('pwa_prompt_dismissed_at')).not.toBeNull();
    expect(
      window.localStorage.getItem('pwa_prompt_permanently_dismissed')
    ).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps keyboard focus in the prompt, makes the page inert and closes on Escape with a cooldown', () => {
    const { container } = render(
      <>
        <button type="button">배경 버튼</button>
        <InstallPrompt />
      </>
    );

    const close = screen.getByRole('button', { name: '설치 안내 닫기' });
    const neverAgain = screen.getByRole('button', { name: '다시 보지 않기' });
    expect(close).toHaveFocus();
    expect(container).toHaveAttribute('inert');
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(neverAgain).toHaveFocus();
    fireEvent.keyDown(neverAgain, { key: 'Tab' });
    expect(close).toHaveFocus();

    act(() => {
      fireEvent.keyDown(close, { key: 'Escape' });
      vi.advanceTimersByTime(300);
    });

    expect(window.localStorage.getItem('pwa_prompt_dismissed_at')).not.toBeNull();
    expect(
      window.localStorage.getItem('pwa_prompt_permanently_dismissed')
    ).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute('inert');
  });

  it('closes through the shared dialog exit: the page is released at once, the panel leaves after its animation', async () => {
    // 브라우저처럼 닫힌 덮개에서 퇴장 애니메이션이 도는 것으로 꾸민다.
    let finishExit!: () => void;
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element) {
        if (!this.classList.contains('ui-dialog-overlay') || this.getAttribute('data-state') !== 'closed') return [];
        const finished = new Promise<void>((resolve) => { finishExit = resolve; });
        return [{ playState: 'running', currentTime: 0, finished, effect: { getTiming: () => ({ iterations: 1 }), getComputedTiming: () => ({ endTime: 200 }) } }];
      },
    });
    try {
      const { container } = render(
        <>
          <button type="button">배경 버튼</button>
          <InstallPrompt />
        </>
      );
      expect(container).toHaveAttribute('inert');

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '설치 안내 닫기' }));
      });

      const overlay = document.querySelector('.ui-dialog-overlay');
      expect(overlay).toHaveAttribute('data-state', 'closed');
      expect(overlay).toHaveAttribute('inert');
      expect(container).not.toHaveAttribute('inert');
      expect(window.localStorage.getItem('pwa_prompt_dismissed_at')).not.toBeNull();
      // 사라지는 동안에도 마지막 내용(iOS 안내)을 그대로 보여 준다.
      expect(overlay).toHaveTextContent('홈 화면에 추가를 선택하세요.');

      await act(async () => finishExit());
      expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    } finally {
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    }
  });

  it('closes immediately with reduced motion even if an exit animation would run', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => [{ playState: 'running', currentTime: 0, finished: new Promise(() => {}), effect: { getTiming: () => ({ iterations: 1 }), getComputedTiming: () => ({ endTime: 200 }) } }],
    });
    try {
      const { container } = render(
        <>
          <button type="button">배경 버튼</button>
          <InstallPrompt />
        </>
      );

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '다시 보지 않기' }));
      });

      expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
      expect(container).not.toHaveAttribute('inert');
      expect(window.localStorage.getItem('pwa_prompt_permanently_dismissed')).toBe('true');
    } finally {
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    }
  });

  it('stores a permanent dismissal and hides the prompt', () => {
    render(<InstallPrompt />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '다시 보지 않기' }));
      vi.runAllTimers();
    });

    expect(
      window.localStorage.getItem('pwa_prompt_permanently_dismissed')
    ).toBe('true');

    expect(
      screen.queryByText('더 빠르게 이용하려면 앱을 설치하세요.')
    ).not.toBeInTheDocument();
  });

  it('does not render when the prompt was permanently dismissed earlier', () => {
    window.localStorage.setItem('pwa_prompt_permanently_dismissed', 'true');

    render(<InstallPrompt />);

    expect(
      screen.queryByText('더 빠르게 이용하려면 앱을 설치하세요.')
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
      screen.getByRole('button', { name: '앱 설치하기' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '다시 보지 않기' })
    ).toBeInTheDocument();
  });

  it('renders no server markup without consulting browser storage or display mode', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    expect(renderToString(<InstallPrompt />)).toBe('');
    expect(getItem).not.toHaveBeenCalled();
    expect(window.matchMedia).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'hydrates server HTML on iOS without a mismatch (StrictMode: %s)',
    async (strictMode) => {
      const ui = strictMode ? (
        <StrictMode><InstallPrompt /></StrictMode>
      ) : <InstallPrompt />;
      const { serverHTML, onRecoverableError } = await hydrateInstallPrompt(ui);

      expect(serverHTML).toBe('');
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(screen.getByText('더 빠르게 이용하려면 앱을 설치하세요.')).toBeInTheDocument();
    }
  );

  it.each(['permanent', 'cooldown'])(
    'honors a saved %s dismissal after hydration',
    async (dismissal) => {
      if (dismissal === 'permanent') {
        window.localStorage.setItem('pwa_prompt_permanently_dismissed', 'true');
      } else {
        window.localStorage.setItem('pwa_prompt_dismissed_at', String(Date.now()));
      }

      const { container, onRecoverableError } = await hydrateInstallPrompt();

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it.each([
    { standalone: true },
    { iosStandalone: true },
  ])('keeps installed iOS apps hidden after hydration (%j)', async (browser) => {
    mockBrowser(browser);

    const { container, onRecoverableError } = await hydrateInstallPrompt();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the iOS prompt after hydration when the dismissal cooldown has expired', async () => {
    window.localStorage.setItem(
      'pwa_prompt_dismissed_at',
      String(Date.now() - 8 * 24 * 60 * 60 * 1000)
    );

    const { onRecoverableError } = await hydrateInstallPrompt();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(screen.getByText('더 빠르게 이용하려면 앱을 설치하세요.')).toBeInTheDocument();
  });

  it('handles Android installation events and acceptance after hydration', async () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/122.0.0.0' });
    const { container, onRecoverableError } = await hydrateInstallPrompt();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    let installEvent!: BeforeInstallPromptEvent;
    act(() => {
      installEvent = dispatchBeforeInstallPrompt('accepted');
    });

    expect(installEvent.preventDefault).toHaveBeenCalledOnce();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '앱 설치하기' }));
    });

    expect(installEvent.prompt).toHaveBeenCalledOnce();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
