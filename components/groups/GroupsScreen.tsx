'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthSession } from '@/hooks/useAuthSession';
import CreateGroupModal from '@/components/CreateGroupModal';
import JoinGroupModal from '@/components/JoinGroupModal';
import LoginModal from '@/components/LoginModal';
import Navbar from '@/components/Navbar';
import MobileTopBar, { TopBarTitle } from '@/components/layout/MobileTopBar';
import NotificationBell from '@/components/layout/NotificationBell';
import { cn } from '@/lib/utils';
import GroupDetail, { type GroupSummary } from './GroupDetail';
import GroupLoading from './GroupLoading';
import JoinGroupPanel from './JoinGroupPanel';

interface Group {
    id: string;
    name: string;
    leader_id: string;
    /** 칩에 보일 멤버 수. 세지 못했으면 null */
    memberCount: number | null;
}

type GroupMembershipRow = {
    groups: Omit<Group, 'memberCount'> | Omit<Group, 'memberCount'>[] | null;
};

type View = 'mine' | 'join';

const subscribeNothing = () => () => {};
const readInviteCode = () => new URLSearchParams(window.location.search).get('code')?.trim().toUpperCase() || null;

// 칩에 보일 그룹별 멤버 수. 실패해도 그룹 목록은 그대로 보여 준다.
async function fetchMemberCounts(groupIds: string[]) {
    const counts: Record<string, number> = {};
    if (groupIds.length === 0) return counts;

    const { data, error } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds);

    if (error) {
        console.error('Error fetching group member counts:', error);
        return counts;
    }
    ((data ?? []) as { group_id: string }[]).forEach((row) => {
        counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;
    });
    return counts;
}

interface GroupsScreenProps {
    /** /groups/[id]로 들어왔을 때 먼저 보여 줄 그룹 */
    initialGroupId?: string;
}

