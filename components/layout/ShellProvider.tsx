'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useFriendRequestCount } from '@/hooks/useFriendRequestCount';

type ShellState = {
  session: Session | null;
  friendRequestCount: number;
};

const ShellContext = createContext<ShellState>({ session: null, friendRequestCount: 0 });

// 헤더·상단 바·탭 바가 함께 쓰는 상태. 받은 친구 요청 구독은 앱 전체에서 한 번만 연다.
export function ShellProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthSession();
  const friendRequestCount = useFriendRequestCount(session);

  return (
    <ShellContext.Provider value={{ session, friendRequestCount }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  return useContext(ShellContext);
}
