'use client';

import { useState, useEffect } from 'react';
import { Coffee, X } from 'lucide-react';

interface DonationSectionProps {
  variant?: 'card' | 'inline' | 'minimal';
  showDescription?: boolean;
}

const BMC_LINK = 'https://buymeacoffee.com/hwankr';
const KAKAO_PAY_LINK = 'https://qr.kakaopay.com/Ej7qcSQ9q5dc04976';
const TOSS_LINK = 'supertoss://send?amount=3000&bank=%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%B1%85%ED%81%AC&accountNo=3333141056730&origin=qr';

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

// QR 팝업 모달
function QRModal({ 
  isOpen, 
  onClose, 
  type 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  type: 'kakao' | 'toss';
}) {
  if (!isOpen) return null;

  const isKakao = type === 'kakao';
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* 타이틀 */}
        <div className="text-center mb-4">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isKakao 
              ? 'bg-[#FEE500] text-[#3C1E1E]' 
              : 'bg-[#0064FF] text-white'
          }`}>
            {isKakao ? <KakaoIcon className="w-4 h-4" /> : <TossIcon className="w-4 h-4" />}
            {isKakao ? '카카오페이' : '토스'}
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
            QR 코드를 스캔해주세요
          </p>
        </div>
        
        {/* QR 이미지 */}
        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-xl shadow-inner border border-gray-200">
            <img 
              src={isKakao ? '/kakaopay-qr.png' : '/toss-qr.jpg'}
              alt={isKakao ? '카카오페이 QR' : '토스 QR'}
              className="w-64 h-64 object-contain"
            />
          </div>
        </div>
        
        {/* 금액 표시 */}
        <p className="text-center text-lg font-bold text-gray-900 dark:text-white mt-4">
          3,000원
        </p>
      </div>
    </div>
  );
}

export default function DonationSection({ 
  variant = 'card',
  showDescription = true 
}: DonationSectionProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [qrModal, setQrModal] = useState<'kakao' | 'toss' | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isMobileDevice || isSmallScreen);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 카카오페이/토스 클릭 핸들러
  const handleKakaoClick = () => {
    if (isMobile) {
      window.open(KAKAO_PAY_LINK, '_blank');
    } else {
      setQrModal('kakao');
    }
  };

  const handleTossClick = () => {
    if (isMobile) {
      window.location.href = TOSS_LINK;
    } else {
      setQrModal('toss');
    }
  };

  // 카드형 (별도 페이지용)
  if (variant === 'card') {
    return (
      <>
        <QRModal isOpen={qrModal !== null} onClose={() => setQrModal(null)} type={qrModal || 'kakao'} />
        
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
            
            {/* Buy Me a Coffee 메인 버튼 */}
            <a
              href={BMC_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] bg-[#FFDD00] hover:bg-[#FFCC00] active:bg-[#EEBB00] text-[#000000] font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] shadow-md"
            >
              <Coffee className="w-5 h-5" />
              Buy Me a Coffee
            </a>
            
            {/* 카카오페이/토스 버튼 */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleKakaoClick}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#FEE500] hover:bg-[#FDD835] active:bg-[#F5D000] text-[#3C1E1E] text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
              >
                <KakaoIcon className="w-4 h-4" />
                카카오페이
              </button>
              <button
                onClick={handleTossClick}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#0064FF] hover:bg-[#0052CC] active:bg-[#0047B3] text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
              >
                <TossIcon className="w-4 h-4" />
                토스
              </button>
            </div>
            
            {/* 부가 안내 */}
            <p className="text-xs text-gray-500 dark:text-gray-500">
              💝 소중한 후원에 감사드립니다
            </p>
          </div>
        </div>
      </>
    );
  }
  
  // 인라인형 (Footer용) - BMC만
  if (variant === 'inline') {
    return (
      <a
        href={BMC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFDD00] hover:bg-[#FFCC00] active:bg-[#EEBB00] text-[#000000] text-sm font-semibold rounded-lg transition-colors"
      >
        <Coffee className="w-4 h-4" />
        Buy Me a Coffee
      </a>
    );
  }
  
  // 미니멀형 (설정 모달용) - BMC만
  return (
    <div className="space-y-2">
      {showDescription && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          서비스가 마음에 드셨다면, 커피 한 잔으로 응원해주세요!
        </p>
      )}
      
      <a
        href={BMC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 min-h-[44px] bg-[#FFDD00] hover:bg-[#FFCC00] active:bg-[#EEBB00] text-[#000000] text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
      >
        <Coffee className="w-4 h-4" />
        Buy Me a Coffee
      </a>
    </div>
  );
}
