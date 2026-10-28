'use client';

import { useId, useState, type FormEvent } from 'react';
import { useJoinGroup } from './useJoinGroup';

// '코드로 참여' 탭. 공개 그룹 둘러보기 대신, 그룹은 초대 코드로만 들어간다.
// 탭을 눌러야만 그려지므로 그릴 때마다 서서히 나타난다.
export default function JoinGroupPanel({ onJoined }: { onJoined: (groupId?: string) => void }) {
    const titleId = useId();
    const inputId = useId();
    const hintId = useId();
    const [code, setCode] = useState('');
    const { joinGroup, isJoining } = useJoinGroup(onJoined);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (await joinGroup(code)) setCode('');
    };

    return (
        <section aria-labelledby={titleId} className="flex max-w-[520px] animate-fade-in flex-col gap-4 px-2 py-1 md:gap-5 md:px-3">
            <div className="flex flex-col gap-1">
                <h2 id={titleId} className="ui-h2">초대 코드로 참여</h2>
                <p id={hintId} className="m-0 text-sm text-ink-muted md:text-[15px]">
                    그룹은 초대로만 들어갈 수 있어요. 그룹 리더에게 받은 6자리 코드를 입력해 주세요.
                </p>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
                <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-muted">
                    초대 코드
                </label>
                <div className="flex gap-2">
                    <input
                        id={inputId}
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="코드 입력"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-describedby={hintId}
                        className="ui-input min-h-12 flex-1 rounded-tile font-semibold tracking-[0.2em] uppercase placeholder:font-normal placeholder:tracking-normal"
                    />
                    <button
                        type="submit"
                        disabled={!code.trim() || isJoining}
                        className="ui-button-primary ui-press min-h-12 shrink-0 rounded-tile px-5 md:px-6"
                    >
                        {isJoining ? '참여하는 중…' : '참여하기'}
                    </button>
                </div>
            </form>
        </section>
    );
}
