import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

export function usePendingFeedbackCount(session: Session | null) {
  const [count, setCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let channel: any = null;

    const init = async () => {
         if (!session?.user) {
             setCount(0);
             setIsAdmin(false);
             return;
         }

         // 1. Check admin
         const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
        
        if (profile?.role !== 'admin') {
            setIsAdmin(false);
            return;
        }
        setIsAdmin(true);

        // 2. Fetch func
        const fetchCount = async () => {
            const { count: requestCount } = await supabase
                .from('feedbacks')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            
            if (requestCount !== null) setCount(requestCount);
        };

        fetchCount();

        // 3. Subscribe
        channel = supabase
            .channel('admin-feedback-count')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'feedbacks' },
                () => fetchCount()
            )
            .subscribe();
    };

    init();

    return () => {
        if (channel) supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  return isAdmin ? count : 0;
}
