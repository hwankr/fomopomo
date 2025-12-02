'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import CreateGroupModal from '@/components/CreateGroupModal';
import JoinGroupModal from '@/components/JoinGroupModal';
import { Toaster } from 'react-hot-toast';

interface Group {
    id: string;
    name: string;
    leader_id: string;
}

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    const fetchGroups = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('group_members')
                .select('groups (id, name, leader_id)')
                .eq('user_id', user.id);

            if (error) throw error;

            if (data) {
                // @ts-ignore
                setGroups(data.map((item: any) => item.groups).filter(Boolean));
            }
        } catch (error) {
            console.error('Error fetching groups:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-8">
            <Toaster position="top-center" />
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Groups</h1>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setIsJoinModalOpen(true)}
                            className="px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium border border-gray-200 dark:border-slate-700"
                        >
                            Join Group
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="px-4 py-2 bg-rose-500 text-white rounded-lg shadow hover:bg-rose-600 transition-colors font-medium"
                        >
                            Create Group
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto"></div>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                        <div className="text-6xl mb-4">👥</div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No groups yet</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-8">Create a group to study with friends or join an existing one!</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="px-6 py-3 bg-rose-500 text-white rounded-xl shadow-lg hover:bg-rose-600 transition-all transform hover:-translate-y-1"
                        >
                            Get Started
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groups.map((group) => (
                            <Link
                                key={group.id}
                                href={`/groups/${group.id}`}
                                className="block group relative bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-900"
                            >
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 truncate pr-6">{group.name}</h3>
                                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-2"></span>
                                    Active
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

                <CreateGroupModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreated={fetchGroups}
                />

                <JoinGroupModal
                    isOpen={isJoinModalOpen}
                    onClose={() => setIsJoinModalOpen(false)}
                    onJoined={fetchGroups}
                />
            </div>
        </div>
    );
}
