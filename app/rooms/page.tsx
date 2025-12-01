'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Plus, Users, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

interface Room {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
    member_count?: number;
}

export default function RoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [user, setUser] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setUser(user);
            fetchRooms();
        };
        checkUser();
    }, [router]);

    const fetchRooms = async () => {
        try {
            const { data, error } = await supabase
                .from('rooms')
                .select(`
          *,
          room_members (count)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedRooms = data.map((room: any) => ({
                ...room,
                member_count: room.room_members[0]?.count || 0
            }));

            setRooms(formattedRooms);
        } catch (error) {
            console.error('Error fetching rooms:', error);
            toast.error('Failed to load rooms');
        } finally {
            setLoading(false);
        }
    };

    const createRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoomName.trim() || !user) return;

        try {
            const { data, error } = await supabase
                .from('rooms')
                .insert([
                    { name: newRoomName, owner_id: user.id }
                ])
                .select()
                .single();

            if (error) throw error;

            // Auto-join the creator
            await supabase
                .from('room_members')
                .insert([{ room_id: data.id, user_id: user.id }]);

            toast.success('Room created!');
            setNewRoomName('');
            setShowCreateModal(false);
            router.push(`/rooms/${data.id}`);
        } catch (error) {
            console.error('Error creating room:', error);
            toast.error('Failed to create room');
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                        Study Rooms
                    </h1>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                    >
                        <Plus size={20} />
                        Create Room
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-gray-400">Loading rooms...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rooms.map((room) => (
                            <div
                                key={room.id}
                                onClick={() => router.push(`/rooms/${room.id}`)}
                                className="group p-6 bg-[#1A1A1A] border border-white/5 rounded-2xl hover:border-purple-500/50 hover:bg-[#222] transition-all cursor-pointer"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-xl font-semibold group-hover:text-purple-400 transition-colors">
                                        {room.name}
                                    </h3>
                                    <div className="flex items-center gap-1 text-gray-400 text-sm bg-black/20 px-2 py-1 rounded-lg">
                                        <Users size={14} />
                                        {room.member_count}
                                    </div>
                                </div>
                                <div className="flex items-center text-sm text-gray-500">
                                    Created {new Date(room.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Create Room Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/10 w-full max-w-md">
                            <h2 className="text-2xl font-bold mb-4">Create New Room</h2>
                            <form onSubmit={createRoom}>
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    placeholder="Room Name"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-purple-500"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="px-4 py-2 text-gray-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl font-medium transition-colors"
                                    >
                                        Create
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
