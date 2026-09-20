import { useCallback, useEffect, useRef } from 'react';

interface UseSoundProps {
  volume: number;
  isMuted: boolean;
}

type SoundName = 'alarm' | 'click';

interface Sound {
  audio: HTMLAudioElement;
  playId: number;
  hasLoadError: boolean;
}

export const useSound = ({ volume, isMuted }: UseSoundProps) => {
  const soundsRef = useRef<Partial<Record<SoundName, Sound>>>({});

  useEffect(() => {
    const sounds: Record<SoundName, Sound> = {
      alarm: { audio: new Audio('/alarm.mp3'), playId: 0, hasLoadError: false },
      click: { audio: new Audio('/click-v2.wav'), playId: 0, hasLoadError: false },
    };
    const cleanups = Object.entries(sounds).map(([name, sound]) => {
      const { audio } = sound;
      const onError = () => {
        sound.playId += 1;
        sound.hasLoadError = true;
        audio.pause();
        console.warn(`Unable to load ${name} sound:`, audio.error);
      };

      audio.preload = 'auto';
      audio.addEventListener('error', onError);
      audio.load();

      return () => {
        sound.playId += 1;
        audio.removeEventListener('error', onError);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      };
    });
    soundsRef.current = sounds;

    return () => {
      soundsRef.current = {};
      cleanups.forEach(cleanup => cleanup());
    };
  }, []);

  useEffect(() => {
    Object.values(soundsRef.current).forEach(sound => {
      sound.audio.volume = Math.min(1, Math.max(0, volume / 100));
      sound.audio.muted = isMuted;
      if (isMuted) {
        sound.playId += 1;
        sound.audio.pause();
      }
    });
  }, [volume, isMuted]);

  const playSound = useCallback((name: SoundName) => {
    const sound = soundsRef.current[name];
    if (isMuted || !sound) return;

    const { audio } = sound;
    const playId = ++sound.playId;
    const onFailure = (error: unknown) => {
      // Retriggering, muting or unmounting intentionally interrupts pending play().
      if (sound.playId !== playId || (error instanceof Error && error.name === 'AbortError')) return;
      audio.pause();
      console.warn(`Unable to play ${name} sound:`, error);
    };

    try {
      audio.pause();
      if (sound.hasLoadError) {
        sound.hasLoadError = false;
        audio.load();
      }
      audio.currentTime = 0;
      audio.volume = Math.min(1, Math.max(0, volume / 100));
      audio.muted = isMuted;
      void audio.play().catch(onFailure);
    } catch (error) {
      onFailure(error);
    }
  }, [isMuted, volume]);

  const playAlarm = useCallback(() => playSound('alarm'), [playSound]);
  const playClickSound = useCallback(() => playSound('click'), [playSound]);

  return { playAlarm, playClickSound };
};
