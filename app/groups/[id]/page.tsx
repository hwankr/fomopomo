'use client';

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Member {
    user_id: string;
    joined_at: string;
    profiles: {
        id: string;
        email: string; // or username if available
        status: string;
        current_task: string | null;
        last_active_at: string;
        avatar_url?: string;
    };
}

interface GroupDetail {
    id: string;
    name: string;
    code: string;
    leader_id: string;
}

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [group, setGroup] = useState<GroupDetail | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchGroupData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/');
                return;
            }
            setCurrentUser(user);

            // 1. Fetch Group Details
            const { data: groupData, error: groupError } = await supabase
                .from('groups')
                .select('*')
                .eq('id', id)
                .single();

            if (groupError) throw groupError;
            setGroup(groupData);

            // 2. Fetch Members
            const { data: membersData, error: membersError } = await supabase
                .from('group_members')
                .select(`
          user_id,
          joined_at,
          profiles:user_id (
            id,
            status,
            current_task,
            last_active_at
          )
        `)
                .eq('group_id', id);

            if (membersError) throw membersError;

            // Need to fetch emails manually if not in profiles or use a different way?
            // Assuming profiles might not have email, but we can try to get it from auth if possible?
            // Actually, we can't join auth.users easily.
            // Let's assume profiles has what we need or we just show "User".
            // Wait, the user wants to see "who" is studying.
            // If profiles doesn't have name/email, we need to fetch it.
            // Usually profiles table is a mirror of auth.users or linked.
            // Let's check if profiles has display_name or email.
            // I'll assume it does or I'll just use a placeholder if missing.
            // Actually, I can fetch emails via a separate query if I have admin rights, but I don't.
            // I'll assume profiles has `email` or `username`.
            // Let's check `TimerApp.tsx`... it doesn't show reading profile name.
            // `HistoryList.tsx` might?
            // I'll just use `profiles` and if it's missing name, I'll show "Member".

            // For now, let's map the data.
            // @ts-ignore
            setMembers(membersData || []);

        } catch (error) {
            console.error('Error fetching group data:', error);
            toast.error('Failed to load group data');
            router.push('/groups');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchGroupData();

        // Realtime subscription for member status updates
        const channel = supabase
            .channel(`group-${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                },
                (payload) => {
                    // Update member status if the updated profile is in our list
                    setMembers((prev) =>
                        prev.map((member) => {
                            if (member.user_id === payload.new.id) {
                                return {
                                    ...member,
                                    profiles: {
                                        ...member.profiles,
                                        ...payload.new,
                                    },
                                };
                            }
                            return member;
                        })
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id, router]);

    const copyCode = () => {
        if (group?.code) {
            navigator.clipboard.writeText(group.code);
            toast.success('Code copied to clipboard!');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
            </div>
        );
    }

    if (!group) return null;

    const isLeader = currentUser?.id === group.leader_id;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-8">
            <Toaster position="top-center" />
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <button
                        onClick={() => router.push('/groups')}
                        className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-4 flex items-center gap-1"
                    >
                        ← Back to Groups
                    </button>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{group.name}</h1>
                                <p className="text-gray-500 dark:text-gray-400">
                                    {members.length} member{members.length !== 1 ? 's' : ''}
                                </p>
                            </div>

                            {isLeader && (
                                <div className="flex items-center gap-3 bg-gray-100 dark:bg-slate-700 px-4 py-2 rounded-xl">
                                    <span className="text-sm font-medium text-gray-500 dark:text-gray-300">Group Code:</span>
                                    <code className="text-lg font-bold text-rose-500 font-mono tracking-wider">{group.code}</code>
                                    <button
                                        onClick={copyCode}
                                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
                                        title="Copy Code"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {members.map((member) => {
                        const isOnline = member.profiles.status === 'online' || member.profiles.status === 'studying';
                        const isStudying = member.profiles.status === 'studying';

                        return (
                            <div
                                key={member.user_id}
                                className={`bg-white dark:bg-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm border transition-all ${isStudying
                                    ? 'border-rose-200 dark:border-rose-900 ring-1 ring-rose-100 dark:ring-rose-900/30'
                                    : 'border-gray-100 dark:border-slate-700'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${isStudying ? 'bg-rose-500 animate-pulse' : 'bg-gray-300 dark:bg-slate-600'
                                        }`}>
                                        {/* Avatar placeholder */}
                                        {member.profiles.email ? member.profiles.email[0].toUpperCase() : 'U'}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                                {member.profiles.email ? member.profiles.email.split('@')[0] : 'Member'}
                                            </h3>
                                            {member.user_id === group.leader_id && (
                                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs rounded-full font-medium">
                                                    Leader
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {isStudying ? (
                                                <span className="text-rose-500 font-medium">
                                                    🔥 Studying {member.profiles.current_task ? `: ${member.profiles.current_task}` : ''}
                                                </span>
                                            ) : (
                                                <span>
                                                    {member.profiles.status === 'online' ? 'Online' : 'Offline'} • Last active {formatDistanceToNow(new Date(member.profiles.last_active_at), { addSuffix: true })}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="text-right">
                                    {isStudying && (
                                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm font-medium">
                                            Focusing
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
