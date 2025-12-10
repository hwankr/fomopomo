'use client';

/**
 * 🎄 크리스마스 효과 컴포넌트
 * - 내리는 눈/별/반짝이 애니메이션
 * - 랜덤 위치 선물 상자 (클릭시 열리고 이동)
 * 
 * 🔧 관리자 삭제 방법:
 * 1. 이 파일 삭제: components/SnowEffect.tsx
 * 2. layout.tsx에서 import 및 <SnowEffect /> 제거
 * 3. SettingsModal.tsx에서 snowEnabled 관련 코드 제거 (선택)
 */

import { useEffect, useState, useMemo, useCallback } from 'react';

type ParticleType = 'snowflake' | 'star' | 'sparkle';

interface Particle {
  id: number;
  left: number;
  animationDuration: number;
  opacity: number;
  size: number;
  delay: number;
  type: ParticleType;
  color: string;
}

const CHRISTMAS_COLORS = {
  snowflake: ['#FFFFFF', '#E8F4FF', '#D4EAFF'],
  star: ['#FFD700', '#FFC107', '#FFE082'],
  sparkle: ['#FFFFFF', '#FFD700', '#FF6B6B', '#98FB98'],
};

// 응원 메시지 목록
const CHEER_MESSAGES = [
  '파이팅! 💪',
  '오늘도 화이팅! 🔥',
  '넌 할 수 있어! ⭐',
  '집중 모드 ON! 🎯',
  '최고야! 👍',
  '잘하고 있어! ✨',
  '끝까지 가보자! 🚀',
  '포기하지 마! 💖',
  '멋져! 🌟',
  '대단해! 🎉',
  '힘내! 🌈',
  '오늘의 주인공! 👑',
];

