'use client';

import { formatDistanceToNow } from 'date-fns';
import { useLiveStudyDuration } from '@/components/common/LiveStudyDuration';

interface MemberCardProps {
    member: {
        id: string;
        user_id: string;
        nickname: string | null;
        profiles: {
            id: string;
            email: string;
            status: string;
            current_task: string | null;
            last_active_at: string;
            study_start_time: string | null;
            total_stopwatch_time: number | null;
        };
    };
    rank: number;
    savedStudyTime: number;
    isCurrentUser: boolean;
    isLeader: boolean;
    isGroupLeader: boolean;
    editingNickname: boolean;
    tempNickname: string;
    onTempNicknameChange: (value: string) => void;
    onStartEditNickname: () => void;
    onSaveNickname: () => void;
    onCancelEditNickname: () => void;
    onKickMember: () => void;
    onSelectForReport: () => void;
}

function formatStudyTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
}

export default function MemberCard({
    member,
    rank,
    savedStudyTime,
    isCurrentUser,
    isLeader,
    isGroupLeader,
    editingNickname,
    tempNickname,
    onTempNicknameChange,
    onStartEditNickname,
    onSaveNickname,
    onCancelEditNickname,
    onKickMember,
    onSelectForReport,
}: MemberCardProps) {
    const isStudying = member.profiles.status === 'studying';
    const isPaused = member.profiles.status === 'paused';
    const isActiveStudy = isStudying || isPaused; // 공부 중 또는 일시정지 상태
    const displayName = member.nickname || (member.profiles.email ? member.profiles.email.split('@')[0] : '멤버');

    // Real-time study time: saved time + live elapsed
    const liveStudyTime = useLiveStudyDuration(
        isStudying ? member.profiles.study_start_time : null,
        savedStudyTime,
        true // include saved time
    );

    // 일시정지 중에는 total_stopwatch_time + 저장된 시간을 표시
    const pausedStudyTime = isPaused
        ? savedStudyTime + (member.profiles.total_stopwatch_time || 0)
        : 0;

    // Use live time when studying, paused time when paused, otherwise saved time
    const displayStudyTime = isStudying ? liveStudyTime : (isPaused ? pausedStudyTime : savedStudyTime);

    let rankBadge = null;
    if (rank === 1) {
        rankBadge = <span className="text-2xl" title="1등">🥇</span>;
    } else if (rank === 2) {
        rankBadge = <span className="text-2xl" title="2등">🥈</span>;
    } else if (rank === 3) {
        rankBadge = <span className="text-2xl" title="3등">🥉</span>;
    } else {
        rankBadge = <span className="text-gray-400 font-bold w-6 text-center">{rank}</span>;
    }

    return (
        <div
            onClick={onSelectForReport}
            className={`bg-white dark:bg-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm border transition-all cursor-pointer hover:border-rose-200 dark:hover:border-rose-800 gap-4 sm:gap-0 ${isStudying
                ? 'border-rose-200 dark:border-rose-900 ring-1 ring-rose-100 dark:ring-rose-900/30'
                : isPaused
                    ? 'border-amber-200 dark:border-amber-900 ring-1 ring-amber-100 dark:ring-amber-900/30'
                    : 'border-gray-100 dark:border-slate-700'
                }`}
        >
            <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="flex items-center justify-center w-8 flex-shrink-0">
                    {rankBadge}
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0 ${isStudying ? 'bg-rose-500 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-gray-300 dark:bg-slate-600'
                    }`}>
                    {displayName[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {isCurrentUser && editingNickname ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="text"
                                    value={tempNickname}
                                    onChange={(e) => onTempNicknameChange(e.target.value)}
                                    className="px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white w-24"
                                    placeholder="닉네임"
                                    autoFocus
                                />
                                <button onClick={onSaveNickname} className="text-green-500 hover:text-green-600 flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <button onClick={onCancelEditNickname} className="text-red-500 hover:text-red-600 flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 truncate">
                                {displayName}
                                {isCurrentUser && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStartEditNickname();
                                        }}
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                        </svg>
                                    </button>
                                )}
                            </h3>
                        )}

                        {isGroupLeader && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs rounded-full font-medium flex-shrink-0">
                                리더
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {isStudying ? (
                            <span className="text-rose-500 font-medium">
                                🔥 공부 중 {member.profiles.current_task ? `: ${member.profiles.current_task}` : ''}
                            </span>
                        ) : isPaused ? (
                            <span className="text-amber-500 font-medium">
                                ⏸️ 일시정지 {member.profiles.current_task ? `: ${member.profiles.current_task}` : ''}
                            </span>
                        ) : (
                            <span>
                                {member.profiles.status === 'online' ? '온라인' : '오프라인'} • 마지막 활동 {formatDistanceToNow(new Date(member.profiles.last_active_at), { addSuffix: true })}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 w-full sm:w-auto pl-16 sm:pl-0">
                <div className="text-right">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 whitespace-nowrap">오늘 공부 시간</p>
                    <p className={`text-sm font-bold ${isActiveStudy ? 'text-rose-600 dark:text-rose-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {formatStudyTime(displayStudyTime)}
                        {isStudying && <span className="ml-1 text-xs">🔴</span>}
                        {isPaused && <span className="ml-1 text-xs">⏸️</span>}
                    </p>
                </div>

                {isActiveStudy && (
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${isStudying ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}`}>
                        {isStudying ? '집중 중' : '일시정지'}
                    </div>
                )}

                {isLeader && !isCurrentUser && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onKickMember();
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                        title="멤버 추방"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
