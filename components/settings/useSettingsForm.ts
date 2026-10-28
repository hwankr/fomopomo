'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FOMOPOMO_SETTINGS,
  loadPersistedSettings,
  normalizeSettings,
  resetSettingsSnapshot,
  persistSettings as persistStoredSettings,
  type FomopomoSettings,
  type Preset,
} from '@/components/timer/hooks/settingsStore';
import { getStorageOwner, GUEST_OWNER } from '@/lib/userScopedStorage';
import { clearSettingsDraft, readSettingsDraft, sameSettings, writeSettingsDraft } from './settingsDraft';

// Duration fields tolerate '' while the user is typing (clearing a number
// input would otherwise snap to 0); saving normalizes them back to numbers.
export type NumberField = number | '';

// Form-side preset: minutes tolerates '' while the user is typing, exactly
// like the duration fields.
export type PresetFormEntry = Omit<Preset, 'minutes'> & { minutes: NumberField };

export const MAX_PRESETS = 3;

/** saved · failed(저장 실패) · busy(과목 저장 중) · not-ready(아직 불러오는 중) · stale(계정이 바뀌었거나 화면이 닫힘) */
export type SaveResult = 'saved' | 'failed' | 'busy' | 'not-ready' | 'stale';
/** reset · snapshot-failed(기기 저장 실패) · failed(서버 저장 실패) · busy · stale */
export type ResetResult = 'reset' | 'snapshot-failed' | 'failed' | 'busy' | 'stale';

type FormFields = {
  pomoTime: NumberField;
  shortBreak: NumberField;
  longBreak: NumberField;
  autoStartBreaks: boolean;
  autoStartPomos: boolean;
  longBreakInterval: NumberField;
  volume: number;
  isMuted: boolean;
  taskPopupEnabled: boolean;
  presets: PresetFormEntry[];
};

// Normalizing here (not just inside persistSettings) keeps the UI honest:
// saving writes these exact values back into the form, so what the user sees
// is what got stored. Fields left cleared recover to the values the form was
// hydrated with (a brand-new preset falls back to its default); out-of-range
// numbers clamp.
function buildSettings(form: FormFields, loaded: FomopomoSettings, tasks: string[]): FomopomoSettings {
  return normalizeSettings({
    pomoTime: form.pomoTime === '' ? loaded.pomoTime : form.pomoTime,
    shortBreak: form.shortBreak === '' ? loaded.shortBreak : form.shortBreak,
    longBreak: form.longBreak === '' ? loaded.longBreak : form.longBreak,
    autoStartBreaks: form.autoStartBreaks,
    autoStartPomos: form.autoStartPomos,
    longBreakInterval:
      form.longBreakInterval === '' ? loaded.longBreakInterval : form.longBreakInterval,
    volume: form.volume,
    isMuted: form.isMuted,
    taskPopupEnabled: form.taskPopupEnabled,
    tasks,
    presets: form.presets.map((preset) => ({
      ...preset,
      minutes:
        preset.minutes === ''
          ? loaded.presets.find((p) => p.id === preset.id)?.minutes ?? Number.NaN
          : preset.minutes,
    })),
  });
}

/**
 * The settings form shared by the /settings page (and the legacy modal while it
 * still exists). The host must remount it per storage owner (`key={getStorageOwner()}`).
 */
