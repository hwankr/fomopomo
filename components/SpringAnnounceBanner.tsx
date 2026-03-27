'use client';

import { useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from './ThemeProvider';
import {
  readSettingsSnapshot,
  writeSettingsSnapshot,
  subscribeSettings,
  DEFAULT_FOMOPOMO_SETTINGS,
} from './timer/hooks/settingsStore';

const DISMISS_KEY = 'spring_announce_dismissed';

function isDismissed() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(DISMISS_KEY) === 'true';
}

export default function SpringAnnounceBanner() {
  const [visible, setVisible] = useState(() => !isDismissed());
  const [isClosing, setIsClosing] = useState(false);

  const { theme } = useTheme();
  const isSpringTheme = theme === 'spring';

  const seasonalEffectEnabled = useSyncExternalStore(
    subscribeSettings,
    () => readSettingsSnapshot().seasonalEffectEnabled,
    () => DEFAULT_FOMOPOMO_SETTINGS.seasonalEffectEnabled,
  );

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, 'true');
    setIsClosing(true);
    setTimeout(() => setVisible(false), 300);
  };

  const handleToggleTheme = () => {
    const next = isSpringTheme ? 'light' : 'spring';
    window.localStorage.setItem('theme', next);
    window.dispatchEvent(new Event('themeChanged'));
  };

  const handleToggleEffect = () => {
    const settings = readSettingsSnapshot();
    writeSettingsSnapshot({
      ...settings,
      seasonalEffectEnabled: !settings.seasonalEffectEnabled,
    });
  };

  if (!isMounted || !visible) return null;

  const toggleBase = 'w-10 h-5 rounded-full relative transition-colors duration-200 ease-in-out cursor-pointer';
  const toggleDot = 'absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out';

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm',
          isClosing
            ? 'animate-out fade-out duration-300'
            : 'animate-in fade-in duration-300'
        )}
        onClick={dismiss}
      />
      <div
        className={cn(
          'fixed left-1/2 top-1/2 z-[9999] -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm',
          isClosing
            ? 'animate-out fade-out zoom-out-95 duration-300'
            : 'animate-in fade-in zoom-in-95 duration-500'
        )}
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-pink-100 via-rose-50 to-pink-50 px-6 pt-6 pb-4 text-center">
            <button
              onClick={dismiss}
              aria-label="닫기"
              className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-4xl mb-2">🌸</div>
            <h2 className="text-lg font-bold text-gray-800">봄 테마가 추가되었습니다</h2>
            <p className="text-sm text-gray-500 mt-1">
              따뜻한 봄 색상과 벚꽃 효과를 사용해 보세요.
            </p>
          </div>

          {/* Toggles */}
          <div className="px-6 py-4 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-700 text-sm font-medium">🌷 봄 테마</span>
                <p className="text-[11px] text-gray-400 mt-0.5">따뜻한 핑크 톤의 색상 테마입니다.</p>
              </div>
              <button
                onClick={handleToggleTheme}
                className={`${toggleBase} ${isSpringTheme ? 'bg-pink-400' : 'bg-gray-300'}`}
              >
                <span className={`${toggleDot} ${isSpringTheme ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-700 text-sm font-medium">🌸 벚꽃 효과</span>
                <p className="text-[11px] text-gray-400 mt-0.5">화면에 벚꽃이 흩날립니다.</p>
              </div>
              <button
                onClick={handleToggleEffect}
                className={`${toggleBase} ${seasonalEffectEnabled ? 'bg-pink-400' : 'bg-gray-300'}`}
              >
                <span className={`${toggleDot} ${seasonalEffectEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-1 flex flex-col gap-2">
            <button
              onClick={dismiss}
              className="w-full py-2.5 bg-pink-500 text-white font-bold rounded-xl hover:bg-pink-600 transition-colors text-sm"
            >
              확인
            </button>
            <button
              onClick={dismiss}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              다시 보지 않기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
