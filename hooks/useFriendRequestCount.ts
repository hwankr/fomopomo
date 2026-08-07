import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

export function useFriendRequestCount(session: Session | null) {
  const [count, setCount] = useState(0);
  const userId = session?.user?.id ?? null;

  // 계정 전환/로그아웃 시 이전 계정의 요청 수가 잠시라도 남지 않도록 렌더 중 동기적으로 초기화한다.
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setCount(0);
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

  return userId ? count : 0;
}
