'use client';

import { useId, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import ModalDialog from '@/components/ui/ModalDialog';
import { readGroupId } from '@/components/groups/groupUtils';

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 만든 그룹의 id(RPC가 돌려준 경우)를 넘긴다. */
    onCreated: (groupId?: string) => void;
}

export default function CreateGroupModal({ isOpen, onClose, onCreated }: CreateGroupModalProps) {
    const titleId = useId();
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleClose = () => {
        setName('');
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('로그인이 필요해요.');
                return;
            }

            const { data, error: groupError } = await supabase
                .rpc('create_group', {
                    p_name: name.trim(),
                });

            if (groupError) throw groupError;

            toast.success('그룹을 만들었어요.');
            setName('');
            onCreated(readGroupId(data));
            onClose();
        } catch (error) {
            console.error('Error creating group:', error);
            toast.error('그룹을 만들지 못했어요.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalDialog
            open={isOpen}
            onClose={handleClose}
            aria-labelledby={titleId}
            initialFocusRef={inputRef}
        >
            <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
            <h2 id={titleId} className="ui-dialog-title">새 그룹</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-5">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-muted">
                        그룹 이름
                    </label>
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="예: 기말고사 2주 작전"
                        autoComplete="off"
                        className="ui-input min-h-12 rounded-tile"
                    />
                </div>
                <div className="flex gap-2 pt-1 md:justify-end md:pt-0">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="ui-button-secondary min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={!name.trim() || isSubmitting}
                        className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
                    >
                        {isSubmitting ? '만드는 중…' : '만들기'}
                    </button>
                </div>
            </form>
        </ModalDialog>
    );
}
