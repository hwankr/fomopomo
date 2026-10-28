// 움직임 토큰을 JS(Web Animations)에서 쓰기 위한 도구. 규칙은 docs/design-system.md §8.
// CSS 애니메이션은 동작 줄이기 설정에서 globals.css가 시간을 0으로 만들지만,
// element.animate()는 그 규칙을 받지 않으므로 여기서 직접 확인한다.

export type MotionDuration = 'instant' | 'enter' | 'exit' | 'emphasized' | 'sheet-enter' | 'sheet-exit';
export type MotionEasing = 'enter' | 'exit' | 'pop' | 'sheet';

// globals.css @theme의 값과 같다. 토큰을 읽지 못하는 환경(테스트 등)에서만 쓴다.
const FALLBACK_DURATIONS: Record<MotionDuration, number> = {
  instant: 150,
  enter: 200,
  exit: 140,
  emphasized: 240,
  'sheet-enter': 280,
  'sheet-exit': 200,
};

const FALLBACK_EASINGS: Record<MotionEasing, string> = {
  enter: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  pop: 'cubic-bezier(0.3, 0, 0.2, 1)',
  sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
};

// 애니메이션이 끝나지 않을 때(탭이 숨겨져 멈춤 등) 기다리는 최대 시간
const MAX_WAIT_MS = 1000;

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** :root의 CSS 변수 값(예: readCssToken('--color-ink')). 읽지 못하면 빈 문자열. */
export function readCssToken(name: string) {
  if (typeof document === 'undefined') return '';
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseTime(value: string) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  return value.endsWith('ms') ? amount : value.endsWith('s') ? amount * 1000 : null;
}

/** --duration-{name}을 밀리초로 */
export function motionDuration(name: MotionDuration) {
  return parseTime(readCssToken(`--duration-${name}`)) ?? FALLBACK_DURATIONS[name];
}

/** --ease-{name} */
export function motionEasing(name: MotionEasing) {
  return readCssToken(`--ease-${name}`) || FALLBACK_EASINGS[name];
}

type AnimateOptions = {
  duration?: MotionDuration;
  easing?: MotionEasing;
  /** 'add'면 요소에 이미 있는 transform 위에 더한다. */
  composite?: CompositeOperation;
};

/**
 * 토큰으로 Web Animation을 한 번 재생한다. 동작 줄이기 설정이거나 브라우저가 지원하지 않으면
 * 아무것도 하지 않는다(null). fill이 없으므로 끝나면 요소는 원래 스타일로 돌아간다.
 */
export function playMotion(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  { duration = 'enter', easing = 'enter', composite }: AnimateOptions = {},
) {
  if (!element || typeof element.animate !== 'function' || prefersReducedMotion()) return null;
  return element.animate(keyframes, {
    duration: motionDuration(duration),
    easing: motionEasing(easing),
    composite,
  });
}

/** 요소들에서 지금 돌고 있는 유한한 애니메이션(CSS 애니메이션·전환 포함). 무한 반복(로딩 등)은 뺀다. */
export function getRunningAnimations(elements: (Element | null | undefined)[], { subtree = false } = {}) {
  return elements.flatMap((element) => {
    if (!element || typeof element.getAnimations !== 'function') return [];
    return element.getAnimations({ subtree }).filter((animation) => {
      if (animation.playState === 'finished' || animation.playState === 'idle') return false;
      const iterations = animation.effect?.getTiming().iterations ?? 1;
      return Number.isFinite(iterations);
    });
  });
}

function endTime(animation: Animation) {
  const timing = animation.effect?.getComputedTiming();
  const end = Number(timing?.endTime ?? 0);
  const current = Number(animation.currentTime ?? 0);
  return Number.isFinite(end) ? Math.max(0, end - current) : MAX_WAIT_MS;
}

/**
 * 애니메이션들이 모두 끝나면(취소돼도) onDone을 한 번 부른다. 애니메이션이 없으면 바로 부른다.
 * animationend를 놓쳐도 남은 시간 + 여유(최대 1초) 뒤에는 반드시 부른다. 돌려준 함수로 취소한다.
 */
export function whenAnimationsFinish(animations: Animation[], onDone: () => void) {
  if (animations.length === 0) {
    onDone();
    return () => {};
  }
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    onDone();
  };
  const fallback = Math.min(MAX_WAIT_MS, Math.max(...animations.map(endTime)) + 100);
  const timer = window.setTimeout(finish, fallback);
  Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(finish);
  return () => {
    settled = true;
    window.clearTimeout(timer);
  };
}
