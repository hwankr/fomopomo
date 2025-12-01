'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { User, Clock, MoreVertical, LogOut, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoomMember {
    user_id: string;
    joined_at: string;
    user: {
        id: string;
        username: string;
        status: 'online' | 'offline' | 'studying' | 'paused';
        current_task: string | null;
        last_active_at: string;
        is_task_public: boolean;
    };
}

interface RoomViewProps {
    roomId: string;
}

export default function RoomView({ roomId }: RoomViewProps) {
    const [members, setMembers] = useState<RoomMember[]>([]);
    const [roomName, setRoomName] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setCurrentUser(user);
            await fetchRoomDetails(user.id);
            await fetchMembers();
        };
        init();

        // Real-time subscription for member status updates
        const channel = supabase
            .channel(`room-${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'room_members',
                    filter: `room_id=eq.${roomId}`
                },
                () => fetchMembers()
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles'
                },
                (payload) => {
                    setMembers(prev => prev.map(m =>
                        m.user_id === payload.new.id
                            ? { ...m, user: { ...m.user, ...payload.new } }
                            : m
                    ));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, router]);

    const fetchRoomDetails = async (userId: string) => {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (error) {
            toast.error('Room not found');
            router.push('/rooms');
            return;
        }

        setRoomName(data.name);
        setIsOwner(data.owner_id === userId);
    };

    const fetchMembers = async () => {
        const { data, error } = await supabase
            .from('room_members')
            .select(`
        user_id,
        joined_at,
        user:user_id (
          id,
          username,
          status,
          current_task,
          last_active_at,
          is_task_public
        )
      `)
            .eq('room_id', roomId);

        if (error) {
            console.error('Error fetching members:', error);
            return;
        }

        // Transform data to match interface
        const formattedMembers = data.map((m: any) => ({
            user_id: m.user_id,
            joined_at: m.joined_at,
            user: m.user
        }));

        setMembers(formattedMembers);
        setLoading(false);
    };

    const leaveRoom = async () => {
        if (!currentUser) return;
        if (confirm('Are you sure you want to leave this room?')) {
            const { error } = await supabase
                .from('room_members')
                .delete()
                .match({ room_id: roomId, user_id: currentUser.id });

            if (error) {
                toast.error('Failed to leave room');
            } else {
                router.push('/rooms');
            }
        }
    };

    const deleteRoom = async () => {
        if (confirm('Delete this room? All members will be removed.')) {
            const { error } = await supabase
                .from('rooms')
                .delete()
                .eq('id', roomId);

            if (error) {
                toast.error('Failed to delete room');
            } else {
                router.push('/rooms');
            }
        }
    };

    if (loading) return <div className="text-center p-8 text-gray-400">Loading room...</div>;

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="flex justify-between items-center mb-8 bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{roomName}</h1>
                    <div className="flex items-center gap-2 text-gray-400">
                        <User size={16} />
                        <span>{members.length} Members</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    {isOwner ? (
                        <button
                            onClick={deleteRoom}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors"
                        >
                            <Trash2 size={18} />
                            Delete Room
                        </button>
                    ) : (
                        <button
                            onClick={leaveRoom}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                        >
                            <LogOut size={18} />
                            Leave
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {members.map((member) => (
                    <div
                        key={member.user_id}
                        className={`
              relative p-6 rounded-2xl border transition-all
              ${member.user.status === 'studying'
                                ? 'bg-purple-900/20 border-purple-500/30'
                                : 'bg-[#1A1A1A] border-white/5'
                            }
            `}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`
                  w-3 h-3 rounded-full
                  ${member.user.status === 'studying' ? 'bg-green-500 animate-pulse' :
                                        member.user.status === 'paused' ? 'bg-yellow-500' :
                                            member.user.status === 'online' ? 'bg-blue-500' : 'bg-gray-500'}
                `} />
                                <div>
                                    <h3 className="font-semibold text-lg">{member.user.username || 'Anonymous'}</h3>
                                    <p className="text-xs text-gray-400 capitalize">{member.user.status}</p>
                                </div>
                            </div>
                            {member.user.status === 'studying' && (
                                <div className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-lg animate-pulse">
                                    Focusing
                                </div>
                            )}
                        </div>

                        <div className="bg-black/20 p-4 rounded-xl">
                            <div className="text-sm text-gray-400 mb-1">Current Task</div>
                            <div className="font-medium text-white truncate">
                                {member.user.current_task || (
                                    <span className="text-gray-600 italic">No active task</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
