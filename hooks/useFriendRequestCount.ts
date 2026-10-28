import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

export function useFriendRequestCount(session: Session | null) {
  return useFriendRequestState(session).count;
}

/**
 * 받은 친구 요청 수와, 지금 계정의 첫 조회가 끝났는지(loaded).
 * loaded 전의 0은 아직 모르는 값이고, loaded 뒤에 수가 늘면 새 요청이 온 것이다(알림 점 팝).
 */
export function useFriendRequestState(session: Session | null) {
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const userId = session?.user?.id ?? null;

  // 계정 전환/로그아웃 시 이전 계정의 요청 수가 잠시라도 남지 않도록 렌더 중 동기적으로 초기화한다.
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setCount(0);
    setLoaded(false);
  }

  useEffect(() => {
    if (!userId) {
      return;
    }

    // effect 정리 후(사용자 전환 포함) 도착한 응답은 폐기한다.
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const { count: requestCount, error } = await supabase
          .from('friend_requests')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', userId)
          .eq('status', 'pending');

        if (cancelled) return;
        if (!error && requestCount !== null) {
          setCount(requestCount);
          setLoaded(true);
        }
      } catch (error) {
        console.error('Error fetching friend request count:', error);
      }
    };

    fetchCount();

    const channel = supabase
      .channel(`friend-request-count-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          // Re-fetch count on any relevant change
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return userId ? { count, loaded } : { count: 0, loaded: false };
}
