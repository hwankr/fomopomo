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
                toast.error('로그인이 필요합니다');
                return;
            }

            const { error: joinError } = await supabase
                .rpc('join_group_by_code', {
                    p_code: code.trim().toUpperCase(),
                });

            if (joinError) {
                toast.error('그룹을 찾을 수 없습니다. 코드를 확인해주세요.');
                return;
            }

            toast.success('그룹에 참여했습니다!');
            setCode('');
            onJoined();
            onClose();
        } catch (error) {
            console.error('Error joining group:', error);
            toast.error('그룹 참여에 실패했습니다');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">그룹 참여하기</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                그룹 코드
                            </label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="코드 입력"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all uppercase tracking-widest font-mono"
                                autoFocus
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                그룹 리더에게 6자리 코드를 요청하세요.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={!code.trim() || isSubmitting}
                                className="px-5 py-2.5 bg-rose-500 text-white rounded-xl font-bold shadow-lg hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
                            >
                                {isSubmitting ? '참여 중...' : '그룹 참여'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
