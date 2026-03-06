import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

export function useFriendRequestCount(session: Session | null) {
  const [count, setCount] = useState(0);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      return;
    }

    const fetchCount = async () => {
      try {
        const { count: requestCount, error } = await supabase
          .from('friend_requests')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', userId)
          .eq('status', 'pending');

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
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return userId ? count : 0;
}
