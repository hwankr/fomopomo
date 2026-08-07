'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Member {
    id: string;
    user_id: string;
    nickname: string | null;
    profiles: {
        email: string;
    };
}

interface TransferLeadershipModalProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
    groupName: string;
    members: Member[];
    currentUserId: string;
    onTransferred: () => void;
}

type SupabaseErrorLike = {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
};

export default function TransferLeadershipModal({
    isOpen,
    onClose,
    groupId,
    groupName,
    members,
    currentUserId,
    onTransferred,
}: TransferLeadershipModalProps) {
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [isTransferring, setIsTransferring] = useState(false);

    const getErrorMessage = (error: unknown) => {
        if (!error) return null;
        if (typeof error === 'string') return error;
        if (error instanceof Error && error.message) return error.message;
        if (typeof error === 'object') {
            const details = error as SupabaseErrorLike;
            return details.message || details.details || details.hint || null;
        }
        return null;
    };

    // 본인을 제외한 멤버 목록
    const otherMembers = members.filter((m) => m.user_id !== currentUserId);

    const handleTransfer = async () => {
        if (!selectedMemberId) {
            toast.error('새 그룹장을 선택해주세요.');
            return;
        }

        const selectedMember = otherMembers.find((m) => m.user_id === selectedMemberId);
        const memberName = selectedMember?.nickname || selectedMember?.profiles.email.split('@')[0] || '멤버';

        if (!confirm(`${memberName}님에게 그룹장을 넘기시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        setIsTransferring(true);
        const toastId = toast.loading('그룹장 이양 중...');

        try {
            const { error } = await supabase
                .rpc('transfer_group_leadership', {
                    p_group_id: groupId,
                    p_new_leader_id: selectedMemberId,
                });

            if (error) throw error;

            toast.success(`${memberName}님이 새 그룹장이 되었습니다!`, { id: toastId });
            onTransferred();
            onClose();
        } catch (error) {
            console.error('Error transferring leadership:', error);
            const errorMessage = getErrorMessage(error);
            toast.error(errorMessage || '그룹장 이양에 실패했습니다.', { id: toastId });
        } finally {
            setIsTransferring(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">그룹장 이양</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {groupName}의 새 그룹장을 선택하세요
                    </p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {otherMembers.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="text-4xl mb-3">👤</div>
                            <p className="text-gray-500 dark:text-gray-400">
                                그룹에 다른 멤버가 없습니다.
                            </p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                그룹장을 이양하려면 먼저 멤버를 초대하세요.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {otherMembers.map((member) => {
                                const displayName = member.nickname || member.profiles.email.split('@')[0];
                                const isSelected = selectedMemberId === member.user_id;

                                return (
                                    <button
                                        key={member.id}
                                        onClick={() => setSelectedMemberId(member.user_id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isSelected
                                                ? 'bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-500'
                                                : 'bg-gray-50 dark:bg-slate-700 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 flex items-center justify-center text-white font-bold">
                                            {displayName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-medium text-gray-900 dark:text-white">{displayName}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {member.profiles.email}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <div className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Warning */}
                    {otherMembers.length > 0 && (
                        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                            <div className="flex gap-2">
                                <span className="text-amber-500">⚠️</span>
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    그룹장을 넘기면 되돌릴 수 없습니다. 신중하게 선택하세요.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-slate-700/50 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        취소
                    </button>
                    {otherMembers.length > 0 && (
                        <button
                            onClick={handleTransfer}
                            disabled={!selectedMemberId || isTransferring}
                            className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isTransferring ? '이양 중...' : '그룹장 이양'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
