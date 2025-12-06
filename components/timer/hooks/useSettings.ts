import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type Preset = {
  id: string;
  label: string;
  minutes: number;
};

export type Settings = {
  pomoTime: number;
  shortBreak: number;
  longBreak: number;
  autoStartBreaks: boolean;
  autoStartPomos: boolean;
  longBreakInterval: number;
  volume: number;
  isMuted: boolean;
  taskPopupEnabled: boolean;
  presets: Preset[];
};

export const useSettings = (settingsUpdated: number) => {
  const [settings, setSettings] = useState<Settings>({
    pomoTime: 25,
    shortBreak: 5,
    longBreak: 15,
    autoStartBreaks: false,
    autoStartPomos: false,
    longBreakInterval: 4,
    volume: 50,
    isMuted: false,
    taskPopupEnabled: true,
    presets: [
      { id: '1', label: '작업1', minutes: 25 },
      { id: '2', label: '작업2', minutes: 50 },
      { id: '3', label: '작업3', minutes: 90 },
    ],
  });

  // Load settings
  useEffect(() => {
    const savedSettings = localStorage.getItem("fomopomo_settings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          taskPopupEnabled: parsed.taskPopupEnabled ?? prev.taskPopupEnabled ?? true,
          presets: parsed.presets && parsed.presets.length > 0 ? parsed.presets : prev.presets,
        }));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, [settingsUpdated]);

  const persistSettings = useCallback(async (newSettings: Settings) => {
    localStorage.setItem('fomopomo_settings', JSON.stringify(newSettings));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('user_settings')
          .upsert({ user_id: user.id, settings: newSettings });
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  }, []);

  return { settings, setSettings, persistSettings };
};
