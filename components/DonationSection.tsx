'use client';

import { Coffee } from 'lucide-react';

interface DonationSectionProps {
  variant?: 'card' | 'inline' | 'minimal';
  showDescription?: boolean;
}

const BMC_LINK = 'https://buymeacoffee.com/hwankr';

export default function DonationSection({
  variant = 'card',
  showDescription = true,
}: DonationSectionProps) {
  // 카드형 (별도 페이지용)
  if (variant === 'card') {
    return (
      <div className="w-full max-w-sm mx-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-8 text-center">
        <div className="mx-auto flex w-14 h-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10">
          <Coffee className="w-7 h-7 text-amber-500" />
        </div>

        <h3 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">
          커피 한 잔 사주기
        </h3>

        {showDescription && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            후원금은 서버 운영과 기능 개선에 쓰입니다.
          </p>
        )}

        <a
          href={BMC_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] bg-[#FFDD00] hover:bg-[#FFCC00] active:bg-[#EEBB00] text-black font-semibold rounded-xl transition-all duration-200 active:scale-[0.98]"
        >
          <Coffee className="w-5 h-5" />
          Buy Me a Coffee
        </a>
      </div>
    );
  }

  // 인라인형 (Footer용)
  if (variant === 'inline') {
    return (
      <a
        href={BMC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFDD00] hover:bg-[#FFCC00] active:bg-[#EEBB00] text-black text-sm font-semibold rounded-lg transition-colors"
      >
        <Coffee className="w-4 h-4" />
        Buy Me a Coffee
      </a>
    );
  }

  // 미니멀형 (설정 모달용)
  return (
    <div className="space-y-2">
      {showDescription && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          커피 한 잔으로 응원해주세요.
        </p>
      )}

      <a
        href={BMC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 min-h-[44px] bg-[#FFDD00] hover:bg-[#FFCC00] active:bg-[#EEBB00] text-black text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
      >
        <Coffee className="w-4 h-4" />
        Buy Me a Coffee
      </a>
    </div>
  );
}
