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
    isDangerous?: boolean;
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = '확인',
    cancelText = '취소',
    isDangerous = false,
}: ConfirmModalProps) {
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
            initialFocusRef={isDangerous ? cancelRef : confirmRef}
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
                    // 되돌릴 수 없는 동작은 진한 로즈, 나머지는 먹색(디자인의 확인 대화상자 기준)
                    className={cn(
                        'ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none',
                        isDangerous ? 'bg-pomo-deep' : 'bg-ink',
                    )}
                >
                    {confirmText}
                </button>
            </div>
        </ModalDialog>
    );
}
