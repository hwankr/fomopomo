'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useFriendRequestState } from '@/hooks/useFriendRequestCount';
import { guardClosingPopovers } from '@/components/ui/popoverExit';

type ShellState = {
  session: Session | null;
  friendRequestCount: number;
  /** 새 친구 요청이 올 때마다(요청 수가 늘 때) 1씩 는다. 처음 불러온 수는 세지 않는다. 알림 점의 팝에 쓴다. */
  friendRequestPulse: number;
};

const ShellContext = createContext<ShellState>({ session: null, friendRequestCount: 0, friendRequestPulse: 0 });

// 같은 계정에서 첫 조회가 끝난 뒤 요청 수가 늘 때만 센다(처음 불러온 수, 계정 전환은 새 알림이 아니다).
function useNewRequestPulse(userId: string | null, count: number, loaded: boolean) {
  const [tracked, setTracked] = useState({ userId, count, loaded });
  const [pulse, setPulse] = useState(0);

  if (tracked.userId !== userId || tracked.count !== count || tracked.loaded !== loaded) {
    if (tracked.userId === userId && tracked.loaded && loaded && count > tracked.count) setPulse(pulse + 1);
    setTracked({ userId, count, loaded });
  }

  return pulse;
}

// 헤더·상단 바·탭 바가 함께 쓰는 상태. 받은 친구 요청 구독은 앱 전체에서 한 번만 연다.
export function ShellProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthSession();
  const { count: friendRequestCount, loaded: friendRequestsLoaded } = useFriendRequestState(session);
  const friendRequestPulse = useNewRequestPulse(session?.user?.id ?? null, friendRequestCount, friendRequestsLoaded);
  // 닫히는 팝오버·메뉴가 퇴장 애니메이션 동안 클릭·포커스를 받지 않게 한다(앱 전체에 한 번).
  useEffect(() => guardClosingPopovers(), []);
  const value = useMemo(
    () => ({ session, friendRequestCount, friendRequestPulse }),
    [session, friendRequestCount, friendRequestPulse],
  );

  return (
    <ShellContext.Provider value={value}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  return useContext(ShellContext);
}
