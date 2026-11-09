import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RequestAmbientAudioSession = typeof import('../audioSession').requestAmbientAudioSession;

let requestAmbientAudioSession: RequestAmbientAudioSession;

const installAudioSession = (session: { type: string }) => {
  Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
};

describe('requestAmbientAudioSession', () => {
  beforeEach(async () => {
    // A fresh module keeps the once-per-page warning independent of test order.
    vi.resetModules();
    ({ requestAmbientAudioSession } = await import('../audioSession'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'audioSession');
    vi.restoreAllMocks();
  });

  it('does nothing when the browser has no audio session API', () => {
    expect('audioSession' in navigator).toBe(false);

    expect(() => requestAmbientAudioSession()).not.toThrow();

    expect('audioSession' in navigator).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('switches the page audio session from auto to ambient', () => {
    const session = { type: 'auto' };
    installAudioSession(session);

    requestAmbientAudioSession();
    expect(session.type).toBe('ambient');

    requestAmbientAudioSession();
    expect(session.type).toBe('ambient');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('swallows a rejected assignment and warns at most once per page', () => {
    const attempts: string[] = [];
    installAudioSession({
      get type() { return 'auto'; },
      set type(value: string) {
        attempts.push(value);
        throw new DOMException('Audio session unavailable', 'InvalidStateError');
      },
    });

    expect(() => {
      requestAmbientAudioSession();
      requestAmbientAudioSession();
      requestAmbientAudioSession();
    }).not.toThrow();

    expect(attempts).toEqual(['ambient', 'ambient', 'ambient']);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      'Unable to set ambient audio session:',
      expect.objectContaining({ name: 'InvalidStateError' }),
    );
  });
});
