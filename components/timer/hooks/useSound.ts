import { useCallback } from 'react';

interface UseSoundProps {
  volume: number;
  isMuted: boolean;
}

export const useSound = ({ volume, isMuted }: UseSoundProps) => {
  const playAlarm = useCallback(() => {
    if (isMuted) return;
    try {
      const audio = new Audio('/alarm.mp3');
      audio.volume = volume / 100;
      audio.play();
    } catch (error) {
      console.error('Error playing alarm:', error);
    }
  }, [isMuted, volume]);

  const playClickSound = useCallback(() => {
    if (isMuted) return;
    try {
      const audio = new Audio('/click.mp3');
      audio.volume = volume / 100;
      audio.play();
    } catch (error) {
      console.error('Error playing click sound:', error);
    }
  }, [isMuted, volume]);

  return { playAlarm, playClickSound };
};
