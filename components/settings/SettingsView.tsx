'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { ChevronLeft, Plus, X } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MobileTopBar from '@/components/layout/MobileTopBar';
import NotificationManager from '@/components/NotificationManager';
import DonationSection from '@/components/DonationSection';
import SubjectManager from '@/components/subjects/SubjectManager';
import { signOutWithPushCleanup } from '@/lib/pushSubscriptionLifecycle';
import { cn } from '@/lib/utils';
import AccountSection from './AccountSection';
import { deleteAccount, resetAccount } from './accountActions';
import { SectionHeading, SettingRow, SettingsSection, SettingSwitch, Stepper } from './SettingsControls';
import { MAX_PRESETS, useSettingsForm } from './useSettingsForm';

// normalizeSettings가 저장할 때 맞추는 범위와 같다.
const MAX_MINUTES = 999;
const MAX_LONG_BREAK_INTERVAL = 99;

const DIRTY_STATUS = '변경 사항은 나갈 때 자동으로 저장돼요.';
const RECOVERED_STATUS = '저장하지 못한 변경 사항을 다시 불러왔어요.';

type SettingsViewProps = {
  session: Session | null;
  onOpenLogin: () => void;
};

// /settings 화면. 저장소 주인(로그인 계정)마다 다시 마운트한다(key).
// 저장은 저장 버튼으로 하고, 저장하지 않은 변경은 화면을 떠날 때(다른 화면으로 이동, 뒤로 가기, 로그인·로그아웃) 저장한다.
// 떠날 때는 먼저 계정별 초안으로 남기고 저장에 성공해야 지우므로, 저장에 실패해도 다음에 설정을 열면 되살아난다.
// 새로고침·탭 닫기처럼 저장을 끝낼 수 없는 이탈은 초안만 남기고 브라우저 확인 창으로도 묻는다.
export default function SettingsView({ session, onOpenLogin }: SettingsViewProps) {
  const router = useRouter();
  const form = useSettingsForm();
  const {
    loadedSettings,
    presets,
    isMuted,
    volume,
  } = form;
  const signedIn = Boolean(session);
  const [saveStatus, setSaveStatus] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  // 계정 초기화·탈퇴·로그아웃이 화면을 떠나기 시작하면 떠날 때 저장과 이탈 경고를 끈다.
  const leavingRef = useRef(false);
  const pendingEditsRef = useRef({ persist: form.persistPendingEdits, stash: form.stashPendingEdits });

  useLayoutEffect(() => {
    pendingEditsRef.current = { persist: form.persistPendingEdits, stash: form.stashPendingEdits };
  });

  useEffect(() => {
    const pendingEdits = pendingEditsRef;
    return () => {
      if (leavingRef.current) return;
      const pending = pendingEdits.current.persist();
      if (!pending) return;
      void pending.then((didPersist) => {
        if (didPersist) toast.success('설정을 저장했어요.');
        else toast.error('설정을 저장하지 못했어요. 다음에 설정을 열면 변경 사항을 다시 불러와요.');
      });
    };
  }, []);

  useEffect(() => {
    if (!form.isDirty) return;
    const pendingEdits = pendingEditsRef;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
    };
    const stashOnPageHide = () => {
      if (!leavingRef.current) pendingEdits.current.stash();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    window.addEventListener('pagehide', stashOnPageHide);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      window.removeEventListener('pagehide', stashOnPageHide);
    };
  }, [form.isDirty]);

  const handleSave = async () => {
    const result = await form.save();
    if (result === 'saved') {
      setSaveStatus('저장했어요.');
    } else if (result === 'failed') {
      setSaveStatus('');
      toast.error('설정을 저장할 수 없습니다. 데이터를 복구하거나 초기화한 뒤 다시 시도해주세요.');
    }
    return result;
  };

  // 구글 로그인은 다른 페이지로 넘어가므로 먼저 저장한다.
  const openLogin = async () => {
    if (form.isDirty && (await handleSave()) === 'failed') return;
    onOpenLogin();
  };

  const handleResetSettings = async () => {
    const result = await form.resetToDefaults();
    if (result === 'snapshot-failed') {
      toast.error('설정을 초기화할 수 없습니다.');
      return;
    }
    if (result === 'failed') {
      toast.error('설정을 기본값으로 저장할 수 없습니다. 다시 시도해주세요.');
      return;
    }
    if (result !== 'reset') return;
    setSaveStatus('');
    setAccountStatus('설정을 기본값으로 되돌렸어요.');
  };

  // 저장하지 않은 변경을 먼저 저장하고 로그아웃한다. 로그아웃하면 타이머(/)로 간다.
  const handleLogout = async () => {
    if (form.isDirty && (await handleSave()) !== 'saved') {
      toast.error('설정을 저장하지 못해 로그아웃하지 않았어요. 다시 시도해주세요.');
      return false;
    }
    leavingRef.current = true;
    try {
      const { error } = await signOutWithPushCleanup();
      if (error) throw error;
    } catch (error) {
      leavingRef.current = false;
      console.error('로그아웃 실패:', error);
      toast.error('로그아웃하지 못했어요. 다시 시도해주세요.');
      return false;
    }
    router.replace('/');
    return true;
  };

  const leave = () => {
    leavingRef.current = true;
  };

  const addPreset = () => {
    if (!form.addPreset()) toast.error('최대 3개까지만 가능합니다.');
  };

  const saveDisabled = !form.ready || form.subjectsBusy;
  const status = form.subjectsBusy
    ? '과목을 저장하고 있어요.'
    : form.isDirty
      ? (form.recoveredDraft ? RECOVERED_STATUS : DIRTY_STATUS)
      : saveStatus;

  return (
    <>
      <Navbar
        session={session}
        onOpenLogin={() => { void openLogin(); }}
        mobileTopBar={(
          <MobileTopBar
            sticky
            start={(
              <Link href="/profile" aria-label="프로필로 돌아가기" className="ui-icon-button text-ink">
                <ChevronLeft aria-hidden="true" size={22} strokeWidth={2.2} />
              </Link>
            )}
            center={<h1 className="m-0 text-[17px] font-bold">설정</h1>}
            end={(
              <button
                type="button"
                onClick={() => { void handleSave(); }}
                disabled={saveDisabled}
                className="ui-button-ghost min-h-10 font-bold text-pomo"
              >
                저장
              </button>
            )}
          />
        )}
      />

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-9 px-5 pt-2 pb-12 md:gap-12 md:px-10 md:pt-4 md:pb-20">
        <div className="hidden flex-wrap items-end justify-between gap-6 md:flex">
          <div className="flex flex-col gap-1">
            <h1 className="ui-h1">설정</h1>
            <p className="m-0 text-ink-muted">공부 방식에 맞게 조정해보세요.</p>
          </div>
          <Link
            href="/profile"
            className="flex h-10 items-center gap-1.5 rounded-control px-3 font-semibold text-ink-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.2} />
            프로필로
          </Link>
        </div>

        <SettingsSection
          id="settings-subjects"
          title="과목 관리"
          description="할 일, 타이머, 공부 기록에서 같은 과목을 사용해요. 이름을 바꿔도 기록은 유지돼요."
        >
          {form.ready ? (
            <SubjectManager
              userId={form.subjectUserId}
              legacyTasks={form.tasks}
              onLegacyImported={form.handleLegacyImported}
              onBusyChange={form.setSubjectsBusy}
              showHeading={false}
              onLogin={() => { void openLogin(); }}
            />
          ) : (
            <p role="status" className="m-0 text-sm text-ink-muted">설정을 불러오는 중…</p>
          )}
        </SettingsSection>

        {/* 과목을 저장하는 동안에는 나머지 설정을 잠근다(저장 순서가 섞이지 않게). */}
        <fieldset disabled={form.subjectsBusy} className="m-0 flex min-w-0 flex-col gap-9 border-0 p-0 md:gap-12">
          <section aria-labelledby="settings-presets" className="grid min-w-0 grid-cols-1 gap-2.5 md:grid-cols-[1fr_auto] md:gap-x-4 md:gap-y-3">
            <SectionHeading
              id="settings-presets"
              title="집중 프리셋"
              description="타이머에서 바로 고를 수 있는 집중 시간이에요. 최대 3개까지 둘 수 있어요."
            />
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 md:col-span-2">
              {presets.map((preset, index) => {
                const name = `프리셋 ${index + 1}`;
                return (
                  <li key={preset.id} className="flex items-center gap-1.5 md:gap-2.5">
                    <input
                      type="text"
                      aria-label={`${name} 이름`}
                      value={preset.label}
                      onChange={(event) => form.updatePreset(preset.id, 'label', event.target.value)}
                      placeholder="이름"
                      className="ui-input min-w-0 flex-1 px-3 font-semibold md:min-h-12 md:max-w-[260px] md:rounded-tile md:px-4"
                    />
                    <Stepper
                      inputLabel={`${name} 시간 (분)`}
                      decreaseLabel={`${name} 시간 줄이기`}
                      increaseLabel={`${name} 시간 늘리기`}
                      value={preset.minutes}
                      fallback={loadedSettings.presets.find((p) => p.id === preset.id)?.minutes ?? 25}
                      onChange={(minutes) => form.updatePreset(preset.id, 'minutes', minutes)}
                      unit="분"
                      step={5}
                      min={1}
                      max={MAX_MINUTES}
                      valueClassName="min-w-12 md:min-w-14"
                    />
                    <button
                      type="button"
                      onClick={() => form.removePreset(preset.id)}
                      aria-label={`${name} 삭제`}
                      // 보이는 원은 36px(모바일)·40px, 누르는 영역은 44px(왼쪽 +버튼과 겹치지 않게 오른쪽으로 더 늘린다)
                      className="ui-icon-button size-9 text-ink-muted before:absolute before:-inset-y-1 before:-right-[5px] before:-left-[3px] before:content-[''] md:size-10 md:before:-inset-0.5"
                    >
                      <X aria-hidden="true" size={18} strokeWidth={2.2} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {presets.length < MAX_PRESETS && (
              <button
                type="button"
                onClick={addPreset}
                className="ui-button-ghost -ml-2.5 min-h-10 gap-1.5 justify-self-start px-2.5 text-sm md:col-start-2 md:row-start-1 md:ml-0 md:self-end md:px-3 md:text-[15px]"
              >
                <Plus aria-hidden="true" size={16} strokeWidth={2.5} />
                프리셋 추가
              </button>
            )}
          </section>

          <SettingsSection id="settings-times" title="기본 시간" rows>
            <SettingRow label="집중">
              <Stepper
                inputLabel="집중 시간 (분)"
                decreaseLabel="집중 줄이기"
                increaseLabel="집중 늘리기"
                value={form.pomoTime}
                fallback={loadedSettings.pomoTime}
                onChange={form.setPomoTime}
                unit="분"
                step={5}
                min={1}
                max={MAX_MINUTES}
                valueClassName="min-w-16 md:min-w-[72px]"
              />
            </SettingRow>
            <SettingRow label="짧은 휴식">
              <Stepper
                inputLabel="짧은 휴식 시간 (분)"
                decreaseLabel="짧은 휴식 줄이기"
                increaseLabel="짧은 휴식 늘리기"
                value={form.shortBreak}
                fallback={loadedSettings.shortBreak}
                onChange={form.setShortBreak}
                unit="분"
                step={1}
                min={1}
                max={MAX_MINUTES}
                valueClassName="min-w-16 md:min-w-[72px]"
              />
            </SettingRow>
            <SettingRow label="긴 휴식">
              <Stepper
                inputLabel="긴 휴식 시간 (분)"
                decreaseLabel="긴 휴식 줄이기"
                increaseLabel="긴 휴식 늘리기"
                value={form.longBreak}
                fallback={loadedSettings.longBreak}
                onChange={form.setLongBreak}
                unit="분"
                step={5}
                min={1}
                max={MAX_MINUTES}
                valueClassName="min-w-16 md:min-w-[72px]"
              />
            </SettingRow>
            <SettingRow
              label="긴 휴식 간격"
              description={(
                <>
                  <span className="md:hidden">집중 몇 번 뒤에 긴 휴식인지</span>
                  <span className="hidden md:inline">집중을 몇 번 하고 긴 휴식으로 넘어갈지</span>
                </>
              )}
            >
              <Stepper
                inputLabel="긴 휴식 간격 (사이클)"
                decreaseLabel="긴 휴식 간격 줄이기"
                increaseLabel="긴 휴식 간격 늘리기"
                value={form.longBreakInterval}
                fallback={loadedSettings.longBreakInterval}
                onChange={form.setLongBreakInterval}
                unit="사이클"
                step={1}
                min={1}
                max={MAX_LONG_BREAK_INTERVAL}
                valueClassName="min-w-16 md:min-w-[72px]"
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="settings-auto-start" title="자동 시작" rows>
            <SettingRow label="휴식 자동 시작">
              <SettingSwitch label="휴식 자동 시작" checked={form.autoStartBreaks} onChange={() => form.setAutoStartBreaks(!form.autoStartBreaks)} />
            </SettingRow>
            <SettingRow label="뽀모도로 자동 시작">
              <SettingSwitch label="뽀모도로 자동 시작" checked={form.autoStartPomos} onChange={() => form.setAutoStartPomos(!form.autoStartPomos)} />
            </SettingRow>
            <SettingRow label="저장 시 작업 메모 팝업" description="공부를 마칠 때 작업 내용과 과목을 확인해요.">
              <SettingSwitch label="저장 시 작업 메모 팝업" checked={form.taskPopupEnabled} onChange={() => form.setTaskPopupEnabled(!form.taskPopupEnabled)} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="settings-sound" title="알림 소리" rows>
            <SettingRow label="음소거">
              <SettingSwitch label="음소거" checked={isMuted} onChange={() => form.setIsMuted(!isMuted)} />
            </SettingRow>
            <div className={cn('flex flex-col gap-2 py-1.5 transition-opacity duration-200 md:gap-2.5 md:py-1', isMuted && 'opacity-40')}>
              <div className="flex items-center justify-between">
                <label htmlFor="settings-volume" className="font-semibold">볼륨</label>
                <span className="font-bold">{volume}%</span>
              </div>
              <input
                id="settings-volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                disabled={isMuted}
                onChange={(event) => form.setVolume(Number(event.target.value))}
                className="m-0 w-full accent-pomo disabled:cursor-not-allowed md:max-w-[420px]"
              />
            </div>
          </SettingsSection>

          <SettingsSection id="settings-push" title="알림 설정" rows>
            <NotificationManager mode="inline" />
          </SettingsSection>

          <AccountSection
            signedIn={signedIn}
            status={accountStatus}
            onOpenLogin={() => { void openLogin(); }}
            onResetSettings={() => { void handleResetSettings(); }}
            onLogout={handleLogout}
            onResetAccount={() => { void resetAccount({ beforeLeave: leave }); }}
            onDeleteAccount={() => { void deleteAccount(router, { beforeLeave: leave }); }}
          />

          <SettingsSection id="settings-support" title="후원" description="서비스가 마음에 드셨다면, 커피 한 잔으로 응원해주세요.">
            <DonationSection variant="minimal" showDescription={false} />
          </SettingsSection>
        </fieldset>

        {/* 저장 상태: 모바일은 맨 위(저장 버튼은 상단 바), 데스크톱은 맨 아래 저장하기 옆 */}
        <div className="order-first -mb-7 min-h-5 md:order-none md:mb-0 md:flex md:items-center md:gap-3.5 md:pt-2">
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saveDisabled}
            className="ui-button-primary ui-press hidden min-h-[52px] rounded-2xl px-7 text-base md:inline-flex"
          >
            저장하기
          </button>
          <span role="status" className="text-[13px] text-ink-muted md:text-sm">{status}</span>
        </div>
      </div>
    </>
  );
}
