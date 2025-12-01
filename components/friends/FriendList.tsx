'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

interface FriendListProps {
  session: Session;
  refreshTrigger: number;
}

interface FriendProfile {
  status: 'online' | 'offline' | 'studying' | 'paused' | null;
  current_task: string | null;
  last_active_at: string | null;
}

interface Friendship {
  id: string;
  friend_email: string;
  friend_id: string;
  created_at: string;
  friend: FriendProfile;
}

export default function FriendList({ session, refreshTrigger }: FriendListProps) {
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFriends();

    const channel = supabase
      .channel('friend-list-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          setFriends((prev) =>
            prev.map((f) => {
              if (f.friend_id === payload.new.id) {
                return {
                  ...f,
                  friend: {
                    ...f.friend,
                    status: payload.new.status,
                    current_task: payload.new.current_task,
                    last_active_at: payload.new.last_active_at,
                  },
                };
              }
              return f;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refreshTrigger]);

  const fetchFriends = async () => {
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          friend_email,
          friend_id,
          created_at,
          friend:friend_id (
            status,
            current_task,
            last_active_at
          )
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFriends(data as any || []);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string | null, task: string | null) => {
    switch (status) {
      case 'studying':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Studying{task ? `: ${task}` : ''}
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case 'online':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Online
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Offline
          </span>
        );
    }
  };

  if (loading) return <div className="text-gray-500">Loading friends...</div>;

  if (friends.length === 0) {
    return <div className="text-gray-500">No friends yet. Add some!</div>;
  }

  return (
    <ul className="space-y-3">
      {friends.map((friend) => (
        <li key={friend.id} className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-indigo-100 dark:hover:border-indigo-900 transition-colors">
          <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-medium text-sm shrink-0">
              {friend.friend_email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-white truncate">{friend.friend_email}</p>
                <div className="shrink-0">
                  {getStatusBadge(friend.friend?.status, friend.friend?.current_task)}
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Added {new Date(friend.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
