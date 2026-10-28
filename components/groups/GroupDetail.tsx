'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { RealtimePostgresChangesPayload, User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDayStart, getStudyWeekRange } from '@/lib/dateUtils';
import ConfirmModal from '@/components/ConfirmModal';
import MemberReportModal from '@/components/MemberReportModal';
import GroupLoading from './GroupLoading';
import MemberRow from './MemberRow';
import TransferLeadershipModal from './TransferLeadershipModal';
import { buildInviteLink, formatHoursText, getLiveStudySeconds, getMemberDisplayName } from './groupUtils';

interface Member {
    id: string; // group_member id
    user_id: string;
    joined_at: string;
    nickname: string | null;
    profiles: {
        id: string;
        email: string;
        status: string;
        current_task: string | null;
        last_active_at: string;
        avatar_url?: string;
        study_start_time: string | null;
        total_stopwatch_time: number | null;
    };
}

interface GroupInfo {
    id: string;
    name: string;
    leader_id: string;
}

/** 목록의 그룹 칩을 상세와 맞추는 데 쓰는 요약 */
export interface GroupSummary extends GroupInfo {
    memberCount: number;
}

type GroupMemberRow = Omit<Member, 'profiles'> & {
    profiles: Member['profiles'] | Member['profiles'][] | null;
};

type StudyTimeRow = {
    user_id: string;
    total_seconds: number;
};

type StudySessionChangeRow = {
    user_id: string | null;
};

type PendingConfirm =
    | { kind: 'leave' }
    | { kind: 'delete' }
    | { kind: 'kick'; memberId: string; name: string };

interface GroupDetailProps {
    groupId: string;
    /** 그룹 정보나 멤버 수가 바뀌면(불러오기, 이름 변경, 멤버 변동) 알린다. */
    onSummaryChange?: (summary: GroupSummary) => void;
    /** 그룹을 나갔거나 삭제했거나, 다른 곳에서 삭제됐을 때 */
    onRemoved: (groupId: string) => void;
    /** 그룹을 불러오지 못했을 때(멤버가 아니거나 없는 그룹) */
    onLoadError: () => void;
}

const getInviteCode = (data: unknown) => {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return getInviteCode(data[0]);
    if (data && typeof data === 'object') {
        const code = (data as Record<string, unknown>).code;
        if (typeof code === 'string') return code;
    }
    return null;
};

// 이번 공부주(월요일 05:00 ~ 다음 월요일 04:59:59.999). 05:00 전 새벽은 전날 공부일로 친다.
const getThisStudyWeek = () => {
    const { start, end } = getStudyWeekRange(getDayStart());
    return { start: start.toISOString(), end: end.toISOString(), startMs: start.getTime() };
};

// 공부 중인 멤버가 있는 동안 1초마다 바뀌는 지금 시각. 실시간 시간·순위·합계를 한 시계로 맞춘다.
function useTicker(active: boolean) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!active) return;
        const update = () => setNow(Date.now());
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [active]);

    return now;
}

const toStudyTimeMap = (rows: StudyTimeRow[]) => {
    const timeMap: Record<string, number> = {};
    rows.forEach((item) => {
        timeMap[item.user_id] = item.total_seconds;
    });
    return timeMap;
};

