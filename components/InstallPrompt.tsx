'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
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
const PROMPT_COOLDOWN_DAYS = 7;

function shouldShowPrompt() {
  if (typeof window === 'undefined') return false;

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

export default function InstallPrompt() {
  const [installContext] = useState<InstallContext>(getInstallContext);
  const [isIOSPromptVisible, setIsIOSPromptVisible] = useState(
    installContext.isIOS
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

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

    setIsClosing(true);
    setTimeout(() => {
      setIsIOSPromptVisible(false);
      setShowAndroidPrompt(false);
      setIsClosing(false);
    }, 300);
  };

  if (!installContext.canShowPrompt || installContext.isStandalone) {
    return null;
  }

  if (isIOSPromptVisible) {
    return (
      <>
        <div
          className={cn(
            'fixed inset-0 z-50 bg-black/20',
            isClosing
              ? 'animate-out fade-out duration-300'
              : 'animate-in fade-in duration-300'
          )}
          onClick={handleClose}
        />
        <div
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/90 p-4 pb-8 shadow-lg backdrop-blur-md',
            isClosing
              ? 'animate-out fade-out slide-out-to-bottom duration-300'
              : 'animate-in slide-in-from-bottom duration-500'
          )}
        >
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 p-1 text-gray-400 transition-colors hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="mx-auto flex max-w-md flex-col items-center space-y-3 text-center">
            <p className="text-sm font-medium text-gray-800">
              Install this app for faster access.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Tap</span>
              <Share className="h-5 w-5 text-blue-500" />
              <span>then choose Add to Home Screen.</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (showAndroidPrompt) {
    return (
      <>
        <div
          className={cn(
            'fixed inset-0 z-50 bg-black/20',
            isClosing
              ? 'animate-out fade-out duration-300'
              : 'animate-in fade-in duration-300'
          )}
          onClick={handleClose}
        />
        <div
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/90 p-4 pb-8 shadow-lg backdrop-blur-md',
            isClosing
              ? 'animate-out fade-out slide-out-to-bottom duration-300'
              : 'animate-in slide-in-from-bottom duration-500'
          )}
        >
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 p-1 text-gray-400 transition-colors hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="mx-auto flex max-w-md flex-col items-center space-y-3 text-center">
            <p className="text-sm font-medium text-gray-800">
              Install this app for faster access.
            </p>
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 font-medium text-white transition-colors hover:bg-rose-600"
            >
              <Download className="h-4 w-4" />
              Install app
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}
