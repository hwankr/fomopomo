import { supabase } from '@/lib/supabase';

export type Preset = {
  id: string;
  label: string;
  minutes: number;
};

export type FomopomoSettings = {
  pomoTime: number;
  shortBreak: number;
  longBreak: number;
  autoStartBreaks: boolean;
  autoStartPomos: boolean;
  longBreakInterval: number;
  volume: number;
  isMuted: boolean;
  taskPopupEnabled: boolean;
  seasonalEffectEnabled: boolean;
  tasks: string[];
  presets: Preset[];
};

type PartialFomopomoSettings = Partial<FomopomoSettings>;
type UserSettingsRecord = {
  settings?: PartialFomopomoSettings | null;
} | null;

export const SETTINGS_KEY = 'fomopomo_settings';
export const SETTINGS_CHANGED_EVENT = 'settingsChanged';
export const DEFAULT_TASK_OPTIONS = ['국어', '수학', '영어'];
export const DEFAULT_FOMOPOMO_SETTINGS: FomopomoSettings = {
  pomoTime: 25,
  shortBreak: 5,
  longBreak: 15,
  autoStartBreaks: false,
  autoStartPomos: false,
  longBreakInterval: 4,
  volume: 50,
  isMuted: false,
  taskPopupEnabled: true,
  seasonalEffectEnabled: true,
  tasks: DEFAULT_TASK_OPTIONS,
  presets: [
    { id: '1', label: '프리셋1', minutes: 25 },
    { id: '2', label: '프리셋2', minutes: 50 },
    { id: '3', label: '프리셋3', minutes: 90 },
  ],
};

let cachedRawSettings: string | null = null;
let cachedSettingsSnapshot: FomopomoSettings = DEFAULT_FOMOPOMO_SETTINGS;

const cloneTasks = (tasks: string[]) => [...tasks];
const clonePresets = (presets: Preset[]) =>
  presets.map((preset) => ({ ...preset }));

const getValidTasks = (
  tasks: string[] | null | undefined,
  fallback: string[]
): string[] => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return cloneTasks(fallback);
  }

  return cloneTasks(tasks);
};

const getValidPresets = (
  presets: Preset[] | null | undefined,
  fallback: Preset[]
): Preset[] => {
  if (!Array.isArray(presets) || presets.length === 0) {
    return clonePresets(fallback);
  }

  return clonePresets(presets);
};

export function normalizeSettings(
  rawSettings: PartialFomopomoSettings | null | undefined
): FomopomoSettings {
  const raw = rawSettings as (PartialFomopomoSettings & { snowEnabled?: boolean }) | null | undefined;
  return {
    ...DEFAULT_FOMOPOMO_SETTINGS,
    ...rawSettings,
    taskPopupEnabled:
      raw?.taskPopupEnabled ??
      DEFAULT_FOMOPOMO_SETTINGS.taskPopupEnabled,
    seasonalEffectEnabled:
      raw?.seasonalEffectEnabled ??
      raw?.snowEnabled ??
      DEFAULT_FOMOPOMO_SETTINGS.seasonalEffectEnabled,
    tasks: getValidTasks(
      rawSettings?.tasks,
      DEFAULT_FOMOPOMO_SETTINGS.tasks
    ),
    presets: getValidPresets(
      rawSettings?.presets,
      DEFAULT_FOMOPOMO_SETTINGS.presets
    ),
  };
}

function parseStoredSettings(
  serializedSettings: string | null
): PartialFomopomoSettings | null {
  if (!serializedSettings) {
    return null;
  }

  try {
    return JSON.parse(serializedSettings) as PartialFomopomoSettings;
  } catch (error) {
    console.error('Failed to parse settings', error);
    return null;
  }
}

function readStoredSettingsRaw() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(SETTINGS_KEY);
}

export function readSettingsSnapshot(): FomopomoSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_FOMOPOMO_SETTINGS;
  }

  const savedSettings = readStoredSettingsRaw();
  if (savedSettings === cachedRawSettings) {
    return cachedSettingsSnapshot;
  }

  const parsedSettings = parseStoredSettings(savedSettings);
  if (!parsedSettings) {
    cachedRawSettings = null;
    cachedSettingsSnapshot = DEFAULT_FOMOPOMO_SETTINGS;
    return cachedSettingsSnapshot;
  }

  cachedRawSettings = savedSettings;
  cachedSettingsSnapshot = normalizeSettings(parsedSettings);
  return cachedSettingsSnapshot;
}

export function writeSettingsSnapshot(settings: FomopomoSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedSettings = normalizeSettings(settings);
  const serializedSettings = JSON.stringify(normalizedSettings);

  cachedRawSettings = serializedSettings;
  cachedSettingsSnapshot = normalizedSettings;
  window.localStorage.setItem(SETTINGS_KEY, serializedSettings);
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

export function subscribeSettings(onStoreChange: () => void) {
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
  window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange);
  };
}

async function getAuthenticatedUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function fetchRemoteSettings(userId: string) {
  const { data, error } = (await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .single()) as { data: UserSettingsRecord; error?: { code?: string } | null };

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to load settings', error);
  }

  return data?.settings ?? null;
}

export async function loadPersistedSettings(): Promise<FomopomoSettings> {
  try {
    const userId = await getAuthenticatedUserId();

    if (userId) {
      const remoteSettings = await fetchRemoteSettings(userId);
      if (remoteSettings) {
        return normalizeSettings(remoteSettings);
      }
    }
  } catch (error) {
    console.error('Failed to load settings', error);
  }

  return readSettingsSnapshot();
}

export async function loadTaskOptions(): Promise<string[]> {
  try {
    const userId = await getAuthenticatedUserId();

    if (userId) {
      const remoteSettings = await fetchRemoteSettings(userId);
      if (
        Array.isArray(remoteSettings?.tasks) &&
        remoteSettings.tasks.length > 0
      ) {
        return cloneTasks(remoteSettings.tasks);
      }
    }
  } catch (error) {
    console.error('Failed to load task options', error);
  }

  return getValidTasks(readSettingsSnapshot().tasks, DEFAULT_TASK_OPTIONS);
}

export async function persistSettings(settings: FomopomoSettings) {
  const normalizedSettings = normalizeSettings(settings);
  writeSettingsSnapshot(normalizedSettings);

  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return;
    }

    await supabase.from('user_settings').upsert({
      user_id: userId,
      settings: normalizedSettings,
    });
  } catch (error) {
    console.error('설정 저장 실패:', error);
  }
}