// 그룹 화면(/groups, /groups/[id] 공용): 제목·보기 탭·그룹 만들기, 내 그룹 칩, 선택한 그룹 상세.
// 공개 그룹 둘러보기는 없으므로 두 번째 탭은 초대 코드로 참여하는 곳이다.
export default function GroupsScreen({ initialGroupId }: GroupsScreenProps) {
    const router = useRouter();
    const { session, loading: sessionLoading } = useAuthSession();
    const [groups, setGroups] = useState<Group[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroupId ?? null);
    const [view, setView] = useState<View>('mine');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isInviteDismissed, setIsInviteDismissed] = useState(false);
    const guestTitleId = useId();

    const user = session?.user;
    const userId = user?.id ?? null;

    // 초대 링크(/groups?code=XXXXXX)의 코드. 서버 렌더와 첫 하이드레이션에서는 null이다.
    const urlInviteCode = useSyncExternalStore(subscribeNothing, readInviteCode, () => null);
    const inviteCode = isInviteDismissed ? null : urlInviteCode;

    // 요청 세대 카운터: 값이 바뀌면 그 이전에 시작된 조회의 응답은 폐기된다.
    const fetchGenerationRef = useRef(0);

    // 계정 전환/로그아웃 시 이전 계정의 그룹 목록이 잠시라도 남지 않도록 렌더 중 동기적으로 비운다.
    const [lastUserId, setLastUserId] = useState(userId);
    if (userId !== lastUserId) {
        setLastUserId(userId);
        setGroups([]);
        setGroupsLoading(userId !== null);
    }

    const fetchGroups = useCallback(async () => {
        if (!userId) return;

        const generation = ++fetchGenerationRef.current;
        try {
            const { data, error } = await supabase
                .from('group_members')
                .select('groups (id, name, leader_id)')
                .eq('user_id', userId);

            if (generation !== fetchGenerationRef.current) return;
            if (error) throw error;

            if (data) {
                const groupRows = (data ?? []) as GroupMembershipRow[];
                const groupList = groupRows
                    .map((item) =>
                        Array.isArray(item.groups)
                            ? item.groups[0] ?? null
                            : item.groups
                    )
                    .filter((group): group is Omit<Group, 'memberCount'> => group !== null);

                const memberCounts = await fetchMemberCounts(groupList.map((group) => group.id));
                if (generation !== fetchGenerationRef.current) return;

                setGroups(groupList.map((group) => ({ ...group, memberCount: memberCounts[group.id] ?? null })));
            }
        } catch (error) {
            console.error('Error fetching groups:', error);
        } finally {
            if (generation === fetchGenerationRef.current) {
                setGroupsLoading(false);
            }
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            // 로그아웃 시 이전 계정의 in-flight 응답을 무효화하고 목록을 비운다.
            fetchGenerationRef.current += 1;
            setGroups([]);
            setGroupsLoading(false);
            return;
        }

        const load = async () => {
            await fetchGroups();
        };
        void load();
    }, [fetchGroups, userId]);

    // 고른 그룹이 없으면(/groups) 목록의 첫 그룹을 보여 준다.
    const activeGroupId = selectedGroupId ?? groups[0]?.id ?? null;

    // 모바일의 가로로 넘치는 칩 줄은 선택한 칩이 보이게 옮긴다(/groups/[id]로 들어왔을 때,
    // 화면 너비가 바뀌어 줄이 넘치게 됐을 때 등). 포커스는 그대로 두고 애니메이션 없이 바로 옮긴다.
    const showChips = !!session && view === 'mine' && groups.length > 0;
    const chipsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const container = chipsRef.current;
        if (!container) return;

        const revealSelectedChip = () => {
            const chip = container.querySelector<HTMLElement>('[aria-pressed="true"]');
            if (!chip || container.scrollWidth <= container.clientWidth) return;
            const boxRect = container.getBoundingClientRect();
            const chipRect = chip.getBoundingClientRect();
            if (chipRect.left < boxRect.left || chipRect.right > boxRect.right) {
                container.scrollLeft += chipRect.left - boxRect.left - 16;
            }
        };

        revealSelectedChip();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(revealSelectedChip);
        observer.observe(container);
        return () => observer.disconnect();
    }, [activeGroupId, groups, showChips]);

    // 세션 확인 중이거나, 로그인 상태에서 보여 줄 그룹을 아직 모를 때만 로딩을 보여준다
    const showLoading = sessionLoading || (!!user && groupsLoading && !activeGroupId);

    const openLogin = () => setIsLoginModalOpen(true);

    const handleActionClick = (action: () => void) => {
        if (!session) {
            setIsLoginModalOpen(true);
        } else {
            action();
        }
    };

    const openCreate = () => handleActionClick(() => setIsCreateModalOpen(true));

    // 칩으로 그룹을 바꾸면 주소도 /groups/[id]로 맞춰 새로고침·공유해도 같은 그룹이 열린다.
    const selectGroup = (groupId: string) => {
        setSelectedGroupId(groupId);
        setView('mine');
        if (window.location.pathname !== `/groups/${groupId}`) {
            window.history.replaceState(null, '', `/groups/${groupId}`);
        }
    };

    const handleGroupAdded = (groupId?: string) => {
        setView('mine');
        void fetchGroups();
        if (groupId) selectGroup(groupId);
    };

    const handleGroupRemoved = useCallback((groupId: string) => {
        setGroups((prev) => prev.filter((group) => group.id !== groupId));
        setSelectedGroupId(null);
        void fetchGroups();
        router.replace('/groups');
    }, [fetchGroups, router]);

    const handleDetailLoadError = useCallback(() => {
        setSelectedGroupId(null);
        router.replace('/groups');
    }, [router]);

    const handleSummaryChange = useCallback((summary: GroupSummary) => {
        setGroups((prev) =>
            prev.map((group) =>
                group.id === summary.id
                    ? { ...group, name: summary.name, leader_id: summary.leader_id, memberCount: summary.memberCount }
                    : group
            )
        );
    }, []);

    const dismissInvite = () => {
        setIsInviteDismissed(true);
        const params = new URLSearchParams(window.location.search);
        params.delete('code');
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    };

    const hasGroups = groups.length > 0;
    const subtitle = !user || groupsLoading
        ? null
        : hasGroups ? `내 그룹 ${groups.length}개` : '아직 속한 그룹이 없어요';
    const mobileSubtitle = !user || groupsLoading
        ? null
        : hasGroups ? `내 그룹 ${groups.length}개` : '속한 그룹 없음';

    const mobileTopBar = (
        <MobileTopBar
            start={<TopBarTitle title="그룹" subtitle={mobileSubtitle} />}
            end={
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={openCreate}
                        aria-label="그룹 만들기"
                        className="ui-icon-button ui-focus-ink bg-pomo text-white hover:brightness-96"
                    >
                        <Plus aria-hidden="true" size={18} strokeWidth={2.5} />
                    </button>
                    {session ? (
                        <NotificationBell variant="topbar" />
                    ) : (
                        <button type="button" onClick={openLogin} className="ui-button-secondary min-h-10 px-4 text-sm">
                            로그인
                        </button>
                    )}
                </div>
            }
        />
    );

    let body;
    if (showLoading) {
        body = <GroupLoading />;
    } else if (!session) {
        body = (
            <section aria-labelledby={guestTitleId} className="flex flex-col items-start gap-3 px-2 py-2 md:px-0 md:py-3">
                <h2 id={guestTitleId} className="ui-h2">
                    {inviteCode ? '초대받은 그룹에 참여하려면 로그인해 주세요' : '로그인하고 그룹에 참여해 보세요'}
                </h2>
                <p className="m-0 text-sm text-ink-muted md:text-[15px]">
                    친구들과 함께 집중할 그룹을 만들거나, 받은 초대 코드로 참여할 수 있어요.
                </p>
                <button type="button" onClick={openLogin} className="ui-button-primary ui-press mt-1 min-h-12 rounded-tile px-6">
                    로그인하기
                </button>
            </section>
        );
    } else if (view === 'join') {
        body = <JoinGroupPanel onJoined={handleGroupAdded} />;
    } else if (activeGroupId) {
        body = (
            <GroupDetail
                key={activeGroupId}
                groupId={activeGroupId}
                onSummaryChange={handleSummaryChange}
                onRemoved={handleGroupRemoved}
                onLoadError={handleDetailLoadError}
            />
        );
    } else {
        body = (
            <p className="m-0 px-2 py-3 text-sm text-ink-muted md:p-3 md:text-[15px]">
                아직 속한 그룹이 없어요. 초대 코드로 참여하거나 새 그룹을 만들어 보세요.
            </p>
        );
    }

    return (
        <div className="bg-white">
            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                onGoogleLogin={() => {
                    setIsLoginModalOpen(false);
                    // 초대 링크나 /groups/[id]로 들어왔다면 로그인 뒤 같은 주소로 돌아온다.
                    const { origin, pathname, search } = window.location;
                    supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: `${origin}${pathname}${search}` }
                    });
                }}
            />
            <Navbar session={session} onOpenLogin={openLogin} mobileTopBar={mobileTopBar} />

            <section
                aria-label="그룹 보기"
                className="mx-auto flex w-full max-w-[960px] flex-col md:gap-[18px] md:px-10 md:pt-2 md:pb-5"
            >
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="hidden flex-col gap-1 md:flex">
                        <h1 className="ui-h1">그룹</h1>
                        {subtitle ? <p className="m-0 text-ink-muted">{subtitle}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 px-4 pt-3 md:p-0">
                        {session ? (
                            <div
                                role="group"
                                aria-label="그룹 보기 방식"
                                className="ui-segmented [&>button]:h-[34px] [&>button]:px-3.5 md:[&>button]:h-[38px] md:[&>button]:px-4 md:[&>button]:text-[15px]"
                            >
                                <button type="button" aria-pressed={view === 'mine'} onClick={() => setView('mine')}>
                                    {groupsLoading ? '내 그룹' : `내 그룹 ${groups.length}`}
                                </button>
                                <button type="button" aria-pressed={view === 'join'} onClick={() => setView('join')}>
                                    코드로 참여
                                </button>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={openCreate}
                            className="ui-button-primary ui-press hidden min-h-12 rounded-tile px-[18px] md:inline-flex"
                        >
                            <Plus aria-hidden="true" size={16} strokeWidth={2.5} />
                            그룹 만들기
                        </button>
                    </div>
                </div>

                {showChips ? (
                    <div
                        ref={chipsRef}
                        role="group"
                        aria-label="내 그룹"
                        className="ui-scrollbar-none flex gap-2 overflow-x-auto px-4 pt-3 pb-4 md:flex-wrap md:overflow-visible md:p-0"
                    >
                        {groups.map((group) => {
                            const isSelected = group.id === activeGroupId;
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => selectGroup(group.id)}
                                    className={cn(
                                        'inline-flex h-10 max-w-[80vw] shrink-0 items-center gap-2 rounded-control px-3.5 text-sm font-semibold whitespace-nowrap transition-[filter] duration-150 hover:brightness-97 md:h-11 md:max-w-none md:gap-2.5 md:rounded-tile md:px-[18px] md:text-[15px]',
                                        isSelected ? 'bg-pomo-tint text-pomo' : 'bg-surface text-ink',
                                    )}
                                >
                                    <span className="min-w-0 truncate">{group.name}</span>
                                    {group.memberCount !== null ? (
                                        <span
                                            className={cn(
                                                'shrink-0 text-xs font-medium md:text-[13px]',
                                                isSelected ? 'text-ink-muted md:text-pomo' : 'text-ink-muted',
                                            )}
                                        >
                                            {group.memberCount}명
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div aria-hidden="true" className="h-3 md:hidden" />
                )}
            </section>

            <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-3 pt-1 pb-10 md:px-10 md:pt-3 md:pb-16">
                {body}
            </div>

            <CreateGroupModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreated={handleGroupAdded}
            />

            <JoinGroupModal
                key={inviteCode ?? 'none'}
                isOpen={!!session && !!inviteCode}
                initialCode={inviteCode ?? ''}
                onClose={dismissInvite}
                onJoined={(groupId) => {
                    dismissInvite();
                    handleGroupAdded(groupId);
                }}
            />
        </div>
    );
}
