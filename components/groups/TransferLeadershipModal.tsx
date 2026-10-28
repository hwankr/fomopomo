'use client';

import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';
import Avatar from '@/components/ui/Avatar';
import ModalDialog from '@/components/ui/ModalDialog';
import { cn } from '@/lib/utils';
import { getMemberDisplayName } from './groupUtils';

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
    const titleId = useId();
    const descriptionId = useId();
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
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
    const selectedMember = otherMembers.find((m) => m.user_id === selectedMemberId);
    const selectedName = selectedMember ? getMemberDisplayName(selectedMember) : '멤버';

    const handleRequestTransfer = () => {
        if (!selectedMemberId) {
            toast.error('새 그룹장을 골라 주세요.');
            return;
        }
        setIsConfirmOpen(true);
    };

    const handleTransfer = async () => {
        if (!selectedMemberId) return;

        setIsTransferring(true);
        const toastId = toast.loading('그룹장을 넘기는 중이에요…');

        try {
            const { error } = await supabase
                .rpc('transfer_group_leadership', {
                    p_group_id: groupId,
                    p_new_leader_id: selectedMemberId,
                });

            if (error) throw error;

            toast.success(`${selectedName}님이 새 그룹장이 됐어요.`, { id: toastId });
            onTransferred();
            onClose();
        } catch (error) {
            console.error('Error transferring leadership:', error);
            const errorMessage = getErrorMessage(error);
            toast.error(errorMessage || '그룹장을 넘기지 못했어요.', { id: toastId });
        } finally {
            setIsTransferring(false);
        }
    };

    return (
        <>
            <ModalDialog
                open={isOpen}
                onClose={onClose}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                overlayClassName="animate-fade-in"
                className="animate-scale-in"
            >
                <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
                <div className="flex flex-col gap-1">
                    <h2 id={titleId} className="ui-dialog-title">그룹장 넘기기</h2>
                    <p id={descriptionId} className="m-0 text-sm break-words text-ink-muted md:text-[15px]">
                        {groupName}의 새 그룹장을 골라 주세요.
                    </p>
                </div>

                {otherMembers.length === 0 ? (
                    <p className="m-0 text-sm text-ink-muted md:text-[15px]">
                        그룹에 다른 멤버가 없어요. 먼저 멤버를 초대해 주세요.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        <ul aria-label="멤버" className="m-0 flex list-none flex-col gap-0.5 p-0">
                            {otherMembers.map((member) => {
                                const displayName = getMemberDisplayName(member);
                                const isSelected = selectedMemberId === member.user_id;

                                return (
                                    <li key={member.id}>
                                        <button
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => setSelectedMemberId(member.user_id)}
                                            className={cn(
                                                '-mx-3 flex min-h-14 w-[calc(100%+24px)] items-center gap-3 rounded-tile px-3 text-left transition-colors',
                                                isSelected ? 'bg-surface' : 'hover:bg-hover',
                                            )}
                                        >
                                            <Avatar name={displayName} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-semibold" title={displayName}>{displayName}</span>
                                                <span className="block truncate text-xs text-ink-subtle" title={member.profiles.email}>
                                                    {member.profiles.email}
                                                </span>
                                            </span>
                                            {isSelected && (
                                                <Check aria-hidden="true" size={20} strokeWidth={2.2} className="shrink-0 text-pomo" />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="m-0 text-[13px] text-ink-muted">그룹장을 넘기면 되돌릴 수 없어요.</p>
                    </div>
                )}

                <div className="flex gap-2 pt-1 md:justify-end md:pt-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="ui-button-secondary min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
                    >
                        취소
                    </button>
                    {otherMembers.length > 0 && (
                        <button
                            type="button"
                            onClick={handleRequestTransfer}
                            disabled={!selectedMemberId || isTransferring}
                            className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
                        >
                            {isTransferring ? '넘기는 중…' : '그룹장 넘기기'}
                        </button>
                    )}
                </div>
            </ModalDialog>

            <ConfirmModal
                isOpen={isOpen && isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={() => void handleTransfer()}
                title="그룹장을 넘길까요?"
                message={`${selectedName}님이 새 그룹장이 돼요. 넘긴 뒤에는 되돌릴 수 없어요.`}
                confirmText="넘기기"
                confirmTone="danger"
            />
        </>
    );
}
