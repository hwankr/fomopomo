'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_FOMOPOMO_SETTINGS,
  readSettingsSnapshot,
  subscribeSettings,
} from './timer/hooks/settingsStore';

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

const CHRISTMAS_COLORS: Record<ParticleType, string[]> = {
  snowflake: ['#FFFFFF', '#E8F4FF', '#D4EAFF'],
  star: ['#FFD700', '#FFC107', '#FFE082'],
  sparkle: ['#FFFFFF', '#FFD700', '#FF6B6B', '#98FB98'],
};

const seededValue = (seed: number) => {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
};

const buildParticles = (): Particle[] =>
  Array.from({ length: 60 }, (_, index) => {
    const id = index + 1;
    const typeRoll = seededValue(id * 17.13);

    let type: ParticleType = 'snowflake';
    if (typeRoll > 0.85) type = 'star';
    else if (typeRoll > 0.75) type = 'sparkle';

    const colors = CHRISTMAS_COLORS[type];
    const color = colors[Math.floor(seededValue(id * 23.71) * colors.length)];

    return {
      id: index,
      left: seededValue(id * 31.97) * 100,
      animationDuration: 10 + seededValue(id * 43.51) * 15,
      opacity: 0.4 + seededValue(id * 59.27) * 0.5,
      size:
        type === 'star'
          ? 8 + seededValue(id * 71.83) * 8
          : 4 + seededValue(id * 71.83) * 6,
      delay: seededValue(id * 89.11) * 12,
      type,
      color,
    };
  });

export default function SnowEffect() {
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const isEnabled = useSyncExternalStore(
    subscribeSettings,
    () => readSettingsSnapshot().snowEnabled,
    () => DEFAULT_FOMOPOMO_SETTINGS.snowEnabled
  );

  const particles = useMemo(() => buildParticles(), []);

  if (!isMounted || !isEnabled) return null;

  return (
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
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-full w-full drop-shadow-sm"
            >
              <path
                d="M12 0L12 24M0 12L24 12M3.5 3.5L20.5 20.5M20.5 3.5L3.5 20.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          )}
          {particle.type === 'star' && (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-full w-full drop-shadow-md"
            >
              <path d="M12 2L14.5 9H22L16 13.5L18.5 21L12 16.5L5.5 21L8 13.5L2 9H9.5L12 2Z" />
            </svg>
          )}
          {particle.type === 'sparkle' && (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-full w-full drop-shadow"
            >
              <circle cx="12" cy="12" r="4" />
            </svg>
          )}
        </div>
      ))}

      <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-red-500 via-green-500 to-red-500 opacity-40" />

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
  );
}
