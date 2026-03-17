import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';
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

const SETTINGS_KEY = 'fomopomo_settings';
const DEFAULT_SETTINGS: Settings = {
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
};

// useSyncExternalStore requires stable snapshot identity until the store changes.
let cachedRawSettings: string | null = null;
let cachedSettingsSnapshot: Settings = DEFAULT_SETTINGS;

function normalizeSettings(rawSettings: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    taskPopupEnabled:
      rawSettings?.taskPopupEnabled ?? DEFAULT_SETTINGS.taskPopupEnabled,
    presets:
      rawSettings?.presets && rawSettings.presets.length > 0
        ? rawSettings.presets
        : DEFAULT_SETTINGS.presets,
  };
}

function readSettingsSnapshot(): Settings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const savedSettings = window.localStorage.getItem(SETTINGS_KEY);
    if (savedSettings === cachedRawSettings) {
      return cachedSettingsSnapshot;
    }

    if (!savedSettings) {
      cachedRawSettings = null;
      cachedSettingsSnapshot = DEFAULT_SETTINGS;
      return cachedSettingsSnapshot;
    }

    cachedRawSettings = savedSettings;
    cachedSettingsSnapshot = normalizeSettings(
      JSON.parse(savedSettings) as Partial<Settings>
    );
    return cachedSettingsSnapshot;
  } catch (error) {
    cachedRawSettings = null;
    cachedSettingsSnapshot = DEFAULT_SETTINGS;
    console.error('Failed to parse settings', error);
    return cachedSettingsSnapshot;
  }
}

function writeSettingsSnapshot(settings: Settings) {
  if (typeof window === 'undefined') return;

  const normalizedSettings = normalizeSettings(settings);
  const serializedSettings = JSON.stringify(normalizedSettings);

  cachedRawSettings = serializedSettings;
  cachedSettingsSnapshot = normalizedSettings;

  window.localStorage.setItem(SETTINGS_KEY, serializedSettings);
  window.dispatchEvent(new Event('settingsChanged'));
}

function subscribeSettings(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) {
      onStoreChange();
    }
  };
  const handleSettingsChange = () => onStoreChange();

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('settingsChanged', handleSettingsChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('settingsChanged', handleSettingsChange);
  };
}

export const useSettings = (_settingsUpdated: number) => {
  void _settingsUpdated;

  const settings = useSyncExternalStore(
    subscribeSettings,
    readSettingsSnapshot,
    () => DEFAULT_SETTINGS
  );

  const setSettings = useCallback((value: SetStateAction<Settings>) => {
    const currentSettings = readSettingsSnapshot();
    const nextSettings =
      typeof value === 'function'
        ? (value as (previousValue: Settings) => Settings)(currentSettings)
        : value;

    writeSettingsSnapshot(normalizeSettings(nextSettings));
  }, []);

  const persistSettings = useCallback(async (newSettings: Settings) => {
    const normalizedSettings = normalizeSettings(newSettings);
    writeSettingsSnapshot(normalizedSettings);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from('user_settings')
          .upsert({ user_id: user.id, settings: normalizedSettings });
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  }, []);

  return { settings, setSettings, persistSettings };
};
