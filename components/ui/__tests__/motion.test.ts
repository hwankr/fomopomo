import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRunningAnimations,
  motionDuration,
  motionEasing,
  playMotion,
  prefersReducedMotion,
  whenAnimationsFinish,
} from '../motion';

const ORIGINAL_MATCH_MEDIA = window.matchMedia;

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: matches && query.includes('prefers-reduced-motion'), media: query }),
  });
}

function fakeAnimation({ playState = 'running', iterations = 1, endTime = 140 } = {}) {
  let finish!: () => void;
  let cancel!: () => void;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    cancel = () => reject(new DOMException('cancelled', 'AbortError'));
  });
  const animation = {
    playState,
    currentTime: 0,
    finished,
    effect: { getTiming: () => ({ iterations }), getComputedTiming: () => ({ endTime }) },
  } as unknown as Animation;
  return { animation, finish, cancel };
}

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.removeProperty('--duration-enter');
  document.documentElement.style.removeProperty('--ease-enter');
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: ORIGINAL_MATCH_MEDIA });
  delete (Element.prototype as { animate?: unknown }).animate;
});

describe('motion tokens', () => {
  it('reads durations in ms or s from :root and falls back to the documented values', () => {
    expect(motionDuration('enter')).toBe(200);
    expect(motionDuration('sheet-enter')).toBe(280);
    document.documentElement.style.setProperty('--duration-enter', '.18s');
    expect(motionDuration('enter')).toBe(180);
    document.documentElement.style.setProperty('--duration-enter', '120ms');
    expect(motionDuration('enter')).toBe(120);
  });

  it('reads easings from :root with a fallback', () => {
    expect(motionEasing('enter')).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
    document.documentElement.style.setProperty('--ease-enter', 'linear');
    expect(motionEasing('enter')).toBe('linear');
  });

  it('follows prefers-reduced-motion', () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('playMotion', () => {
  it('does nothing without Web Animations support or with reduced motion', () => {
    const element = document.createElement('div');
    expect(playMotion(element, [{ opacity: 0, offset: 0 }])).toBeNull();

    const animate = vi.fn(() => ({}) as Animation);
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    setReducedMotion(true);
    expect(playMotion(element, [{ opacity: 0, offset: 0 }])).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('plays the keyframes with token timing', () => {
    const animate = vi.fn(() => ({}) as Animation);
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const element = document.createElement('div');

    playMotion(element, [{ transform: 'translateY(6px)', offset: 0 }], { duration: 'emphasized', easing: 'pop', composite: 'add' });

    expect(animate).toHaveBeenCalledWith([{ transform: 'translateY(6px)', offset: 0 }], {
      duration: 240,
      easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
      composite: 'add',
    });
  });
});

describe('getRunningAnimations', () => {
  it('returns finite running animations only, and nothing without support', () => {
    const element = document.createElement('div');
    expect(getRunningAnimations([element, null])).toEqual([]);

    const exit = fakeAnimation().animation;
    const spinner = fakeAnimation({ iterations: Infinity }).animation;
    const done = fakeAnimation({ playState: 'finished' }).animation;
    const getAnimations = vi.fn(() => [exit, spinner, done]);
    Object.defineProperty(element, 'getAnimations', { value: getAnimations });

    expect(getRunningAnimations([element], { subtree: true })).toEqual([exit]);
    expect(getAnimations).toHaveBeenCalledWith({ subtree: true });
  });
});

describe('whenAnimationsFinish', () => {
  it('calls back synchronously when nothing runs', () => {
    const onDone = vi.fn();
    whenAnimationsFinish([], onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('waits for every animation, also when one is cancelled', async () => {
    const onDone = vi.fn();
    const first = fakeAnimation();
    const second = fakeAnimation();
    whenAnimationsFinish([first.animation, second.animation], onDone);

    first.finish();
    await Promise.resolve();
    expect(onDone).not.toHaveBeenCalled();
    second.cancel();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('falls back to a timeout shortly after the expected end, and can be cancelled', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    whenAnimationsFinish([fakeAnimation({ endTime: 200 }).animation], onDone);
    vi.advanceTimersByTime(299);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const stop = whenAnimationsFinish([fakeAnimation().animation], cancelled);
    stop();
    vi.advanceTimersByTime(2000);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
