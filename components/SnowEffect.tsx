'use client';

/**
 * 🎄 크리스마스 효과 컴포넌트
 * - 내리는 눈/별/반짝이 애니메이션
 * 
 * 🔧 관리자 삭제 방법:
 * 1. 이 파일 삭제: components/SnowEffect.tsx
 * 2. layout.tsx에서 import 및 <SnowEffect /> 제거
 * 3. SettingsModal.tsx에서 snowEnabled 관련 코드 제거 (선택)
 */

import { useEffect, useState, useMemo } from 'react';

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




export default function SnowEffect() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedSettings = localStorage.getItem('fomopomo_settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.snowEnabled === false) {
        setIsEnabled(false);
      }
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'fomopomo_settings' && e.newValue) {
        const settings = JSON.parse(e.newValue);
        setIsEnabled(settings.snowEnabled !== false);
      }
    };

    const handleSettingsChange = () => {
      const savedSettings = localStorage.getItem('fomopomo_settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setIsEnabled(settings.snowEnabled !== false);
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