// 선택한 그룹: 이름·멤버·리더, 이번 주 함께 집중한 시간과 내 순위, 멤버 순위, 초대·나가기·관리 동작.
// 멤버 상태와 공부 시간은 Realtime으로 갱신한다.
export default function GroupDetail({ groupId: id, onSummaryChange, onRemoved, onLoadError }: GroupDetailProps) {
    const titleId = useId();
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [editingNickname, setEditingNickname] = useState(false);
    const [tempNickname, setTempNickname] = useState('');
    const [isEditingGroupName, setIsEditingGroupName] = useState(false);
    const [tempGroupName, setTempGroupName] = useState('');
    const [selectedMemberForReport, setSelectedMemberForReport] = useState<{ id: string; name: string } | null>(null);
    const [studyTimes, setStudyTimes] = useState<Record<string, number>>({});
    const [weekStartMs, setWeekStartMs] = useState(() => getThisStudyWeek().startMs);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    // 다른 그룹으로 바꾼 뒤 늦게 끝난 조회가 화면 쪽 콜백을 부르지 않게 한다.
    const isActiveRef = useRef(true);
    const callbacksRef = useRef({ onSummaryChange, onRemoved, onLoadError });
    useLayoutEffect(() => {
        callbacksRef.current = { onSummaryChange, onRemoved, onLoadError };
    });

    const fetchGroupData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                if (isActiveRef.current) callbacksRef.current.onLoadError();
                return;
            }
            setCurrentUser(user);

            // 1. Fetch Group Details
            const { data: groupData, error: groupError } = await supabase
                .from('groups')
                .select('id, name, leader_id')
                .eq('id', id)
                .single();

            if (groupError) throw groupError;
            setGroup(groupData);

            const inviteCodePromise = groupData.leader_id === user.id
                ? supabase.rpc('get_group_invite_code', {
                    p_group_id: id,
                })
                : null;

            if (groupData.leader_id !== user.id) {
                setInviteCode(null);
            }

            // 2. Fetch Members
            const { data: membersData, error: membersError } = await supabase
                .from('group_members')
                .select(`
                    id,
                    user_id,
                    joined_at,
                    nickname,
                    profiles:user_id (
                        id,
                        email,
                        status,
                        current_task,
                        last_active_at,
                        study_start_time,
                        total_stopwatch_time
                    )
                `)
                .eq('group_id', id);

            if (membersError) throw membersError;

            const groupMembers = ((membersData ?? []) as GroupMemberRow[])
                .map((member) => ({
                    ...member,
                    profiles: Array.isArray(member.profiles)
                        ? member.profiles[0] ?? null
                        : member.profiles,
                }))
                .filter(
                    (member): member is GroupMemberRow & { profiles: Member['profiles'] } =>
                        member.profiles !== null
                );

            setMembers(groupMembers);
            if (isActiveRef.current) {
                callbacksRef.current.onSummaryChange?.({ ...groupData, memberCount: groupMembers.length });
            }

            // 3. Fetch Study Times — 이번 공부주(월요일 05:00 경계) 합계로 순위를 매긴다
            const { start, end, startMs } = getThisStudyWeek();
            setWeekStartMs(startMs);

            const { data: studyTimeData, error: studyTimeError } = await supabase
                .rpc('get_group_study_time_v3', {
                    p_group_id: id,
                    p_start_time: start,
                    p_end_time: end
                });

            if (studyTimeError) {
                console.error('Error fetching study times:', JSON.stringify(studyTimeError, null, 2));
                console.error('Params:', { p_group_id: id, p_start_time: start, p_end_time: end });
            } else {
                setStudyTimes(toStudyTimeMap(studyTimeData as StudyTimeRow[]));
            }

            if (inviteCodePromise) {
                const { data: inviteCodeData, error: inviteCodeError } = await inviteCodePromise;

                if (inviteCodeError) {
                    console.error('Error fetching invite code:', inviteCodeError);
                    setInviteCode(null);
                } else {
                    setInviteCode(getInviteCode(inviteCodeData));
                }
            }

        } catch (error) {
            console.error('Error fetching group data:', error);
            if (isActiveRef.current) {
                toast.error('그룹을 불러오지 못했어요.');
                callbacksRef.current.onLoadError();
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        isActiveRef.current = true;
        const loadGroupData = async () => {
            await fetchGroupData();
        };
        void loadGroupData();

        console.log('[Group Realtime] Setting up subscription for group:', id);

        // Realtime subscription for member status updates
        const channel = supabase
            .channel(`group-${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                },
                (payload) => {
                    console.log('[Group Realtime] profiles UPDATE received:', payload.new);
                    setMembers((prev) =>
                        prev.map((member) => {
                            if (member.user_id === payload.new.id) {
                                console.log('[Group Realtime] Updating member:', member.user_id);
                                return {
                                    ...member,
                                    profiles: {
                                        ...member.profiles,
                                        ...payload.new,
                                    },
                                };
                            }
                            return member;
                        })
                    );
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'group_members',
                    filter: `group_id=eq.${id}`,
                },
                () => {
                    // Refresh members on any change to group_members (join, leave, kick, nickname update)
                    fetchGroupData();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'groups',
                    filter: `id=eq.${id}`,
                },
                () => {
                    if (!isActiveRef.current) return;
                    toast.error('그룹이 삭제됐어요.');
                    callbacksRef.current.onRemoved(id);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'study_sessions',
                },
                (payload: RealtimePostgresChangesPayload<StudySessionChangeRow>) => {
                    // 그룹 멤버의 세션이 변경되면 공부 시간 다시 fetch
                    const nextRow = payload.new as StudySessionChangeRow | undefined;
                    const previousRow = payload.old as StudySessionChangeRow | undefined;
                    const userId = nextRow?.user_id || previousRow?.user_id;
                    console.log('[Group Realtime] study_sessions change detected for user:', userId);

                    // 현재 멤버 목록에 있는 사용자인지 확인
                    setMembers((currentMembers) => {
                        if (currentMembers.some(m => m.user_id === userId)) {
                            console.log('[Group Realtime] User is a group member, refreshing study times');
                            // 비동기로 studyTimes만 갱신 — 초기 조회와 같은
                            // 공부주(05:00 경계) 기준을 써야 실시간 이벤트가
                            // 와도 집계 기준이 바뀌지 않는다
                            (async () => {
                                const { start, end } = getThisStudyWeek();

                                const { data: studyTimeData } = await supabase
                                    .rpc('get_group_study_time_v3', {
                                        p_group_id: id,
                                        p_start_time: start,
                                        p_end_time: end
                                    });

                                if (studyTimeData) {
                                    setStudyTimes(toStudyTimeMap(studyTimeData as StudyTimeRow[]));
                                }
                            })();
                        }
                        return currentMembers; // 상태 변경 없음
                    });
                }
            )
            .subscribe((status) => {
                console.log('[Group Realtime] Subscription status:', status);
            });

        return () => {
            console.log('[Group Realtime] Cleaning up subscription');
            isActiveRef.current = false;
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const copyText = async (text: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(successMessage);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            toast.error('복사하지 못했어요. 다시 시도해 주세요.');
        }
    };

    const copyInviteLink = () => {
        if (!inviteCode) return;
        void copyText(buildInviteLink(window.location.origin, inviteCode), '초대 링크를 복사했어요.');
    };

    const copyCode = () => {
        if (!inviteCode) return;
        void copyText(inviteCode, '초대 코드를 복사했어요.');
    };

    const handleUpdateNickname = async () => {
        if (!tempNickname.trim()) return;
        if (!currentUser) return;
        try {
            const { error } = await supabase
                .from('group_members')
                .update({ nickname: tempNickname.trim() })
                .eq('group_id', id)
                .eq('user_id', currentUser?.id ?? '');

            if (error) throw error;

            toast.success('닉네임을 바꿨어요.');
            setEditingNickname(false);
            fetchGroupData();
        } catch (error) {
            console.error('Error updating nickname:', error);
            toast.error('닉네임을 바꾸지 못했어요.');
        }
    };

    const handleUpdateGroupName = async (event?: FormEvent) => {
        event?.preventDefault();
        const nextName = tempGroupName.trim();
        if (!nextName) return;
        try {
            const { error } = await supabase
                .from('groups')
                .update({ name: nextName })
                .eq('id', id);

            if (error) throw error;

            toast.success('그룹 이름을 바꿨어요.');
            setIsEditingGroupName(false);
            setGroup(prev => prev ? { ...prev, name: nextName } : null);
            if (group) {
                callbacksRef.current.onSummaryChange?.({ ...group, name: nextName, memberCount: members.length });
            }
        } catch (error) {
            console.error('Error updating group name:', error);
            toast.error('그룹 이름을 바꾸지 못했어요.');
        }
    };

    const handleKickMember = async (memberId: string) => {
        try {
            const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('id', memberId);

            if (error) throw error;
            toast.success('멤버를 내보냈어요.');
        } catch (error) {
            console.error('Error removing member:', error);
            toast.error('멤버를 내보내지 못했어요.');
        }
    };

    const handleLeaveGroup = async () => {
        try {
            const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', id)
                .eq('user_id', currentUser?.id ?? '');

            if (error) throw error;
            toast.success('그룹에서 나왔어요.');
            callbacksRef.current.onRemoved(id);
        } catch (error) {
            console.error('Error leaving group:', error);
            toast.error('그룹에서 나가지 못했어요.');
        }
    };

    const handleDeleteGroup = async () => {
        try {
            // delete_group RPC가 리더 검증과 멤버십 cascade 삭제를 단일 트랜잭션으로 처리한다
            const { error } = await supabase.rpc('delete_group', {
                p_group_id: id,
            });

            if (error) throw error;
            toast.success('그룹을 삭제했어요.');
            callbacksRef.current.onRemoved(id);
        } catch (error) {
            console.error('Error deleting group:', error);
            toast.error('그룹을 삭제하지 못했어요.');
        }
    };

    const handleConfirm = () => {
        if (!pendingConfirm) return;
        if (pendingConfirm.kind === 'leave') void handleLeaveGroup();
        else if (pendingConfirm.kind === 'delete') void handleDeleteGroup();
        else void handleKickMember(pendingConfirm.memberId);
    };

    const hasStudyingMember = members.some((member) => member.profiles.status === 'studying');
    const now = useTicker(hasStudyingMember);

    if (isLoading) {
        return <GroupLoading />;
    }

    if (!group) {
        return <p className="m-0 px-2 py-3 text-sm text-ink-muted md:px-3 md:text-[15px]">그룹을 불러오지 못했어요.</p>;
    }

    const isLeader = currentUser?.id === group.leader_id;

    // 저장된 이번 주 시간 + 지금 공부·일시정지 중인 몫으로 순위·막대·합계를 낸다(보이는 시간과 순위가 어긋나지 않게).
    const liveTimes: Record<string, number> = {};
    members.forEach((member) => {
        liveTimes[member.user_id] = getLiveStudySeconds(member.profiles, studyTimes[member.user_id] || 0, weekStartMs, now);
    });
    const rankedMembers = [...members].sort((a, b) => {
        const timeA = liveTimes[a.user_id];
        const timeB = liveTimes[b.user_id];
        // Sort by time descending, then by name ascending as tiebreaker
        if (timeB !== timeA) return timeB - timeA;
        return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
    });
    const totalStudyTime = rankedMembers.reduce((sum, member) => sum + liveTimes[member.user_id], 0);
    const topStudyTime = rankedMembers.length > 0 ? liveTimes[rankedMembers[0].user_id] : 0;
    const myRankIndex = rankedMembers.findIndex((member) => member.user_id === currentUser?.id);
    const leaderMember = members.find((member) => member.user_id === group.leader_id);

    const confirmCopy = pendingConfirm?.kind === 'leave'
        ? {
            title: '정말 나가시겠어요?',
            message: `"${group.name}"에서 나가면 이번 주 그룹 기록에서 빠져요. 다시 들어오려면 초대 코드가 필요해요.`,
            confirmText: '나가기',
            // 그룹 나가기는 모드 동작(로즈), 삭제·내보내기는 되돌릴 수 없는 동작(진한 로즈)
            confirmTone: 'pomo' as const,
        }
        : pendingConfirm?.kind === 'delete'
            ? {
                title: '그룹을 삭제할까요?',
                message: `"${group.name}" 그룹이 사라지고 모든 멤버가 그룹에서 빠져요. 되돌릴 수 없어요.`,
                confirmText: '삭제하기',
                confirmTone: 'danger' as const,
            }
            : {
                title: '멤버를 내보낼까요?',
                message: pendingConfirm?.kind === 'kick'
                    ? `${pendingConfirm.name}님을 그룹에서 내보내요. 다시 들어오려면 초대 코드가 필요해요.`
                    : '',
                confirmText: '내보내기',
                confirmTone: 'danger' as const,
            };

    const actionButton = 'min-h-11 rounded-control px-4 text-sm md:min-h-[46px] md:rounded-tile md:px-[18px] md:text-[15px]';

    return (
        <section aria-labelledby={titleId} className="flex flex-col gap-4 md:gap-6">
            <div className="flex flex-col gap-4 px-2 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-6 md:px-0">
                <div className="flex min-w-0 flex-col gap-0.5 md:gap-1">
                    {isEditingGroupName ? (
                        <form onSubmit={handleUpdateGroupName} className="flex min-w-0 flex-wrap items-center gap-2">
                            <input
                                type="text"
                                value={tempGroupName}
                                onChange={(e) => setTempGroupName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setIsEditingGroupName(false);
                                    }
                                }}
                                className="ui-input min-h-11 w-full min-w-0 flex-1 rounded-tile text-[17px] font-extrabold md:min-h-12 md:w-auto md:min-w-[280px] md:text-[22px]"
                                aria-label="그룹 이름"
                                autoFocus
                            />
                            <button type="submit" className="ui-button-primary ui-press min-h-11 rounded-tile bg-ink px-4 md:min-h-12 md:px-5">
                                저장
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsEditingGroupName(false)}
                                className="ui-button-secondary min-h-11 rounded-tile px-4 md:min-h-12"
                            >
                                취소
                            </button>
                        </form>
                    ) : (
                        <div className="flex min-w-0 items-center gap-1">
                            <h2 id={titleId} className="m-0 min-w-0 text-[19px] font-extrabold tracking-[-0.02em] break-words md:text-2xl">
                                {group.name}
                            </h2>
                            {isLeader && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTempGroupName(group.name);
                                        setIsEditingGroupName(true);
                                    }}
                                    className="ui-icon-button ui-focus-ink -my-1 ml-0.5 size-11 text-ink-faint hover:text-ink"
                                    aria-label="그룹 이름 수정"
                                >
                                    <Pencil aria-hidden="true" size={16} strokeWidth={1.8} />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-x-3 text-[13px] text-ink-muted md:gap-x-4 md:text-[15px]">
                        <span>{members.length}명</span>
                        {leaderMember ? <span>리더 {getMemberDisplayName(leaderMember)}</span> : null}
                    </div>
                </div>

                <dl className="m-0 flex flex-wrap gap-x-7 gap-y-2 md:gap-x-9">
                    <div className="flex flex-col-reverse gap-px md:gap-0.5">
                        <dt className="text-xs text-ink-muted md:text-[13px]">이번 주 함께 집중한 시간</dt>
                        <dd className="m-0 font-display text-[26px] leading-[1.1] font-bold tracking-[-0.02em] md:text-[34px]">
                            {formatHoursText(totalStudyTime)}
                        </dd>
                    </div>
                    <div className="flex flex-col-reverse gap-px md:gap-0.5">
                        <dt className="text-xs text-ink-muted md:text-[13px]">내 순위</dt>
                        <dd className="m-0 font-display text-[26px] leading-[1.1] font-bold tracking-[-0.02em] text-pomo md:text-[34px]">
                            {myRankIndex >= 0 ? `${myRankIndex + 1}위` : '-'}
                        </dd>
                    </div>
                </dl>
            </div>

            <div className="flex flex-col gap-0.5">
                <div aria-hidden="true" className="hidden items-center gap-4 px-3 pb-2 text-[13px] font-semibold text-ink-muted md:flex">
                    <span className="w-8 shrink-0">순위</span>
                    <span className="flex-1">이번 주 집중 시간 순서</span>
                    <span className="w-[88px] shrink-0 text-right">시:분</span>
                    {isLeader ? <span className="w-10 shrink-0" /> : null}
                </div>
                <ol aria-label="이번 주 집중 시간 순위" className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {rankedMembers.map((member, index) => {
                        const isCurrentUser = member.user_id === currentUser?.id;
                        const displayName = getMemberDisplayName(member);
                        const studyTime = liveTimes[member.user_id];
                        const barPercent = Math.max(3, Math.round((studyTime / (topStudyTime || 1)) * 100));

                        return (
                            <MemberRow
                                key={member.id}
                                member={member}
                                rank={index + 1}
                                studyTime={studyTime}
                                barPercent={barPercent}
                                isCurrentUser={isCurrentUser}
                                isGroupLeader={member.user_id === group.leader_id}
                                showKickColumn={isLeader}
                                editingNickname={isCurrentUser && editingNickname}
                                tempNickname={tempNickname}
                                onTempNicknameChange={setTempNickname}
                                onStartEditNickname={() => {
                                    setTempNickname(member.nickname || '');
                                    setEditingNickname(true);
                                }}
                                onSaveNickname={handleUpdateNickname}
                                onCancelEditNickname={() => setEditingNickname(false)}
                                onKickMember={() => setPendingConfirm({ kind: 'kick', memberId: member.id, name: displayName })}
                                onSelectForReport={() => setSelectedMemberForReport({ id: member.user_id, name: displayName })}
                            />
                        );
                    })}
                </ol>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-2 pb-2 md:gap-2.5 md:px-3 md:pb-0">
                {isLeader ? (
                    <>
                        <button
                            type="button"
                            onClick={copyInviteLink}
                            disabled={!inviteCode}
                            className={`ui-button-primary ui-press ${actionButton}`}
                        >
                            초대 링크 복사
                        </button>
                        {inviteCode ? (
                            <button
                                type="button"
                                onClick={copyCode}
                                className={`ui-button-secondary ${actionButton}`}
                                aria-label={`초대 코드 ${inviteCode} 복사`}
                            >
                                <span className="font-medium text-ink-muted">코드</span>
                                <span className="tracking-[0.12em]">{inviteCode}</span>
                            </button>
                        ) : (
                            <span className="px-1 text-[13px] text-ink-muted">초대 코드를 불러오지 못했어요.</span>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsTransferModalOpen(true)}
                            className={`ui-button-secondary ${actionButton}`}
                        >
                            그룹장 넘기기
                        </button>
                        <button
                            type="button"
                            onClick={() => setPendingConfirm({ kind: 'delete' })}
                            className={`ui-button-ghost text-pomo-deep ${actionButton}`}
                        >
                            그룹 삭제
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => setPendingConfirm({ kind: 'leave' })}
                        className={`ui-button-secondary ${actionButton}`}
                    >
                        그룹 나가기
                    </button>
                )}
            </div>

            {selectedMemberForReport && (
                <MemberReportModal
                    isOpen={!!selectedMemberForReport}
                    onClose={() => setSelectedMemberForReport(null)}
                    userId={selectedMemberForReport.id}
                    userName={selectedMemberForReport.name}
                />
            )}

            {isTransferModalOpen && currentUser && (
                <TransferLeadershipModal
                    isOpen={isTransferModalOpen}
                    onClose={() => setIsTransferModalOpen(false)}
                    groupId={group.id}
                    groupName={group.name}
                    members={members}
                    currentUserId={currentUser?.id ?? ''}
                    onTransferred={fetchGroupData}
                />
            )}

            <ConfirmModal
                isOpen={pendingConfirm !== null}
                onClose={() => setPendingConfirm(null)}
                onConfirm={handleConfirm}
                title={confirmCopy.title}
                message={confirmCopy.message}
                confirmText={confirmCopy.confirmText}
                confirmTone={confirmCopy.confirmTone}
            />
        </section>
    );
}
