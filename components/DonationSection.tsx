'use client';

import { Coffee, Heart } from 'lucide-react';

interface DonationSectionProps {
  variant?: 'card' | 'inline' | 'minimal';
  showDescription?: boolean;
}

// 플레이스홀더 링크 (실제 송금 링크로 교체 필요)
const KAKAO_PAY_LINK = '#kakao-placeholder';
const TOSS_LINK = '#toss-placeholder';

// 카카오 아이콘 SVG
const KakaoIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3C6.477 3 2 6.463 2 10.667c0 2.666 1.692 5.016 4.247 6.387-.187.702-.68 2.545-.778 2.939-.122.49.18.483.378.351.156-.104 2.476-1.68 3.478-2.358.558.079 1.126.121 1.702.121 5.523 0 10-3.463 10-7.667S17.523 3 12 3z"/>
  </svg>
);

// 토스 아이콘 (이미지)
const TossIcon = ({ className }: { className?: string }) => (
  <img 
    src="/toss-icon.png" 
    alt="Toss" 
    className={`${className} rounded-full`}
    style={{ objectFit: 'contain' }}
  />
);

export default function DonationSection({ 
  variant = 'card',
  showDescription = true 
}: DonationSectionProps) {
  
  // 카드형 (별도 페이지용) - 모바일 최적화
  if (variant === 'card') {
    return (
      <div className="w-full max-w-md mx-auto p-5 sm:p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-amber-200/50 dark:border-slate-700 shadow-lg">
        <div className="text-center space-y-4">
          {/* 아이콘 */}
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full shadow-lg">
            <Coffee className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>
          
          {/* 타이틀 */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
              개발자에게 커피 한 잔 ☕
            </h3>
            {showDescription && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Fomopomo가 도움이 되셨나요?<br />
                후원금은 서버 유지와 기능 개선에 사용됩니다.
              </p>
            )}
          </div>
          
          {/* 버튼들 - 모바일에서 세로 배치 */}
          <div className="flex flex-col gap-3 pt-2">
            <a
              href={KAKAO_PAY_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3.5 min-h-[48px] bg-[#FEE500] hover:bg-[#FDD835] active:bg-[#F5D000] text-[#3C1E1E] font-semibold rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              <KakaoIcon className="w-5 h-5" />
              카카오페이로 후원
            </a>
            
            <a
              href={TOSS_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3.5 min-h-[48px] bg-[#0064FF] hover:bg-[#0052CC] active:bg-[#0047B3] text-white font-semibold rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              <TossIcon className="w-5 h-5" />
              토스로 후원
            </a>
          </div>
          
          {/* 부가 안내 */}
          <p className="text-xs text-gray-500 dark:text-gray-500 pt-1">
            💝 소중한 후원에 감사드립니다
          </p>
        </div>
      </div>
    );
  }
  
  // 인라인형 (Footer용) - 모바일 최적화
  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-amber-200/30 dark:border-slate-700/50">
        {/* 상단: 아이콘 + 텍스트 */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full shadow-sm">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">
              개발자 후원하기
            </p>
            {showDescription && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                커피 한 잔의 응원이 큰 힘이 됩니다 ☕
              </p>
            )}
          </div>
        </div>
        
        {/* 버튼들 - 모바일: 가로 균등 배치, 터치 영역 충분히 */}
        <div className="flex gap-2">
          <a
            href={KAKAO_PAY_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#FEE500] hover:bg-[#FDD835] active:bg-[#F5D000] text-[#3C1E1E] text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
          >
            <KakaoIcon className="w-4 h-4" />
            카카오페이
          </a>
          <a
            href={TOSS_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#0064FF] hover:bg-[#0052CC] active:bg-[#0047B3] text-white text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
          >
            <TossIcon className="w-4 h-4" />
            토스
          </a>
        </div>
      </div>
    );
  }
  
  // 미니멀형 (설정 모달용) - 모바일 최적화
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Coffee className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          개발자 후원
        </span>
      </div>
      
      {showDescription && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          서비스가 마음에 드셨다면, 커피 한 잔으로 응원해주세요!
        </p>
      )}
      
      {/* 버튼들 - 터치 친화적 크기 */}
      <div className="flex gap-2">
        <a
          href={KAKAO_PAY_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#FEE500] hover:bg-[#FDD835] active:bg-[#F5D000] text-[#3C1E1E] text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
        >
          <KakaoIcon className="w-4 h-4" />
          카카오페이
        </a>
        <a
          href={TOSS_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#0064FF] hover:bg-[#0052CC] active:bg-[#0047B3] text-white text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
        >
          <TossIcon className="w-4 h-4" />
          토스
        </a>
      </div>
    </div>
  );
}
