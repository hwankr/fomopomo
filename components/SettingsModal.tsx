'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Bell, Coffee, LogOut, Plus, RotateCcw, Settings2, ShieldAlert, Timer, Trash2, Volume2, X } from 'lucide-react';
import SubjectManager from '@/components/subjects/SubjectManager';
import NotificationManager from './NotificationManager';
import ConfirmModal from './ConfirmModal';
import { deleteAccount, resetAccount } from './settings/accountActions';
import { useSettingsForm } from './settings/useSettingsForm';
import { getStorageOwner } from '@/lib/userScopedStorage';

// 설정은 /settings 페이지로 옮겼다. 남은 화면이 모두 옮겨 가면 이 모달은 지운다.
// 저장·초기화·계정 동작은 페이지와 같은 useSettingsForm / accountActions를 쓴다.

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function SettingsModal(props: SettingsModalProps) {
  return props.isOpen ? <SettingsModalContent key={getStorageOwner()} {...props} /> : null;
}

function SettingsModalContent({
  isOpen,
  onClose,
  onSave,
}: SettingsModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const settingsForm = useSettingsForm();
  const {
    subjectUserId,
    ready,
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
    removePreset,
    updatePreset,
  } = settingsForm;
  const [isResetSettingsConfirmOpen, setIsResetSettingsConfirmOpen] = useState(false);
  const [isResetAccountConfirmOpen, setIsResetAccountConfirmOpen] = useState(false);
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] = useState(false);

  useLayoutEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-settings-close]')?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Every dismissal path saves.
  const handleSave = async () => {
    const result = await settingsForm.save();
    if (result === 'not-ready') {
      // The stored settings haven't reached the form yet — dismiss without saving.
      onClose();
      return;
    }
    if (result === 'failed') {
      toast.error('설정을 저장할 수 없습니다. 데이터를 복구하거나 초기화한 뒤 다시 시도해주세요.');
      return;
    }
    if (result !== 'saved') return;
    toast.success('설정이 저장되었습니다!');
    onSave();
    onClose();
  };

  const handleResetSettings = async () => {
    const result = await settingsForm.resetToDefaults();
    if (result === 'snapshot-failed') {
      toast.error('설정을 초기화할 수 없습니다.');
      return;
    }
    if (result === 'failed') {
      toast.error('설정을 기본값으로 저장할 수 없습니다. 다시 시도해주세요.');
      return;
    }
    if (result !== 'reset') return;
    toast.success('설정이 기본값으로 초기화되었습니다!');
    onSave();
    onClose();
  };

  const handleResetAccount = () => resetAccount();

  const handleDeleteAccount = () => deleteAccount(router);

  const addPreset = () => {
    if (!settingsForm.addPreset()) toast.error('최대 3개까지만 가능합니다.');
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isResetSettingsConfirmOpen || isResetAccountConfirmOpen || isDeleteAccountConfirmOpen) return;
    const dialog = event.currentTarget;
    // Portaled popovers own their keyboard interaction. In particular, Escape
    // must close that surface before it can dismiss the settings behind it.
    if (event.defaultPrevented || !dialog.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      void handleSave();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
    )).filter((element) => {
      const closedDetails = element.closest('details:not([open])');
      if (closedDetails && !(element.tagName === 'SUMMARY' && element.parentElement === closedDetails)) return false;
      const style = window.getComputedStyle(element);
      return !element.closest('[hidden]') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  if (!isOpen) return null;

  const inputStyle = 'ui-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-rose-300 focus:ring-2 focus:ring-rose-100';
  const sectionTitle = 'mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700';

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5"
        onClick={(event) => { if (event.target === event.currentTarget) void handleSave(); }}
        data-testid="settings-backdrop"
      >
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} onKeyDown={handleDialogKeyDown}
          className="ui-panel-enter flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-rose-50 p-2 text-rose-500"><Settings2 className="h-5 w-5" /></span>
              <div><h2 id="settings-title" className="text-base font-bold text-slate-800">설정</h2><p className="mt-0.5 text-xs text-slate-500">공부 방식에 맞게 조정해보세요.</p></div>
            </div>
            <button type="button" data-settings-close onClick={() => { void handleSave(); }} disabled={subjectsBusy} aria-label="설정 저장하고 닫기" className="ui-press rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"><X className="h-5 w-5" /></button>
          </header>

          <div className="min-h-0 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <section>
              {ready ? <SubjectManager userId={subjectUserId} legacyTasks={tasks} onLegacyImported={handleLegacyImported} onBusyChange={setSubjectsBusy} /> : <p role="status" className="text-sm text-slate-500">설정을 불러오는 중…</p>}
            </section>
            <hr className="border-slate-100" />
            <fieldset disabled={subjectsBusy} className="min-w-0 space-y-6 disabled:opacity-60">
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className={sectionTitle + ' mb-0'}><Timer className="h-4 w-4 text-rose-400" />뽀모도로 프리셋 설정</h3>
                  {presets.length < 3 && <button type="button" onClick={addPreset} className="ui-press flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"><Plus className="h-3.5 w-3.5" />추가</button>}
                </div>
                <div className="space-y-2">
                  {presets.map((preset, index) => <div key={preset.id} className="flex items-center gap-2">
                    <input type="text" aria-label={'프리셋 ' + (index + 1) + ' 이름'} value={preset.label} onChange={(event) => updatePreset(preset.id, 'label', event.target.value)} className={inputStyle + ' min-w-0 flex-1'} placeholder="이름" />
                    <div className="w-20 shrink-0"><input type="number" min={1} aria-label={'프리셋 ' + (index + 1) + ' 시간 (분)'} value={preset.minutes} onChange={(event) => updatePreset(preset.id, 'minutes', event.target.value === '' ? '' : Number(event.target.value))} className={inputStyle + ' text-center'} placeholder="분" /></div>
                    <button type="button" onClick={() => removePreset(preset.id)} aria-label={'프리셋 ' + (index + 1) + ' 삭제'} className="ui-press shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </div>)}
                </div>
              </section>
              <section>
                <h3 className={sectionTitle}>기본 시간 설정 (분)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <label className="space-y-1.5 text-xs text-slate-500"><span>집중</span><input type="number" min={1} value={pomoTime} onChange={(event) => setPomoTime(event.target.value === '' ? '' : Number(event.target.value))} className={inputStyle} /></label>
                  <label className="space-y-1.5 text-xs text-slate-500"><span>짧은 휴식</span><input type="number" min={1} value={shortBreak} onChange={(event) => setShortBreak(event.target.value === '' ? '' : Number(event.target.value))} className={inputStyle} /></label>
                  <label className="space-y-1.5 text-xs text-slate-500"><span>긴 휴식</span><input type="number" min={1} value={longBreak} onChange={(event) => setLongBreak(event.target.value === '' ? '' : Number(event.target.value))} className={inputStyle} /></label>
                </div>
              </section>
              <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
                <SettingToggle label="휴식 자동 시작" checked={autoStartBreaks} onChange={() => setAutoStartBreaks(!autoStartBreaks)} />
                <SettingToggle label="뽀모도로 자동 시작" checked={autoStartPomos} onChange={() => setAutoStartPomos(!autoStartPomos)} />
                <SettingToggle label="저장 시 작업 메모 팝업" description="공부를 마칠 때 작업 내용과 과목을 확인해요." checked={taskPopupEnabled} onChange={() => setTaskPopupEnabled(!taskPopupEnabled)} />
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4"><label htmlFor="settings-break-interval" className="text-sm text-slate-600">긴 휴식 간격 (사이클)</label><input id="settings-break-interval" type="number" min={1} value={longBreakInterval} onChange={(event) => setLongBreakInterval(event.target.value === '' ? '' : Number(event.target.value))} className={inputStyle + ' max-w-20 text-center'} /></div>
              </section>
              <section>
                <h3 className={sectionTitle}><Volume2 className="h-4 w-4 text-rose-400" />알림 소리</h3>
                <SettingToggle label="음소거" checked={isMuted} onChange={() => setIsMuted(!isMuted)} />
                <div className={isMuted ? 'mt-4 opacity-50' : 'mt-4'}>
                  <div className="mb-2 flex items-center justify-between"><label htmlFor="settings-volume" className="text-xs text-slate-500">볼륨</label><span className="text-xs tabular-nums text-slate-500">{volume}%</span></div>
                  <input id="settings-volume" type="range" min="0" max="100" value={volume} disabled={isMuted} onChange={(event) => setVolume(Number(event.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-rose-500 disabled:cursor-not-allowed" />
                </div>
              </section>
              <hr className="border-slate-100" />
              <section><h3 className={sectionTitle}><Bell className="h-4 w-4 text-rose-400" />알림 설정</h3><NotificationManager mode="inline" /></section>
              <hr className="border-slate-100" />
              <section>
                <h3 className={sectionTitle}><ShieldAlert className="h-4 w-4 text-rose-400" />계정 설정</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setIsResetSettingsConfirmOpen(true)} className="ui-button-secondary ui-press flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-2 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" />설정 초기화</button>
                  <button type="button" onClick={() => setIsResetAccountConfirmOpen(true)} className="ui-press flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-2 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />계정 초기화</button>
                  <button type="button" onClick={() => setIsDeleteAccountConfirmOpen(true)} className="ui-press col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-100"><LogOut className="h-3.5 w-3.5" />계정 탈퇴 (복구 불가)</button>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <h3 className={sectionTitle + ' mb-2'}><Coffee className="h-4 w-4 text-rose-400" />후원</h3>
                <p className="mb-3 text-xs text-slate-500">서비스가 마음에 드셨다면, 커피 한 잔으로 응원해주세요.</p>
                <a href="/support" className="ui-press inline-flex rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">후원하기 →</a>
              </section>
            </fieldset>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
            <p className="text-xs text-slate-400">{subjectsBusy ? '과목을 저장하고 있어요.' : '닫을 때 변경 사항이 저장됩니다.'}</p>
            <button type="button" onClick={() => { void handleSave(); }} disabled={subjectsBusy} className="ui-button-primary ui-press shrink-0 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50">저장하기</button>
          </footer>
        </div>
      </div>
      <ConfirmModal
        isOpen={isResetSettingsConfirmOpen}
        onClose={() => setIsResetSettingsConfirmOpen(false)}
        onConfirm={handleResetSettings}
        title="설정 초기화"
        message="모든 설정이 기본값으로 돌아갑니다. 계속하시겠습니까?"
        confirmText="초기화"
        cancelText="취소"
        isDangerous={true}
      />
      <ConfirmModal
        isOpen={isResetAccountConfirmOpen}
        onClose={() => setIsResetAccountConfirmOpen(false)}
        onConfirm={handleResetAccount}
        title="계정 초기화"
        message={(
          <div className="space-y-3 text-sm">
            <p>다음 데이터가 모두 초기화됩니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>공부 기록/시간</li>
              <li>친구/친구 요청</li>
              <li>가입된 그룹 (자동 탈퇴, 혼자만 있는 그룹은 삭제)</li>
              <li>할 일/주간·월간 플랜</li>
              <li>설정/알림</li>
            </ul>
            <p className="text-xs text-gray-500">
              다른 멤버가 있는 그룹의 그룹장은 이양 후에 초기화할 수 있으며, 이 작업은 복구할 수 없습니다.
            </p>
          </div>
        )}
        confirmText="초기화"
        cancelText="취소"
        isDangerous={true}
      />
      <ConfirmModal
        isOpen={isDeleteAccountConfirmOpen}
        onClose={() => setIsDeleteAccountConfirmOpen(false)}
        onConfirm={handleDeleteAccount}
        title="계정 탈퇴"
        message={(
          <div className="space-y-3 text-sm">
            <p>다음 데이터가 영구적으로 삭제됩니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>공부 기록/시간</li>
              <li>친구/친구 요청</li>
              <li>가입된 그룹 (자동 탈퇴, 혼자만 있는 그룹은 삭제)</li>
              <li>할 일/주간·월간 플랜</li>
              <li>설정/알림</li>
            </ul>
            <p className="text-xs text-gray-500">
              다른 멤버가 있는 그룹의 그룹장은 이양 후에 탈퇴할 수 있습니다.
            </p>
            <p className="text-xs text-rose-500 font-semibold">
              이 작업은 복구할 수 없습니다.
            </p>
          </div>
        )}
        confirmText="탈퇴"
        cancelText="취소"
        isDangerous={true}
      />
    </>
  );
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: () => void }) {
  return <div className="flex items-center justify-between gap-4"><div><span className="text-sm font-medium text-slate-600">{label}</span>{description && <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>}</div><button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={onChange} className={'ui-press relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 ' + (checked ? 'bg-rose-500' : 'bg-slate-300')}><span className={'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ' + (checked ? 'translate-x-5' : 'translate-x-0')} /></button></div>;
}
