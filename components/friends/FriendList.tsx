'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Pencil, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';


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
  nickname: string | null;
  created_at: string;
  friend: FriendProfile;
}

export default function FriendList({ session, refreshTrigger }: FriendListProps) {
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingFriend, setDeletingFriend] = useState<{ id: string; name: string; friendId: string } | null>(null);


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
          nickname,
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

  const confirmDelete = (friend: Friendship) => {
    setDeletingFriend({
      id: friend.id,
      name: friend.nickname || friend.friend_email,
      friendId: friend.friend_id
    });
  };

  const handleDelete = async () => {
    if (!deletingFriend) return;

    try {
      const { error } = await supabase.rpc('delete_friend', { friend_uuid: deletingFriend.friendId });

      if (error) throw error;
      setFriends(prev => prev.filter(f => f.id !== deletingFriend.id));
      toast.success('친구가 삭제되었습니다.');
      setDeletingFriend(null);
    } catch (error) {
      console.error('Error deleting friend:', error);
      toast.error('친구 삭제에 실패했습니다.');
    }
  };


  const handleStartEdit = (friend: Friendship) => {
    setEditingId(friend.id);
    setEditName(friend.nickname || friend.friend_email);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ nickname: editName.trim() || null })
        .eq('id', id);

      if (error) throw error;

      setFriends(prev => prev.map(f =>
        f.id === id ? { ...f, nickname: editName.trim() || null } : f
      ));
      setEditingId(null);
      toast.success('닉네임이 수정되었습니다.');
    } catch (error) {
      console.error('Error updating nickname:', error);
      toast.error('닉네임 수정에 실패했습니다.');
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

  if (loading) return <div className="text-gray-500">친구 목록을 불러오는 중...</div>;

  if (friends.length === 0) {
    return <div className="text-gray-500">아직 친구가 없습니다. 친구를 추가해보세요!</div>;
  }


  return (
    <ul className="space-y-3">
      {friends.map((friend) => (
        <li key={friend.id} className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-indigo-100 dark:hover:border-indigo-900 transition-colors">
          <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-medium text-sm shrink-0">
              {(friend.nickname || friend.friend_email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                {editingId === friend.id ? (
                  <div className="flex items-center gap-2 w-full max-w-[200px]">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(friend.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <button
                      onClick={() => handleSaveEdit(friend.id)}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 rounded"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {friend.nickname || friend.friend_email || '알 수 없는 사용자'}
                    </p>

                    {friend.nickname && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        ({friend.friend_email})
                      </span>
                    )}
                    <button
                      onClick={() => handleStartEdit(friend)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                      title="Edit nickname"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-3 shrink-0">
                  {getStatusBadge(friend.friend?.status, friend.friend?.current_task)}
                  <button
                    onClick={() => confirmDelete(friend)}

                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-900/30 rounded-lg transition-all"
                    title="Remove friend"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Added {new Date(friend.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </li>
      ))}
      {/* Delete Confirmation Modal */}
      {deletingFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">친구 삭제</h3>
            </div>

            <p className="text-gray-600 dark:text-gray-300">
              정말로 <span className="font-medium text-gray-900 dark:text-white">{deletingFriend.name}</span>님을 친구 목록에서 삭제하시겠습니까?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeletingFriend(null)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-xl font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 text-white bg-rose-600 hover:bg-rose-700 rounded-xl font-medium transition-colors shadow-sm"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </ul>

  );
}