export function useSettingsForm() {
  const currentOwner = getStorageOwner();
  const subjectUserId = currentOwner === GUEST_OWNER ? null : currentOwner;
  const formOwnerRef = useRef<string | null>(null);
  const formGenerationRef = useRef(0);
  const [formOwner, setFormOwner] = useState<string | null>(null);
  const [subjectsBusy, setSubjectsBusy] = useState(false);
  // False until the load effect hydrates the form with the user's stored
  // settings. Saving before hydration would overwrite the stored settings
  // with the untouched default form.
  const hydratedRef = useRef(false);
  const [pomoTime, setPomoTime] = useState<NumberField>(DEFAULT_FOMOPOMO_SETTINGS.pomoTime);
  const [shortBreak, setShortBreak] = useState<NumberField>(DEFAULT_FOMOPOMO_SETTINGS.shortBreak);
  const [longBreak, setLongBreak] = useState<NumberField>(DEFAULT_FOMOPOMO_SETTINGS.longBreak);
  const [autoStartBreaks, setAutoStartBreaks] = useState(
    DEFAULT_FOMOPOMO_SETTINGS.autoStartBreaks
  );
  const [autoStartPomos, setAutoStartPomos] = useState(
    DEFAULT_FOMOPOMO_SETTINGS.autoStartPomos
  );
  const [longBreakInterval, setLongBreakInterval] = useState<NumberField>(
    DEFAULT_FOMOPOMO_SETTINGS.longBreakInterval
  );
  const [volume, setVolume] = useState(DEFAULT_FOMOPOMO_SETTINGS.volume);
  const [isMuted, setIsMuted] = useState(DEFAULT_FOMOPOMO_SETTINGS.isMuted);
  const [taskPopupEnabled, setTaskPopupEnabled] = useState(
    DEFAULT_FOMOPOMO_SETTINGS.taskPopupEnabled
  );
  const [tasks, setTasks] = useState<string[]>(DEFAULT_FOMOPOMO_SETTINGS.tasks);
  const legacyTasksRef = useRef(DEFAULT_FOMOPOMO_SETTINGS.tasks);
  const [presets, setPresets] = useState<PresetFormEntry[]>(DEFAULT_FOMOPOMO_SETTINGS.presets);
  // The settings the form was last hydrated from (load, save, or reset).
  // Fields cleared at save time recover to these values — leaving the form
  // with an emptied field must restore what the user had, never replace it
  // with a global default.
  const [loadedSettings, setLoadedSettings] = useState<FomopomoSettings>(
    DEFAULT_FOMOPOMO_SETTINGS
  );
  // The settings last confirmed in storage; the form is dirty when it differs.
  const [savedSettings, setSavedSettings] = useState<FomopomoSettings>(
    DEFAULT_FOMOPOMO_SETTINGS
  );
  // The edits recovered from an unsaved draft at hydration, if any.
  const [recoveredSettings, setRecoveredSettings] = useState<FomopomoSettings | null>(null);

  const applySettingsToForm = useCallback((settings: FomopomoSettings) => {
    setLoadedSettings(settings);
    setPomoTime(settings.pomoTime);
    setShortBreak(settings.shortBreak);
    setLongBreak(settings.longBreak);
    setAutoStartBreaks(settings.autoStartBreaks);
    setAutoStartPomos(settings.autoStartPomos);
    setLongBreakInterval(settings.longBreakInterval);
    setVolume(settings.volume);
    setIsMuted(settings.isMuted);
    setTaskPopupEnabled(settings.taskPopupEnabled);
    setTasks(settings.tasks);
    legacyTasksRef.current = settings.tasks;
    setPresets(settings.presets);
  }, []);

  const form: FormFields = {
    pomoTime,
    shortBreak,
    longBreak,
    autoStartBreaks,
    autoStartPomos,
    longBreakInterval,
    volume,
    isMuted,
    taskPopupEnabled,
    presets,
  };

  useEffect(() => {
    // The cancellation flag keeps a slow load from clobbering the form after
    // it saved and closed — the save's write-back must stay the last word on
    // what the form (and the next open) shows.
    let cancelled = false;
    const generation = ++formGenerationRef.current;
    hydratedRef.current = false;
    formOwnerRef.current = null;
    const loadSettings = async () => {
      const persistedSettings = await loadPersistedSettings();
      if (!cancelled && getStorageOwner() === currentOwner) {
        // Edits that could not be saved when the form was last left win over
        // the stored (remote-first) settings until a save succeeds. The form
        // stays dirty against what was stored when the edits were made.
        const draft = readSettingsDraft(currentOwner);
        applySettingsToForm(draft?.settings ?? persistedSettings);
        setSavedSettings(draft?.base ?? persistedSettings);
        setRecoveredSettings(draft?.settings ?? null);
        formOwnerRef.current = currentOwner;
        setFormOwner(currentOwner);
        hydratedRef.current = true;
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
      if (formGenerationRef.current === generation) formGenerationRef.current += 1;
    };
  }, [applySettingsToForm, currentOwner]);

  const ready = formOwner === currentOwner;
  const formSettings = buildSettings(form, loadedSettings, tasks);
  const formDirty = formOwner !== null && !sameSettings(formSettings, savedSettings);
  const isDirty = ready && formDirty;
  // The form still shows exactly the recovered edits (a new edit makes it an ordinary pending change).
  const recoveredDraft = isDirty && recoveredSettings !== null && sameSettings(formSettings, recoveredSettings);

  // A clean form has nothing to recover. Drop the owner's obsolete draft as
  // soon as the form is back at its saved baseline (recovered edits reverted,
  // or edits stashed on page-hide and then undone after a back/forward cache
  // restore) — a reload never runs the leave-time cleanup, and would
  // otherwise resurrect the stale edits.
  useEffect(() => {
    if (formOwner === null || formOwner !== currentOwner || formDirty) return;
    clearSettingsDraft(formOwner);
  }, [currentOwner, formDirty, formOwner]);

  const handleLegacyImported = (names: string[]) => {
    if (!hydratedRef.current || formOwnerRef.current !== currentOwner || getStorageOwner() !== currentOwner) return;
    const imported = new Set(names);
    // Import may finish after another form field changed. Only remove the
    // successful archive names, never replace a newer settings snapshot.
    legacyTasksRef.current = legacyTasksRef.current.filter((name) => !imported.has(name));
    setTasks(legacyTasksRef.current);
  };

  const save = async (): Promise<SaveResult> => {
    if (subjectsBusy) return 'busy';
    if (!hydratedRef.current || formOwnerRef.current !== getStorageOwner()) {
      // The stored settings haven't reached the form yet — persisting now
      // would replace them with defaults.
      return 'not-ready';
    }

    const settingsToSave = buildSettings(form, loadedSettings, legacyTasksRef.current);
    const generation = formGenerationRef.current;
    // Reflect the normalized values in the form so the UI never disagrees
    // with what was stored (a cleared field shows its recovered default).
    applySettingsToForm(settingsToSave);
    const didPersist = await persistStoredSettings(settingsToSave);
    if (generation !== formGenerationRef.current || currentOwner !== getStorageOwner()) return 'stale';
    if (!didPersist) return 'failed';
    setSavedSettings(settingsToSave);
    clearSettingsDraft(currentOwner);
    setRecoveredSettings(null);
    return 'saved';
  };

  const buildDraft = () => ({
    settings: buildSettings(form, loadedSettings, legacyTasksRef.current),
    base: savedSettings,
  });

  // For a host that is going away (navigation, sign-out). Unsaved edits are
  // first kept as the hydrated owner's draft, then persisted; the draft is
  // dropped only once the save succeeds, so a failed save is recovered the
  // next time the form opens. Returns null when nothing is saved: a clean
  // form drops any old draft, and an owner that changed meanwhile only keeps
  // its draft (never writes into the new owner's storage).
  const persistPendingEdits = (): Promise<boolean> | null => {
    const owner = formOwnerRef.current;
    if (!hydratedRef.current || owner === null) return null;
    if (!formDirty) {
      clearSettingsDraft(owner);
      return null;
    }
    const draft = writeSettingsDraft(owner, buildDraft());
    if (owner !== getStorageOwner()) return null;
    return persistStoredSettings(draft.settings).then((didPersist) => {
      if (didPersist) clearSettingsDraft(owner, draft);
      return didPersist;
    });
  };

  // For a page that is being unloaded (reload, tab close, leaving the site):
  // a save cannot finish, so only keep the draft.
  const stashPendingEdits = () => {
    const owner = formOwnerRef.current;
    if (!hydratedRef.current || owner === null || !formDirty) return;
    writeSettingsDraft(owner, buildDraft());
  };

  const resetToDefaults = async (): Promise<ResetResult> => {
    if (subjectsBusy || formOwnerRef.current !== getStorageOwner()) return 'busy';
    applySettingsToForm(DEFAULT_FOMOPOMO_SETTINGS);
    const generation = formGenerationRef.current;
    const didResetSnapshot = resetSettingsSnapshot();
    if (!didResetSnapshot) return 'snapshot-failed';
    const didPersist = await persistStoredSettings(DEFAULT_FOMOPOMO_SETTINGS);
    if (generation !== formGenerationRef.current || currentOwner !== getStorageOwner()) return 'stale';
    if (!didPersist) return 'failed';
    setSavedSettings(DEFAULT_FOMOPOMO_SETTINGS);
    clearSettingsDraft(currentOwner);
    setRecoveredSettings(null);
    return 'reset';
  };

  /** Returns the new preset's id, or null when the preset limit is reached. */
  const addPreset = () => {
    if (presets.length >= MAX_PRESETS) return null;
    const id = Date.now().toString();
    setPresets([...presets, { id, label: '집중', minutes: 25 }]);
    return id;
  };

  const removePreset = (id: string) => {
    setPresets(presets.filter((p) => p.id !== id));
  };

  const updatePreset = (id: string, field: 'label' | 'minutes', value: string | NumberField) => {
    setPresets(presets.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  return {
    currentOwner,
    subjectUserId,
    ready,
    isDirty,
    recoveredDraft,
    loadedSettings,
    subjectsBusy,
    setSubjectsBusy,
    tasks,
    handleLegacyImported,
    pomoTime,
    setPomoTime,
    shortBreak,
    setShortBreak,
    longBreak,
    setLongBreak,
    longBreakInterval,
    setLongBreakInterval,
    autoStartBreaks,
    setAutoStartBreaks,
    autoStartPomos,
    setAutoStartPomos,
    taskPopupEnabled,
    setTaskPopupEnabled,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    presets,
    addPreset,
    removePreset,
    updatePreset,
    save,
    persistPendingEdits,
    stashPendingEdits,
    resetToDefaults,
  };
}

export type SettingsForm = ReturnType<typeof useSettingsForm>;
