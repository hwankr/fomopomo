'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Users, UserPlus, UserMinus, X, Edit2, Check, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

type Profile = {
    id: string;
    username: string;
    status: 'online' | 'offline' | 'studying' | 'paused';
    current_task: string | null;
    last_active_at: string;
    // Joined fields
    nickname?: string;
    group_name?: string;
    is_task_public?: boolean;
};

type GroupedFriends = {
    [key: string]: Profile[];
};

export default function FriendsSection({ user }: { user: User }) {
    const [friends, setFriends] = useState<Profile[]>([]);
    const [showAddFriend, setShowAddFriend] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [myInviteCode, setMyInviteCode] = useState('');

    const [isTaskPublic, setIsTaskPublic] = useState(true);

    useEffect(() => {
        // Fetch my profile settings
        const fetchMyProfile = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('invite_code, is_task_public')
                .eq('id', user.id)
                .single();
            if (data) {
                setMyInviteCode(data.invite_code);
                setIsTaskPublic(data.is_task_public ?? true);
            }
        };

        // Fetch friends
        const fetchFriends = async () => {
            const { data } = await supabase
                .from('friendships')
                .select(`
          nickname,
          group_name,
          friend:friend_id (
            id,
            username,
            status,
            current_task,
            last_active_at,
            is_task_public
          )
        `)
                .eq('user_id', user.id);

            if (data) {
                setFriends(data.map((f: any) => ({
                    ...f.friend,
                    nickname: f.nickname,
                    group_name: f.group_name || 'Uncategorized'
                })));
            }
        };

        fetchMyProfile();
        fetchFriends();

        // Subscribe to status changes
        const channel = supabase
            .channel('friend-status')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                },
                (payload) => {
                    setFriends((prev) =>
                        prev.map((friend) =>
                            friend.id === payload.new.id ? { ...friend, ...payload.new } : friend
                        )
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user.id]);

    const togglePrivacy = async () => {
        const newValue = !isTaskPublic;
        setIsTaskPublic(newValue);
        try {
            await supabase.from('profiles').update({ is_task_public: newValue }).eq('id', user.id);
            toast.success(newValue ? 'Task visibility enabled' : 'Task visibility disabled');
        } catch (e) {
            console.error(e);
            setIsTaskPublic(!newValue); // Revert
            toast.error('Failed to update privacy settings');
        }
    };

    const handleAddFriend = async () => {
        if (!inviteCode) return;
        setLoading(true);

        try {
            // Find user by invite code
            const { data: friend, error: findError } = await supabase
                .from('profiles')
                .select('id, username')
                .eq('invite_code', inviteCode)
                .single();

            if (findError || !friend) {
                toast.error('User not found');
                return;
            }

            if (friend.id === user.id) {
                toast.error('You cannot add yourself');
                return;
            }

            // Add friendship (Bidirectional using RPC)
            const { error: addError } = await supabase.rpc('add_friend', {
                p_friend_id: friend.id
            });

            if (addError) {
                console.error(addError);
                if (addError.message.includes('Already friends')) {
                    toast.error('Already friends');
                } else {
                    toast.error('Failed to add friend');
                }
            } else {
                toast.success(`Added ${friend.username}!`);
                setInviteCode('');
                setShowAddFriend(false);
                // Refresh list
                const { data } = await supabase
                    .from('friendships')
                    .select(`
            nickname,
            group_name,
            friend:friend_id (
                id,
                username,
                status,
                current_task,
                last_active_at,
                is_task_public
            )
            `)
                    .eq('user_id', user.id);
                if (data) {
                    setFriends(data.map((f: any) => ({
                        ...f.friend,
                        nickname: f.nickname,
                        group_name: f.group_name || 'Uncategorized'
                    })));
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveFriend = async (friendId: string, friendName: string) => {
        if (!confirm(`Are you sure you want to remove ${friendName}?`)) return;

        try {
            // Remove bidirectional friendship
            const { error } = await supabase
                .from('friendships')
                .delete()
                .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

            if (error) {
                toast.error('Failed to remove friend');
                console.error(error);
            } else {
                toast.success(`Removed ${friendName}`);
                setFriends((prev) => prev.filter((f) => f.id !== friendId));
            }
        } catch (e) {
            console.error(e);
            toast.error('Error removing friend');
        }
    };

    const handleUpdateFriend = async (friendId: string, nickname: string, groupName: string) => {
        try {
            const { error } = await supabase
                .from('friendships')
                .update({ nickname, group_name: groupName })
                .eq('user_id', user.id)
                .eq('friend_id', friendId);

            if (error) throw error;

            toast.success('Updated friend info');
            setFriends(prev => prev.map(f =>
                f.id === friendId ? { ...f, nickname, group_name: groupName || 'Uncategorized' } : f
            ));
            setEditingFriend(null);
        } catch (e) {
            console.error(e);
            toast.error('Failed to update');
        }
    };

    const [editingFriend, setEditingFriend] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ nickname: '', group_name: '' });

    const startEditing = (friend: Profile) => {
        setEditingFriend(friend.id);
        setEditForm({
            nickname: friend.nickname || '',
            group_name: friend.group_name === 'Uncategorized' ? '' : friend.group_name || ''
        });
    };

    // Group friends
    const groupedFriends = friends.reduce((acc, friend) => {
        const group = friend.group_name || 'Uncategorized';
        if (!acc[group]) acc[group] = [];
        acc[group].push(friend);
        return acc;
    }, {} as GroupedFriends);

    const [expandedGroups, setExpandedGroups] = useState<string[]>(Object.keys(groupedFriends));

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev =>
            prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
        );
    };

    return (
        <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Users size={20} />
                    Friends
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={togglePrivacy}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isTaskPublic
                            ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900'
                            : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
                            }`}
                    >
                        {isTaskPublic ? 'Public Tasks' : 'Private Tasks'}
                    </button>
                    <button
                        onClick={() => setShowAddFriend(!showAddFriend)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                        <UserPlus size={20} />
                    </button>
                </div>
            </div>

            {showAddFriend && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">My Invite Code: <span className="font-mono font-bold text-gray-900 dark:text-white select-all">{myInviteCode}</span></div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="Enter friend's invite code"
                            className="flex-1 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <button
                            onClick={handleAddFriend}
                            disabled={loading}
                            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                        >
                            {loading ? '...' : 'Add'}
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {friends.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                        No friends yet. Add some!
                    </p>
                ) : (
                    Object.entries(groupedFriends).map(([group, groupFriends]) => (
                        <div key={group} className="space-y-2">
                            <button
                                onClick={() => toggleGroup(group)}
                                className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full text-left"
                            >
                                {expandedGroups.includes(group) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                {group} ({groupFriends.length})
                            </button>

                            {expandedGroups.includes(group) && (
                                <div className="space-y-2 pl-2">
                                    {groupFriends.map((friend) => (
                                        <div key={friend.id} className="group flex items-center justify-between p-3 bg-white dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-rose-200 dark:hover:border-rose-800 transition-colors">
                                            {editingFriend === friend.id ? (
                                                <div className="flex-1 flex gap-2 items-center">
                                                    <input
                                                        value={editForm.nickname}
                                                        onChange={e => setEditForm({ ...editForm, nickname: e.target.value })}
                                                        placeholder="Nickname"
                                                        className="p-1 text-sm border rounded bg-transparent dark:text-white dark:border-gray-600"
                                                    />
                                                    <input
                                                        value={editForm.group_name}
                                                        onChange={e => setEditForm({ ...editForm, group_name: e.target.value })}
                                                        placeholder="Group"
                                                        className="p-1 text-sm border rounded bg-transparent dark:text-white dark:border-gray-600"
                                                    />
                                                    <button onClick={() => handleUpdateFriend(friend.id, editForm.nickname, editForm.group_name)} className="text-green-500"><Check size={16} /></button>
                                                    <button onClick={() => setEditingFriend(null)} className="text-gray-400"><X size={16} /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shadow-sm">
                                                                {friend.username?.[0]?.toUpperCase() || '?'}
                                                            </div>
                                                            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${friend.status === 'studying' ? 'bg-green-500' :
                                                                friend.status === 'paused' ? 'bg-yellow-500' :
                                                                    'bg-gray-400'
                                                                }`} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="text-gray-900 dark:text-white font-medium">
                                                                    {friend.nickname || friend.username}
                                                                    {friend.nickname && <span className="text-xs text-gray-400 ml-1">({friend.username})</span>}
                                                                </div>
                                                                <button onClick={() => startEditing(friend)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity">
                                                                    <Edit2 size={12} />
                                                                </button>
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                                <span className={
                                                                    friend.status === 'studying' ? 'text-green-600 dark:text-green-400 font-medium' :
                                                                        friend.status === 'paused' ? 'text-yellow-600 dark:text-yellow-400' : ''
                                                                }>
                                                                    {friend.status === 'studying' ? 'Studying' :
                                                                        friend.status === 'paused' ? 'Paused' : 'Offline'}
                                                                </span>
                                                                {friend.status === 'studying' && (
                                                                    <>
                                                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                                                        <span className="truncate max-w-[150px]">
                                                                            {friend.is_task_public !== false ? (friend.current_task || 'No Task') : '🔒 Secret Task'}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveFriend(friend.id, friend.username)}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Remove friend"
                                                    >
                                                        <UserMinus size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
