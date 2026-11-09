// iOS WebKit plays audible media elements in the exclusive `MediaPlayback`
// category, which stops audio from other apps (e.g. a music app). `ambient`
// mixes with other audio and follows the ring/silent switch. Browsers without
// the Audio Session API keep their existing behavior.

// Minimal local shape: the DOM lib has no AudioSession type yet, and a
// module-local name cannot clash with one added later.
type AudioSessionLike = { type: string };

const isAudioSession = (value: unknown): value is AudioSessionLike =>
  typeof value === 'object' && value !== null && 'type' in value;

let hasWarned = false;

export const requestAmbientAudioSession = (): void => {
  try {
    if (typeof navigator === 'undefined' || !('audioSession' in navigator)) return;
    const session = navigator.audioSession;
    if (!isAudioSession(session)) return;
    session.type = 'ambient';
  } catch (error) {
    // Called before every playback; warn once per page instead of per sound.
    if (hasWarned) return;
    hasWarned = true;
    console.warn('Unable to set ambient audio session:', error);
  }
};
