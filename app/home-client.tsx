'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthSession } from '@/hooks/useAuthSession';

import TimerApp, { type TimerStage } from '@/components/TimerApp';
import HistoryList from '@/components/HistoryList';
import LoginModal from '@/components/LoginModal';

import { toast } from 'react-hot-toast';

import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';
import { SlidersVertical } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MobileTopBar, { Wordmark } from '@/components/layout/MobileTopBar';
import NotificationBell from '@/components/layout/NotificationBell';
import { TONE_TINT_BG } from '@/components/timer/ui/timerDisplayUtils';
import { cn } from '@/lib/utils';

const RESTING_STAGE: TimerStage = { tone: null, busy: false, startCount: 0 };

export default function HomeClient() {
  const { session, loading: isLoading } = useAuthSession();

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isTimerSettingsOpen, setIsTimerSettingsOpen] = useState(false);

  // 기록 목록 새로고침을 위한 트리거 상태
  const [historyUpdateTrigger, setHistoryUpdateTrigger] = useState(0);

  // 무대: 쉬는 동안은 중립 회색, 시계가 도는 동안은 모드 색(TimerApp이 알려 준다).
  // TimerApp은 저장된 상태를 되살린 뒤의 무대를 그리기 전에 처음 알려 준다. 그 전(null)에는 쉬는 무대로 둔다.
  const [reportedStage, setReportedStage] = useState<TimerStage | null>(null);
  const stage = reportedStage ?? RESTING_STAGE;

  // 무대 높이·바탕색·시트 접힘 같은 이 화면의 전환을 켤지. 화면이 붙은 뒤 처음 알려 받은 무대(되살린 상태)는
  // 처음부터 그 모습이어야 한다(처음 불러오기에서는 움직이지 않는다, docs/design-system.md §8). 그런데 그 전에
  // 헤더·구슬이 크기를 재느라 브라우저가 쉬는 무대 값을 한 번 계산해 두므로, 전환이 켜져 있으면 그 값에서
  // 되살린 무대로 가는 전환이 돈다. 그래서 첫 무대를 적용할 때까지 이 화면 안의 전환을 모두 끄고,
  // 브라우저가 적용된 값을 계산한 뒤에 켠다. 모두 그리기 전에 끝난다.
  const rootRef = useRef<HTMLDivElement>(null);
  const [motionReady, setMotionReady] = useState(false);
  useLayoutEffect(() => {
    if (reportedStage === null || motionReady) return;
    // 레이아웃을 읽어 지금 값(되살린 무대)을 계산하게 한다. 이 값이 전환의 출발점이 되므로 켜는 순간에는 바뀐 값이 없다.
    rootRef.current?.getBoundingClientRect();
    // 이 다시 그리기는 일부러다: 값을 계산한 뒤, 그리기 전에 한 번만 전환을 켠다(화면이 붙을 때 한 번).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMotionReady(true);
  }, [reportedStage, motionReady]);

  // 최근 활동 시트: 실행 중·방금 끝난 동안은 접어 두되 잠깐 펼쳐 볼 수 있고(peek),
  // 쉬는 동안은 사용자가 접었을 때만 접는다. 시계가 새로 움직이면(시작·재개, 끝난 뒤
  // 다음 단계나 반복 시작 포함) 다시 접힌다. busy는 끝남 → 다음 단계에서 바뀌지 않으므로
  // 시작 횟수로 판단한다.
  const [peek, setPeek] = useState(false);
  const [hideIdle, setHideIdle] = useState(false);
  const [seenStartCount, setSeenStartCount] = useState(stage.startCount);
  if (seenStartCount !== stage.startCount) {
    setSeenStartCount(stage.startCount);
    setPeek(false);
  }
  const sheetCollapsed = stage.busy ? !peek : hideIdle;
  const toggleSheet = () => {
    if (stage.busy) setPeek((current) => !current);
    else setHideIdle((current) => !current);
  };

  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      const handled = handleInAppBrowser();
      if (handled) {
        toast.error(
          '구글 로그인은 보안 정책상\n외부 브라우저(크롬, 사파리 등)에서\n진행해야 합니다.',
          {
            duration: 5000,
          }
        );
        return;
      }
    }

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  if (isLoading) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-surface"
        suppressHydrationWarning
        role="status"
        aria-label="타이머 불러오는 중"
      >
        <div className="size-8 animate-spin rounded-full border-2 border-bead border-t-pomo" />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'flex flex-col',
        // 켜기 전에는 루트와 안쪽(무대·타이머·시트)의 전환을 모두 끈다. 동작 줄이기에서는 전역 규칙이 모든 요소에
        // 아주 짧은 전환(transition-property 기본값 all)을 주므로, 루트도 끄지 않으면 첫 프레임이 바뀌기 전 색으로 그려진다.
        motionReady ? 'transition-colors duration-(--duration-emphasized) ease-enter' : 'transition-none! [&_*]:transition-none!',
        stage.tone ? TONE_TINT_BG[stage.tone] : 'bg-surface',
        // 색이 든 무대에서는 헤더 아바타 바탕을 반투명 흰색으로 둔다.
        stage.tone && '[--header-avatar-bg:rgb(255_255_255/.75)]',
      )}
    >
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
      />

      {/* 무대: 헤더와 타이머. 시트가 접히면 화면 아래까지 늘어나 시트 머리만 남긴다. */}
      <div
        className={cn(
          // 시트 몸통(ui-collapse)과 함께 움직인다. md는 펼친 무대가 min-h-0이라 보이는 구간이 접을 때 끝·펼칠 때 처음뿐이어서 가속을 바꿔 그 구간을 늘린다.
          'flex flex-col',
          motionReady && 'transition-[min-height]',
          motionReady && (sheetCollapsed
            ? 'duration-(--duration-exit) ease-exit md:duration-(--duration-emphasized) md:ease-enter'
            : 'duration-(--duration-emphasized) ease-enter md:ease-exit'),
          sheetCollapsed
            ? 'min-h-[calc(100dvh-var(--tabbar-height)-56px)] md:min-h-[calc(100dvh-72px)]'
            : 'min-h-[calc(100dvh-var(--tabbar-height)-240px)] md:min-h-0',
        )}
      >
        <Navbar
          session={session}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          mobileTopBar={
            <MobileTopBar
              start={<Wordmark />}
              end={
                <>
                  {session ? (
                    <NotificationBell variant="topbar" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsLoginModalOpen(true)}
                      className="ui-button-secondary min-h-10 px-4 text-sm"
                    >
                      로그인
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsTimerSettingsOpen(true)}
                    // Space가 타이머 전역 단축키로 새지 않게 한다.
                    onKeyDown={(event) => event.stopPropagation()}
                    aria-label="타이머 설정"
                    className="ui-icon-button"
                  >
                    <SlidersVertical aria-hidden="true" size={18} strokeWidth={1.8} />
                  </button>
                </>
              }
            />
          }
        />

        {/* TimerApp에 콜백 전달: 저장 완료 시 트리거 숫자를 증가시킴 */}
        <TimerApp
          onRecordSaved={() => setHistoryUpdateTrigger((prev) => prev + 1)}
          isLoggedIn={!!session}
          settingsOpen={isTimerSettingsOpen}
          onSettingsOpenChange={setIsTimerSettingsOpen}
          onStageChange={setReportedStage}
          onOpenLogin={() => setIsLoginModalOpen(true)}
        />
      </div>

      {/* 최근 활동 시트 */}
      <div className="relative flex flex-col rounded-t-dialog bg-white pt-2 text-ink shadow-sheet md:rounded-t-sheet md:pt-4">
        <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
        {/* HistoryList에 트리거 전달: 숫자가 바뀌면 새로고침 됨 */}
        <HistoryList
          updateTrigger={historyUpdateTrigger}
          session={session}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          collapsed={sheetCollapsed}
          onToggleCollapsed={toggleSheet}
        />
      </div>
    </div>
  );
}
