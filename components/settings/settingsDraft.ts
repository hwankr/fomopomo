import {
  normalizeSettings,
  type FomopomoSettings,
} from '@/components/timer/hooks/settingsStore';
import {
  getScopedStorageKey,
  readOwnedJson,
  writeOwnedJson,
} from '@/lib/userScopedStorage';

// 설정 화면을 떠날 때 저장하지 못한(또는 저장이 끝나지 않은) 변경. 계정별로 기기에 남겨 두고,
// 다음에 설정을 열면 서버 값보다 먼저 폼에 되살린다. 저장에 성공하면 지운다.
export const SETTINGS_DRAFT_KEY = 'fomopomo_settings_draft';

export type SettingsDraft = {
  /** 저장하려던 설정 */
  settings: FomopomoSettings;
  /** 그때 저장돼 있던 설정. 되살린 폼은 이것과 다르면 저장 대기 상태다. */
  base: FomopomoSettings;
};

const SCALAR_KEYS = [
  'pomoTime',
  'shortBreak',
  'longBreak',
  'autoStartBreaks',
  'autoStartPomos',
  'longBreakInterval',
  'volume',
  'isMuted',
  'taskPopupEnabled',
] as const;

// Compares only the fields the settings form edits; unknown stored keys don't count.
export function sameSettings(a: FomopomoSettings, b: FomopomoSettings) {
  return (
    SCALAR_KEYS.every((key) => a[key] === b[key]) &&
    a.tasks.length === b.tasks.length &&
    a.tasks.every((task, index) => task === b.tasks[index]) &&
    a.presets.length === b.presets.length &&
    a.presets.every((preset, index) => {
      const other = b.presets[index];
      return preset.id === other.id && preset.label === other.label && preset.minutes === other.minutes;
    })
  );
}

const isObject = (value: unknown): value is Partial<FomopomoSettings> =>
  typeof value === 'object' && value !== null;

export function readSettingsDraft(owner: string): SettingsDraft | null {
  const stored = readOwnedJson<{ settings?: unknown; base?: unknown }>(SETTINGS_DRAFT_KEY, owner);
  if (!stored || !isObject(stored.settings) || !isObject(stored.base)) return null;
  return { settings: normalizeSettings(stored.settings), base: normalizeSettings(stored.base) };
}

export function writeSettingsDraft(owner: string, draft: SettingsDraft): SettingsDraft {
  writeOwnedJson(SETTINGS_DRAFT_KEY, owner, draft);
  return draft;
}

/** `written`을 주면 그 초안이 아직 남아 있을 때만 지운다(그사이 새 초안이 생겼으면 둔다). */
export function clearSettingsDraft(owner: string, written?: SettingsDraft) {
  if (typeof window === 'undefined') return;
  if (written) {
    const current = readSettingsDraft(owner);
    if (!current || !sameSettings(current.settings, written.settings)) return;
  }
  try {
    window.localStorage.removeItem(getScopedStorageKey(SETTINGS_DRAFT_KEY, owner));
  } catch (error) {
    console.error('Failed to clear the settings draft', error);
  }
}
