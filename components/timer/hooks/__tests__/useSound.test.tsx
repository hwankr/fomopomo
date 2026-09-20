import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSound } from '../useSound';

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];

  src: string;
  preload = '';
  currentTime = 0;
  volume = 1;
  muted = false;
  error = { code: 2, message: 'Network error' };
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  constructor(src: string) {
    super();
    this.src = src;
    MockAudio.instances.push(this);
  }
}

const defaultProps = { volume: 60, isMuted: false };

function deferredPlay() {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

describe('useSound', () => {
  beforeEach(() => {
    MockAudio.instances = [];
    vi.stubGlobal('Audio', MockAudio);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preloads both sounds once without playing them on mount', () => {
    renderHook(() => useSound(defaultProps));

    expect(MockAudio.instances.map(audio => audio.src)).toEqual(['/alarm.mp3', '/click-v2.wav']);
    for (const audio of MockAudio.instances) {
      expect(audio.preload).toBe('auto');
      expect(audio.load).toHaveBeenCalledTimes(1);
      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.volume).toBe(0.6);
    }
  });

  it('reuses and restarts loaded sounds without loading them again', () => {
    const { result } = renderHook(() => useSound(defaultProps));
    const [alarm, click] = MockAudio.instances;

    act(() => {
      result.current.playClickSound();
      click.currentTime = 0.1;
      result.current.playClickSound();
      result.current.playAlarm();
      alarm.currentTime = 1;
      result.current.playAlarm();
    });

    expect(MockAudio.instances).toHaveLength(2);
    for (const audio of [alarm, click]) {
      expect(audio.play).toHaveBeenCalledTimes(2);
      expect(audio.pause).toHaveBeenCalledTimes(2);
      expect(audio.currentTime).toBe(0);
      expect(audio.load).toHaveBeenCalledTimes(1);
    }
  });

  it('requests first-click playback directly, even before preload completes', () => {
    const { result } = renderHook(() => useSound(defaultProps));
    const click = MockAudio.instances[1];
    click.play.mockReturnValueOnce(new Promise(() => {}));

    act(() => result.current.playClickSound());

    expect(click.play).toHaveBeenCalledTimes(1);
    expect(click.load).toHaveBeenCalledTimes(1);
  });

  it('updates live volume and mute settings without recreating sounds', () => {
    const { result, rerender } = renderHook(props => useSound(props), { initialProps: defaultProps });
    const [alarm, click] = MockAudio.instances;
    act(() => result.current.playAlarm());

    rerender({ volume: 25, isMuted: true });
    act(() => {
      result.current.playAlarm();
      result.current.playClickSound();
    });

    for (const audio of [alarm, click]) {
      expect(audio.volume).toBe(0.25);
      expect(audio.muted).toBe(true);
      expect(audio.pause).toHaveBeenCalled();
    }
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(click.play).not.toHaveBeenCalled();

    rerender({ volume: 80, isMuted: false });
    act(() => result.current.playClickSound());
    expect(click.volume).toBe(0.8);
    expect(click.muted).toBe(false);
    expect(click.play).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances).toHaveLength(2);
  });

  it('does not let an older rejected play attempt interrupt a newer click', async () => {
    const { result } = renderHook(() => useSound(defaultProps));
    const click = MockAudio.instances[1];
    const first = deferredPlay();
    click.play.mockReturnValueOnce(first.promise);

    act(() => {
      result.current.playClickSound();
      result.current.playClickSound();
    });
    await act(async () => first.reject(new Error('Older failed request')));

    expect(click.play).toHaveBeenCalledTimes(2);
    expect(click.pause).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('consumes intentional AbortError rejections without warning', async () => {
    const { result } = renderHook(() => useSound(defaultProps));
    const click = MockAudio.instances[1];
    click.play.mockRejectedValueOnce(new DOMException('Interrupted', 'AbortError'));

    await act(async () => result.current.playClickSound());

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('handles rejected and synchronous play failures without throwing', async () => {
    const { result } = renderHook(() => useSound(defaultProps));
    const [alarm, click] = MockAudio.instances;
    alarm.play.mockRejectedValueOnce(new DOMException('Permission required', 'NotAllowedError'));
    click.play.mockImplementationOnce(() => { throw new Error('Playback unavailable'); });

    await act(async () => {
      result.current.playAlarm();
      result.current.playClickSound();
    });

    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(alarm.pause).toHaveBeenCalledTimes(2);
    expect(click.pause).toHaveBeenCalledTimes(2);
  });

  it('cancels failed loads and retries only on a new playback request', async () => {
    const { result } = renderHook(() => useSound(defaultProps));
    const click = MockAudio.instances[1];
    const pending = deferredPlay();
    click.play.mockReturnValueOnce(pending.promise);
    act(() => result.current.playClickSound());

    await act(async () => {
      click.dispatchEvent(new Event('error'));
      pending.reject(new DOMException('No source', 'NotSupportedError'));
    });

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(click.pause).toHaveBeenCalledTimes(2);
    expect(click.load).toHaveBeenCalledTimes(1);
    act(() => result.current.playClickSound());
    expect(click.load).toHaveBeenCalledTimes(2);
    expect(click.play).toHaveBeenCalledTimes(2);
  });

  it('cancels pending playback on mute without replaying it after unmute', async () => {
    const { result, rerender } = renderHook(props => useSound(props), { initialProps: defaultProps });
    const alarm = MockAudio.instances[0];
    const pending = deferredPlay();
    alarm.play.mockReturnValueOnce(pending.promise);
    act(() => result.current.playAlarm());

    rerender({ ...defaultProps, isMuted: true });
    await act(async () => pending.reject(new Error('Cancelled by mute')));
    rerender(defaultProps);

    expect(alarm.pause).toHaveBeenCalledTimes(2);
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('releases audio and ignores late callbacks after unmount', async () => {
    const { result, unmount } = renderHook(() => useSound(defaultProps));
    const [alarm, click] = MockAudio.instances;
    const pending = deferredPlay();
    click.play.mockReturnValueOnce(pending.promise);
    act(() => result.current.playClickSound());
    const stalePlayAlarm = result.current.playAlarm;

    unmount();
    await act(async () => {
      click.dispatchEvent(new Event('error'));
      pending.reject(new Error('Cancelled by unmount'));
      stalePlayAlarm();
    });

    for (const audio of [alarm, click]) {
      expect(audio.pause).toHaveBeenCalled();
      expect(audio.removeAttribute).toHaveBeenCalledWith('src');
      expect(audio.load).toHaveBeenCalledTimes(2);
    }
    expect(alarm.play).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('creates functional fresh sounds after StrictMode effect cleanup', () => {
    const { result } = renderHook(() => useSound(defaultProps), { wrapper: StrictMode });
    const [oldAlarm, oldClick, alarm, click] = MockAudio.instances;

    act(() => {
      result.current.playAlarm();
      result.current.playClickSound();
      oldClick.dispatchEvent(new Event('error'));
    });

    for (const oldAudio of [oldAlarm, oldClick]) {
      expect(oldAudio.src).toBe('');
      expect(oldAudio.play).not.toHaveBeenCalled();
    }
    for (const audio of [alarm, click]) {
      expect(audio.volume).toBe(0.6);
      expect(audio.load).toHaveBeenCalledTimes(1);
      expect(audio.play).toHaveBeenCalledTimes(1);
    }
    expect(console.warn).not.toHaveBeenCalled();
  });
});