export default function SnowEffect() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [giftBoxEnabled, setGiftBoxEnabled] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedSettings = localStorage.getItem('fomopomo_settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.snowEnabled === false) {
        setIsEnabled(false);
      }
      if (settings.giftBoxEnabled === false) {
        setGiftBoxEnabled(false);
      }
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'fomopomo_settings' && e.newValue) {
        const settings = JSON.parse(e.newValue);
        setIsEnabled(settings.snowEnabled !== false);
        setGiftBoxEnabled(settings.giftBoxEnabled !== false);
      }
    };

    const handleSettingsChange = () => {
      const savedSettings = localStorage.getItem('fomopomo_settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setIsEnabled(settings.snowEnabled !== false);
        setGiftBoxEnabled(settings.giftBoxEnabled !== false);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('settingsChanged', handleSettingsChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settingsChanged', handleSettingsChange);
    };
  }, []);

  // 눈/별/반짝이 파티클 생성
  const particles: Particle[] = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const rand = Math.random();
      let type: ParticleType = 'snowflake';
      if (rand > 0.85) type = 'star';
      else if (rand > 0.75) type = 'sparkle';

      const colors = CHRISTMAS_COLORS[type];
      const color = colors[Math.floor(Math.random() * colors.length)];

      return {
        id: i,
        left: Math.random() * 100,
        animationDuration: 10 + Math.random() * 15,
        opacity: 0.4 + Math.random() * 0.5,
        size: type === 'star' ? 8 + Math.random() * 8 : 4 + Math.random() * 6,
        delay: Math.random() * 12,
        type,
        color,
      };
    });
  }, []);

  if (!isMounted || !isEnabled) return null;

  return (
    <>
      {/* 🎁 랜덤 위치 선물 상자 */}
      {giftBoxEnabled && <RandomGiftBox />}

      {/* ❄️ 내리는 눈/별/반짝이 */}
      <div 
        className="fixed inset-0 pointer-events-none z-[9998] overflow-hidden"
        aria-hidden="true"
      >
        {particles.map((particle) => (
          <div
            key={particle.id}
            className={`absolute ${particle.type === 'sparkle' ? 'animate-sparkle' : 'animate-snowfall'}`}
            style={{
              left: `${particle.left}%`,
              top: '-20px',
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              animationDuration: `${particle.animationDuration}s`,
              animationDelay: `${particle.delay}s`,
              color: particle.color,
            }}
          >
            {particle.type === 'snowflake' && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="drop-shadow-sm w-full h-full">
                <path d="M12 0L12 24M0 12L24 12M3.5 3.5L20.5 20.5M20.5 3.5L3.5 20.5" 
                  stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
            )}
            {particle.type === 'star' && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="drop-shadow-md w-full h-full">
                <path d="M12 2L14.5 9H22L16 13.5L18.5 21L12 16.5L5.5 21L8 13.5L2 9H9.5L12 2Z" />
              </svg>
            )}
            {particle.type === 'sparkle' && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="drop-shadow w-full h-full">
                <circle cx="12" cy="12" r="4" />
              </svg>
            )}
          </div>
        ))}

        {/* 가랜드 효과 - 상단 장식 끈 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-green-500 to-red-500 opacity-40" />

        <style jsx global>{`
          @keyframes snowfall {
            0% {
              transform: translateY(0) translateX(0) rotate(0deg);
              opacity: 0;
            }
            5% {
              opacity: 1;
            }
            25% {
              transform: translateY(25vh) translateX(15px) rotate(90deg);
            }
            50% {
              transform: translateY(50vh) translateX(-15px) rotate(180deg);
            }
            75% {
              transform: translateY(75vh) translateX(10px) rotate(270deg);
            }
            95% {
              opacity: 1;
            }
            100% {
              transform: translateY(110vh) translateX(-10px) rotate(360deg);
              opacity: 0;
            }
          }

          @keyframes sparkle {
            0% {
              transform: translateY(0) scale(0);
              opacity: 0;
            }
            10% {
              transform: translateY(10vh) scale(1);
              opacity: 1;
            }
            50% {
              transform: translateY(50vh) scale(0.8);
              opacity: 0.8;
            }
            90% {
              transform: translateY(100vh) scale(1);
              opacity: 0.6;
            }
            100% {
              transform: translateY(110vh) scale(0);
              opacity: 0;
            }
          }

          .animate-snowfall {
            animation: snowfall linear infinite;
          }

          .animate-sparkle {
            animation: sparkle ease-in-out infinite;
          }
        `}</style>
      </div>
    </>
  );
}

// 🎁 랜덤 위치 선물 상자 컴포넌트
function RandomGiftBox() {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isOpened, setIsOpened] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // 랜덤 위치 생성 (화면 가장자리 피해서)
  const getRandomPosition = useCallback(() => {
    // 10% ~ 85% 사이로 제한 (버튼/UI 안 가리게)
    const x = 10 + Math.random() * 75;
    const y = 15 + Math.random() * 65; // 상단 navbar, 하단 footer 피하기
    return { x, y };
  }, []);

  // 랜덤 등장 시간 (3~7분 사이 = 180,000ms ~ 420,000ms)
  const getRandomDelay = useCallback(() => {
    return 180000 + Math.random() * 240000; // 3분 + 랜덤 4분
  }, []);

  // 선물 상자 등장시키기
  const showGiftBox = useCallback(() => {
    setPosition(getRandomPosition());
    setIsVisible(true);
  }, [getRandomPosition]);

  // 다음 등장 스케줄
  const scheduleNextAppearance = useCallback(() => {
    const delay = getRandomDelay();
    console.log(`🎁 다음 선물 상자 등장: ${Math.round(delay / 60000)}분 후`);
    setTimeout(() => {
      showGiftBox();
    }, delay);
  }, [getRandomDelay, showGiftBox]);

  useEffect(() => {
    setIsMounted(true);
    // 처음에는 10초 후 첫 등장 (바로 보여주기보다 살짝 기다림)
    const initialTimeout = setTimeout(() => {
      showGiftBox();
    }, 10000);

    return () => clearTimeout(initialTimeout);
  }, [showGiftBox]);

  const handleClick = () => {
    if (isOpened) return;
    
    // 열리는 애니메이션 시작
    setIsOpened(true);
    
    // 메시지 표시
    const msg = CHEER_MESSAGES[Math.floor(Math.random() * CHEER_MESSAGES.length)];
    setMessage(msg);
    
    // 1.8초 후 닫히고 사라짐
    setTimeout(() => {
      setIsOpened(false);
      setMessage(null);
      setIsVisible(false);
      // 다음 등장 스케줄
      scheduleNextAppearance();
    }, 1800);
  };

  if (!isMounted || !isVisible) return null;

  return (
    <div 
      className="fixed z-[9999] pointer-events-auto transition-all duration-700 ease-out"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* 응원 메시지 */}
      {message && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap animate-popUp">
          <span className="text-sm font-bold text-rose-500 dark:text-rose-400 drop-shadow-sm">
            {message}
          </span>
        </div>
      )}
      
      {/* 선물 상자 */}
      <button 
        onClick={handleClick}
        disabled={isOpened}
        className={`w-10 h-10 transition-all duration-300 cursor-pointer ${
          isOpened 
            ? 'scale-125 animate-shake' 
            : 'hover:scale-110 hover:rotate-3'
        }`}
        title="클릭해서 열어보세요! 🎁"
      >
        <svg viewBox="0 0 24 24" className="w-full h-full drop-shadow-lg">
          {isOpened ? (
            // 열린 상자
            <>
              {/* 뚜껑 (위로 올라감) */}
              <g className="animate-lidOpen">
                <rect x="1" y="2" width="22" height="5" rx="1" fill="#DC2626" />
                <rect x="10" y="2" width="4" height="5" fill="#FFD700" />
                <path d="M12 2C12 2 10 -1 8 -1C6 -1 5 0 5 1C5 2 6 2.5 8 2C10 1.5 12 2 12 2Z" fill="#FFD700" />
                <path d="M12 2C12 2 14 -1 16 -1C18 -1 19 0 19 1C19 2 18 2.5 16 2C14 1.5 12 2 12 2Z" fill="#FFD700" />
              </g>
              {/* 상자 본체 */}
              <rect x="2" y="9" width="20" height="13" rx="1" fill="#DC2626" />
              <rect x="10" y="9" width="4" height="13" fill="#FFD700" />
              {/* 반짝이 효과 */}
              <circle cx="6" cy="12" r="1" fill="#FFD700" className="animate-ping" />
              <circle cx="18" cy="14" r="1" fill="#FFD700" className="animate-ping" style={{ animationDelay: '0.2s' }} />
              <circle cx="7" cy="18" r="1" fill="#FFD700" className="animate-ping" style={{ animationDelay: '0.4s' }} />
            </>
          ) : (
            // 닫힌 상자
            <>
              <rect x="2" y="8" width="20" height="14" rx="1" fill="#DC2626" />
              <rect x="2" y="5" width="20" height="4" rx="1" fill="#DC2626" opacity="0.9" />
              <rect x="10" y="5" width="4" height="17" fill="#FFD700" />
              <rect x="2" y="11" width="20" height="3" fill="#FFD700" />
              <path d="M12 5C12 5 10 2 8 2C6 2 5 3 5 4C5 5 6 5.5 8 5C10 4.5 12 5 12 5Z" fill="#FFD700" />
              <path d="M12 5C12 5 14 2 16 2C18 2 19 3 19 4C19 5 18 5.5 16 5C14 4.5 12 5 12 5Z" fill="#FFD700" />
            </>
          )}
        </svg>
      </button>

      <style jsx>{`
        @keyframes popUp {
          0% { 
            opacity: 0; 
            transform: translateX(-50%) translateY(10px) scale(0.5); 
          }
          20% { 
            opacity: 1; 
            transform: translateX(-50%) translateY(0) scale(1.1); 
          }
          40% { 
            transform: translateX(-50%) translateY(0) scale(1); 
          }
          80% { 
            opacity: 1; 
            transform: translateX(-50%) translateY(0) scale(1); 
          }
          100% { 
            opacity: 0; 
            transform: translateX(-50%) translateY(-10px) scale(0.8); 
          }
        }
        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(-10deg); }
          20% { transform: rotate(10deg); }
          30% { transform: rotate(-10deg); }
          40% { transform: rotate(10deg); }
          50% { transform: rotate(-5deg); }
          60% { transform: rotate(5deg); }
          70% { transform: rotate(0deg); }
        }
        @keyframes lidOpen {
          0% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(-15deg); }
          100% { transform: translateY(-5px) rotate(-10deg); }
        }
        .animate-popUp {
          animation: popUp 1.8s ease-out forwards;
        }
        .animate-shake {
          animation: shake 0.6s ease-in-out;
        }
        .animate-lidOpen {
          animation: lidOpen 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
