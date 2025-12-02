'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface JoinGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJoined: () => void;
}

export default function JoinGroupModal({ isOpen, onClose, onJoined }: JoinGroupModalProps) {
    const [code, setCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;

        setIsSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('Login required');
                return;
            }

            // 1. Find Group
            const { data: group, error: findError } = await supabase
                .from('groups')
                .select('id, name')
                .eq('code', code.trim().toUpperCase())
                .single();

            if (findError || !group) {
                toast.error('Group not found. Please check the code.');
                return;
            }

            // 2. Join Group
            const { error: joinError } = await supabase
                .from('group_members')
                .insert({
                    group_id: group.id,
                    user_id: user.id,
                });

            if (joinError) {
                if (joinError.code === '23505') { // Unique violation
                    toast.error('You are already a member of this group.');
                } else {
                    throw joinError;
                }
            } else {
                toast.success(`Joined ${group.name} successfully!`);
                setCode('');
                onJoined();
                onClose();
            }
        } catch (error) {
            console.error('Error joining group:', error);
            toast.error('Failed to join group');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Join Group</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Group Code
                            </label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="ENTER CODE"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all uppercase tracking-widest font-mono"
                                autoFocus
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Ask the group leader for the 6-character code.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!code.trim() || isSubmitting}
                                className="px-5 py-2.5 bg-rose-500 text-white rounded-xl font-bold shadow-lg hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
                            >
                                {isSubmitting ? 'Joining...' : 'Join Group'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
