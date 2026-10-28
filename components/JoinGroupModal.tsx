'use client';

import { useId, useRef, useState } from 'react';
import ModalDialog from '@/components/ui/ModalDialog';
import { useJoinGroup } from '@/components/groups/useJoinGroup';

interface JoinGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 참여한 그룹의 id(RPC가 돌려준 경우)를 넘긴다. */
    onJoined: (groupId?: string) => void;
    /** 초대 링크로 들어왔을 때 미리 채울 코드 */
    initialCode?: string;
}

export default function JoinGroupModal({ isOpen, onClose, onJoined, initialCode = '' }: JoinGroupModalProps) {
    const titleId = useId();
    const inputId = useId();
    const hintId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [code, setCode] = useState(initialCode.toUpperCase());
    const { joinGroup, isJoining } = useJoinGroup(onJoined);

    const handleClose = () => {
        setCode('');
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await joinGroup(code)) {
            setCode('');
            onClose();
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
            <h2 id={titleId} className="ui-dialog-title">초대 코드로 참여</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-5">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-muted">
                        초대 코드
                    </label>
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="코드 입력"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-describedby={hintId}
                        className="ui-input min-h-12 rounded-tile font-semibold tracking-[0.2em] uppercase placeholder:font-normal placeholder:tracking-normal"
                    />
                    <p id={hintId} className="m-0 text-[13px] text-ink-muted">
                        그룹 리더에게 받은 6자리 코드를 입력해 주세요.
                    </p>
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
                        disabled={!code.trim() || isJoining}
                        className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
                    >
                        {isJoining ? '참여하는 중…' : '참여하기'}
                    </button>
                </div>
            </form>
        </ModalDialog>
    );
}
