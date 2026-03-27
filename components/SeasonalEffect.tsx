'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  DEFAULT_FOMOPOMO_SETTINGS,
  readSettingsSnapshot,
  subscribeSettings,
} from './timer/hooks/settingsStore';
import { useTheme } from './ThemeProvider';

const PETAL_COLORS = [
  '#FFB7C5', '#FFC4D0', '#FFD1DC', '#FDE2E8',
  '#FFFFFF', '#F8A4B8', '#FF9EBA',
];
const VEIN_COLOR = '#FF8FAA';
const WIND_VALUE = 15 / 50;
const SPEED_MULTIPLIER = 50 / 50;

interface Petal {
  x: number;
  y: number;
  sz: number;
  color: string;
  opacity: number;
  rot: number;
  rotSpd: number;
  phase: number;
  amp: number;
  freq: number;
  vy: number;
  depth: number;
}

function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function makePetal(w: number, h: number, startFromTop: boolean): Petal {
  return {
    x: Math.random() * w * 1.2 - w * 0.1,
    y: startFromTop ? -Math.random() * h * 0.3 - 20 : Math.random() * h,
    sz: 4 + Math.random() * 10,
    color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    opacity: 0.4 + Math.random() * 0.6,
    rot: Math.random() * Math.PI * 2,
    rotSpd: (Math.random() - 0.5) * 0.04,
    phase: Math.random() * Math.PI * 2,
    amp: 20 + Math.random() * 40,
    freq: 0.005 + Math.random() * 0.01,
    vy: 0.3 + Math.random() * 0.7,
    depth: 0.4 + Math.random() * 0.6,
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = p.opacity * p.depth;

  const s = p.sz * p.depth;

  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.8, -s * 0.6, s * 0.8, s * 0.3, 0, s);
  ctx.bezierCurveTo(-s * 0.8, s * 0.3, -s * 0.8, -s * 0.6, 0, -s);
  ctx.fill();

  ctx.globalAlpha = p.opacity * p.depth * 0.3;
  ctx.strokeStyle = VEIN_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.7);
  ctx.quadraticCurveTo(s * 0.15, 0, 0, s * 0.7);
  ctx.stroke();

  ctx.restore();
}

export default function SeasonalEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const { theme } = useTheme();

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isEnabled = useSyncExternalStore(
    subscribeSettings,
    () => readSettingsSnapshot().seasonalEffectEnabled,
    () => DEFAULT_FOMOPOMO_SETTINGS.seasonalEffectEnabled,
  );

  const shouldRender = isEnabled && theme === 'spring';

  useEffect(() => {
    if (!shouldRender || !isMounted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const petalCount = isMobile() ? 30 : 60;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx!.scale(dpr, dpr);
    }
    resize();

    const petals: Petal[] = [];
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    for (let i = 0; i < petalCount; i++) {
      petals.push(makePetal(w, h, false));
    }

    let time = 0;

    function frame() {
      if (!canvas || !ctx) return;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;

      ctx.clearRect(0, 0, cw, ch);
      time += 0.016;

      for (const p of petals) {
        p.y += p.vy * SPEED_MULTIPLIER * p.depth;
        p.x += Math.sin(p.phase + time * p.freq * 60) * p.amp * 0.01 + WIND_VALUE * p.depth;
        p.rot += p.rotSpd * SPEED_MULTIPLIER;

        if (p.y > ch + 20) {
          p.y = -20;
          p.x = Math.random() * cw * 1.2 - cw * 0.1;
        }
        if (p.x > cw + 40) p.x = -30;
        if (p.x < -40) p.x = cw + 30;

        drawPetal(ctx, p);
      }

      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);

    const handleResize = () => {
      resize();
      const newW = canvas.offsetWidth;
      const newH = canvas.offsetHeight;
      for (const p of petals) {
        p.x = Math.random() * newW * 1.2 - newW * 0.1;
        p.y = Math.random() * newH;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [shouldRender, isMounted]);

  if (!isMounted || !shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9998]"
      aria-hidden="true"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
