'use client';

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Download, Share, X } from 'lucide-react';
import ModalDialog from './ui/ModalDialog';
import { cn } from '../lib/utils';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallContext = {
  canShowPrompt: boolean;
  isIOS: boolean;
  isStandalone: boolean;
};

type IOSNavigator = Navigator & {
  standalone?: boolean;
};

const PROMPT_DISMISSED_KEY = 'pwa_prompt_dismissed_at';
const PROMPT_PERMANENTLY_DISMISSED_KEY = 'pwa_prompt_permanently_dismissed';
const PROMPT_COOLDOWN_DAYS = 7;

function isPromptPermanentlyDismissed() {
  if (typeof window === 'undefined') return false;

  return (
    window.localStorage.getItem(PROMPT_PERMANENTLY_DISMISSED_KEY) === 'true'
  );
}

function shouldShowPrompt() {
  if (typeof window === 'undefined') return false;
  if (isPromptPermanentlyDismissed()) return false;

  const dismissedAt = window.localStorage.getItem(PROMPT_DISMISSED_KEY);
  if (!dismissedAt) return true;

  const dismissedDate = new Date(Number.parseInt(dismissedAt, 10));
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - dismissedDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > PROMPT_COOLDOWN_DAYS;
}

function getInstallContext(): InstallContext {
  if (typeof window === 'undefined') {
    return {
      canShowPrompt: false,
      isIOS: false,
      isStandalone: false,
    };
  }

  const navigatorWithStandalone = window.navigator as IOSNavigator;

  return {
    canShowPrompt: shouldShowPrompt(),
    isIOS: /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()),
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      navigatorWithStandalone.standalone === true,
  };
}

const subscribeToHydration = () => () => {};

export default function InstallPrompt() {
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  // Browser-only context is read after server/client hydration agrees on null.
  return isHydrated ? <BrowserInstallPrompt /> : null;
}

function BrowserInstallPrompt() {
  const [installContext] = useState<InstallContext>(getInstallContext);
  const [isIOSPromptVisible, setIsIOSPromptVisible] = useState(
    installContext.isIOS
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const hidePrompt = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsIOSPromptVisible(false);
      setShowAndroidPrompt(false);
      setIsClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!installContext.canShowPrompt || installContext.isStandalone) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      setShowAndroidPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
    };
  }, [installContext.canShowPrompt, installContext.isStandalone]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowAndroidPrompt(false);
    }
  };

  const handleClose = () => {
    window.localStorage.setItem(PROMPT_DISMISSED_KEY, Date.now().toString());
    hidePrompt();
  };

  const handlePermanentDismiss = () => {
    window.localStorage.setItem(PROMPT_PERMANENTLY_DISMISSED_KEY, 'true');
    hidePrompt();
  };

  if (!installContext.canShowPrompt || installContext.isStandalone) {
    return null;
  }

  if (isIOSPromptVisible) {
    return (
      <PromptSurface isClosing={isClosing} onClose={handleClose}>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
          <span>공유 버튼을 누른 뒤</span>
          <Share aria-hidden="true" className="size-[18px] text-ink" strokeWidth={1.8} />
          <span>홈 화면에 추가를 선택하세요.</span>
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handlePermanentDismiss}
            className="ui-button-secondary flex-1 md:flex-none"
          >
            다시 보지 않기
          </button>
        </div>
      </PromptSurface>
    );
  }

  if (showAndroidPrompt) {
    return (
      <PromptSurface isClosing={isClosing} onClose={handleClose}>
        <div className="flex gap-2 md:justify-end">
          <button
            type="button"
            onClick={handlePermanentDismiss}
            className="ui-button-secondary flex-1 md:flex-none"
          >
            다시 보지 않기
          </button>
          <button
            type="button"
            onClick={handleInstallClick}
            className="ui-button-primary flex-1 md:flex-none"
          >
            <Download aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
            앱 설치하기
          </button>
        </div>
      </PromptSurface>
    );
  }

  return null;
}

// 설치 안내 면: ModalDialog(덮개를 누르거나 Escape로 닫힘, 다음 안내까지 쉬는 기간을 남긴다).
// 패널은 대화상자 대신 아래쪽에 뜨는 팝오버 모양이다. 모바일은 가장자리에서 12px 안쪽, 데스크톱은 오른쪽 아래 360px.
function PromptSurface({
  isClosing,
  onClose,
  children,
}: {
  isClosing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <ModalDialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      closeOnOverlayClick
      overlayClassName={cn(
        'p-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:items-end md:justify-end md:p-6',
        isClosing ? 'opacity-0 transition-opacity duration-300' : 'animate-fade-in'
      )}
      className={cn(
        'gap-3 rounded-panel p-5 shadow-popover md:w-[360px]',
        isClosing
          ? 'translate-y-1 opacity-0 transition-[opacity,translate] duration-300'
          : 'ui-panel-enter'
      )}
    >
      <div className="flex items-start gap-3">
        <h2 id={titleId} className="m-0 flex-1 pt-2 text-[15px] font-bold">
          더 빠르게 이용하려면 앱을 설치하세요.
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="설치 안내 닫기"
          className="ui-icon-button -mt-1 -mr-2 text-ink-muted"
        >
          <X aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </button>
      </div>
      {children}
    </ModalDialog>
  );
}
