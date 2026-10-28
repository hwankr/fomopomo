'use client';

import { useId, useRef, type ReactNode } from 'react';
import ModalDialog from '@/components/ui/ModalDialog';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: ReactNode;
    confirmText?: string;
    cancelText?: string;
    /** @deprecated confirmTone="danger"와 같다. confirmTone이 없을 때만 쓴다. */
    isDangerous?: boolean;
    /** 확인 버튼 색: ink(일반, 기본) · pomo(모드 동작, 예: 그룹 나가기) · danger(되돌릴 수 없음, 진한 로즈) */
    confirmTone?: ConfirmTone;
}

export type ConfirmTone = 'ink' | 'pomo' | 'danger';

const TONE_CLASS: Record<ConfirmTone, string> = {
    ink: 'bg-ink',
    pomo: 'bg-pomo',
    danger: 'bg-pomo-deep',
};

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = '확인',
    cancelText = '취소',
    isDangerous = false,
    confirmTone,
}: ConfirmModalProps) {
    const tone = confirmTone ?? (isDangerous ? 'danger' : 'ink');
    const titleId = useId();
    const messageId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);

    return (
        <ModalDialog
            open={isOpen}
            onClose={onClose}
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            // 되돌릴 수 없는 동작이면 안전한 취소에, 아니면 확인에 먼저 포커스를 둔다.
            initialFocusRef={tone === 'danger' ? cancelRef : confirmRef}
            overlayClassName="z-70 animate-fade-in"
            className="animate-scale-in gap-3 md:gap-4"
        >
            <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
            <h2 id={titleId} className="ui-dialog-title">
                {title}
            </h2>
            {typeof message === 'string' ? (
                <p id={messageId} className="m-0 text-sm text-ink-muted md:text-[15px]">
                    {message}
                </p>
            ) : (
                <div id={messageId} className="text-sm text-ink-muted md:text-[15px]">
                    {message}
                </div>
            )}
            <div className="flex gap-2 pt-2 md:justify-end md:pt-1">
                <button
                    ref={cancelRef}
                    type="button"
                    onClick={onClose}
                    className="ui-button-secondary min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
                >
                    {cancelText}
                </button>
                <button
                    ref={confirmRef}
                    type="button"
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                    // 디자인의 확인 대화상자 기준: 일반 먹색, 모드 동작 로즈, 되돌릴 수 없는 동작 진한 로즈
                    className={cn(
                        'ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none',
                        TONE_CLASS[tone],
                    )}
                >
                    {confirmText}
                </button>
            </div>
        </ModalDialog>
    );
}
