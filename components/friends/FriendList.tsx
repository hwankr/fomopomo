'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Session } from '@supabase/supabase-js';
import { Bell, BellOff, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getDayStart, getStudyDayRange, getStudyWeekRange, type TimeRange } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import Avatar, { getDisplayName } from '@/components/ui/Avatar';
import { stopActivationKeys, stopAllKeys } from '@/components/ui/keyBoundary';
import ConfirmModal from '@/components/ConfirmModal';
import { formatHoursMinutes, getLiveSeconds, useNow } from '@/components/common/LiveStudyDuration';
import MemberReportModal from '../MemberReportModal';
import FriendNicknameDialog from './FriendNicknameDialog';
import { FriendStatusBadge, type FriendStatus } from './FriendStatusBadge';

export interface FriendListSummary {
  friendCount: number;
  studyingCount: number;
}

interface FriendListProps {
  session: Session;
  refreshTrigger: number;
  /** 친구 수와 지금 공부 중인 친구 수. 불러오는 동안은 null. */
  onSummaryChange?: (summary: FriendListSummary | null) => void;
}

interface FriendProfile {
  status: FriendStatus;
  current_task: string | null;
  last_active_at: string | null;
  study_start_time: string | null;
  total_stopwatch_time: number | null;
}

interface Friendship {
  id: string;
  friend_email: string;
  friend_id: string;
  nickname: string | null;
  created_at: string;
  is_notification_enabled: boolean;
  friend: FriendProfile;
}

type FriendshipRow = Omit<Friendship, 'friend'> & {
  friend: FriendProfile | FriendProfile[] | null;
};

type StudyTotals = { today: number; week: number };

interface RankingRow {
  key: string;
  userId: string;
  name: string;
  isMe: boolean;
  friendship: Friendship | null;
  status: FriendStatus;
  task: string | null;
  today: number;
  week: number;
}

function normalizeFriendProfile(
  friend: FriendshipRow['friend']
): FriendProfile | null {
  if (Array.isArray(friend)) {
    return friend[0] ?? null;
  }

  return friend;
}

const getFriendName = (friend: Friendship) =>
  friend.nickname || friend.friend_email || '알 수 없는 사용자';

async function fetchFriendTotals(userId: string, range: TimeRange) {
  try {
    const { data, error } = await supabase.rpc('get_friends_study_time', {
      p_user_id: userId,
      p_start_time: range.start.toISOString(),
      p_end_time: range.end.toISOString(),
    });

    if (error) {
      console.error('Error fetching friends study time:', error);
      return null;
    }

    const timeMap: Record<string, number> = {};
    (data ?? []).forEach((item: { friend_id: string; total_seconds: number }) => {
      timeMap[item.friend_id] = Number(item.total_seconds) || 0;
    });
    return timeMap;
  } catch (error) {
    console.error('Error fetching friends study time:', error);
    return null;
  }
}

// 순위에 함께 오르는 내 기록: 이번 공부주 세션을 한 번 읽어 오늘과 이번 주를 나눠 더한다.
async function fetchMyTotals(userId: string, today: TimeRange, week: TimeRange): Promise<StudyTotals | null> {
  try {
    const { data, error } = await supabase
      .from('study_sessions')
      .select('duration, created_at')
      .eq('user_id', userId)
      .gte('created_at', week.start.toISOString())
      .lte('created_at', week.end.toISOString());

    if (error) {
      console.error('Error fetching my study time:', error);
      return null;
    }

    const totals: StudyTotals = { today: 0, week: 0 };
    (data ?? []).forEach((row: { duration: number; created_at: string }) => {
      const seconds = Number(row.duration) || 0;
      const createdAt = new Date(row.created_at).getTime();
      totals.week += seconds;
      if (createdAt >= today.start.getTime() && createdAt <= today.end.getTime()) {
        totals.today += seconds;
      }
    });
    return totals;
  } catch (error) {
    console.error('Error fetching my study time:', error);
    return null;
  }
}

// 저장된 시간 + 지금 진행 중인 공부(공부 중이면 시작 시각부터, 일시정지면 아직 저장 안 된 시간).
function withLiveTime(
  profile: FriendProfile | null,
  saved: StudyTotals,
  dayStart: Date,
  weekStart: Date,
  now: number
): StudyTotals {
  if (profile?.status === 'studying' && profile.study_start_time) {
    return {
      today: saved.today + getLiveSeconds(profile.study_start_time, dayStart, now),
      week: saved.week + getLiveSeconds(profile.study_start_time, weekStart, now),
    };
  }

  if (profile?.status === 'paused') {
    const pending = profile.total_stopwatch_time || 0;
    return { today: saved.today + pending, week: saved.week + pending };
  }

  return saved;
}

export default function FriendList(props: FriendListProps) {
  return <FriendListContent key={props.session.user.id} {...props} />;
}

function FriendListContent({ session, refreshTrigger, onSummaryChange }: FriendListProps) {
  const userId = session.user.id;
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [myProfile, setMyProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFriend, setEditingFriend] = useState<Friendship | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deletingFriend, setDeletingFriend] = useState<{ id: string; name: string; friendId: string } | null>(null);
  const [selectedFriendForReport, setSelectedFriendForReport] = useState<{ id: string; name: string } | null>(null);
  const [todayTimes, setTodayTimes] = useState<Record<string, number>>({});
  const [weekTimes, setWeekTimes] = useState<Record<string, number>>({});
  const [myTimes, setMyTimes] = useState<StudyTotals>({ today: 0, week: 0 });
  const studyTimeRequestRef = useRef(0);
  const friendsRequestRef = useRef(0);
  const friendIdsRef = useRef<Set<string> | null>(null);

  const fetchStudyTimes = useCallback(async () => {
    const requestId = ++studyTimeRequestRef.current;
    // 공부일(로컬 05:00 경계)과 그 공부일이 속한 공부주(월요일 05:00부터) 절대 범위를
    // 서버에 전달한다 — lib/dateUtils.ts 정책 참고
    const today = getStudyDayRange();
    const week = getStudyWeekRange(today.start);
    const [friendToday, friendWeek, mine] = await Promise.all([
      fetchFriendTotals(userId, today),
      fetchFriendTotals(userId, week),
      fetchMyTotals(userId, today, week),
    ]);

    if (requestId !== studyTimeRequestRef.current) return;
    if (friendToday) setTodayTimes(friendToday);
    if (friendWeek) setWeekTimes(friendWeek);
    if (mine) setMyTimes(mine);
  }, [userId]);

  const fetchFriends = useCallback(async () => {
    const requestId = ++friendsRequestRef.current;
    try {
      const [friendshipResult, profileResult] = await Promise.all([
        supabase
          .from('friendships')
          .select(`
            id,
            friend_email,
            friend_id,
            nickname,
            created_at,
            is_notification_enabled,
            friend:friend_id (
              status,
              current_task,
              last_active_at,
              study_start_time,
              total_stopwatch_time
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('status, current_task, last_active_at, study_start_time, total_stopwatch_time')
          .eq('id', userId)
          .maybeSingle(),
      ]);

      if (requestId !== friendsRequestRef.current) return;

      if (profileResult.error) {
        console.error('Error fetching my status:', profileResult.error);
      } else {
        setMyProfile((profileResult.data as FriendProfile | null) ?? null);
      }

      const { data, error } = friendshipResult;
      if (error) throw error;

      const friendshipRows = (data ?? []) as FriendshipRow[];
      friendIdsRef.current = new Set(friendshipRows.map((row) => row.friend_id));
      setFriends(
        friendshipRows.flatMap((row) => {
          const friend = normalizeFriendProfile(row.friend);
          if (!friend) {
            return [];
          }

          return [{ ...row, friend }];
        })
      );
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      if (requestId === friendsRequestRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.all([fetchFriends(), fetchStudyTimes()]);
    };
    void load();

    const channel = supabase
      .channel(`friend-list-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          if (cancelled) return;
          const nextStatus = {
            status: payload.new.status,
            current_task: payload.new.current_task,
            last_active_at: payload.new.last_active_at,
            study_start_time: payload.new.study_start_time,
            total_stopwatch_time: payload.new.total_stopwatch_time,
          };
          if (payload.new.id === userId) {
            setMyProfile((prev) => ({ ...prev, ...nextStatus }));
            return;
          }
          setFriends((prev) =>
            prev.map((f) => {
              if (f.friend_id === payload.new.id) {
                return {
                  ...f,
                  friend: {
                    ...f.friend,
                    ...nextStatus,
                  },
                };
              }
              return f;
            })
          );
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'study_sessions' },
        (payload) => {
          if (cancelled) return;
          const nextRow = payload.new as { user_id?: string };
          const previousRow = payload.old as { user_id?: string };
          const changedUserId = nextRow.user_id ?? previousRow.user_id;
          // DELETE payloads may contain only the primary key under RLS.
          if (
            !changedUserId ||
            changedUserId === userId ||
            !friendIdsRef.current ||
            friendIdsRef.current.has(changedUserId)
          ) {
            void fetchStudyTimes();
          }
        }
      )
      .subscribe((status) => {
        // Reconcile records saved before the subscription or during a reconnect.
        if (!cancelled && status === 'SUBSCRIBED') void fetchStudyTimes();
      });

    return () => {
      cancelled = true;
      studyTimeRequestRef.current += 1;
      friendsRequestRef.current += 1;
      supabase.removeChannel(channel);
    };
  }, [fetchFriends, fetchStudyTimes, refreshTrigger, userId]);

  const studyingCount = friends.filter((f) => f.friend.status === 'studying').length;

  useEffect(() => {
    onSummaryChange?.(loading ? null : { friendCount: friends.length, studyingCount });
  }, [friends.length, loading, onSummaryChange, studyingCount]);

  // 누군가 공부 중일 때만 1초 시계를 돌려 순위와 시간을 함께 갱신한다.
  const now = useNow(studyingCount > 0 || myProfile?.status === 'studying');

  const confirmDelete = (friend: Friendship) => {
    setDeletingFriend({
      id: friend.id,
      name: getFriendName(friend),
      friendId: friend.friend_id
    });
  };

  const handleDelete = async () => {
    const target = deletingFriend;
    if (!target) return;

    try {
      const { error } = await supabase.rpc('delete_friend', { friend_uuid: target.friendId });

      if (error) throw error;
      setFriends(prev => prev.filter(f => f.id !== target.id));
      toast.success('친구를 삭제했어요.');
    } catch (error) {
      console.error('Error deleting friend:', error);
      toast.error('친구를 삭제하지 못했어요.');
    }
  };

  const handleStartEdit = (friend: Friendship) => {
    setEditingFriend(friend);
    setEditName(friend.nickname || friend.friend_email);
  };

  const handleCancelEdit = () => {
    setEditingFriend(null);
    setEditName('');
  };

  const handleSaveEdit = async () => {
    if (!editingFriend) return;
    const id = editingFriend.id;
    const nickname = editName.trim() || null;

    setSavingName(true);
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ nickname })
        .eq('id', id);

      if (error) throw error;

      setFriends(prev => prev.map(f =>
        f.id === id ? { ...f, nickname } : f
      ));
      setEditingFriend(null);
      toast.success('닉네임을 바꿨어요.');
    } catch (error) {
      console.error('Error updating nickname:', error);
      toast.error('닉네임을 바꾸지 못했어요.');
    } finally {
      setSavingName(false);
    }
  };

  const toggleNotification = async (friend: Friendship) => {
    try {
      const newValue = !friend.is_notification_enabled;
      const { error } = await supabase
        .from('friendships')
        .update({ is_notification_enabled: newValue })
        .eq('id', friend.id);

      if (error) throw error;

      setFriends(prev => prev.map(f =>
        f.id === friend.id ? { ...f, is_notification_enabled: newValue } : f
      ));
      toast.success(newValue ? '공부 시작 알림을 켰어요.' : '공부 시작 알림을 껐어요.');
    } catch (error) {
      console.error('Error toggling notification:', error);
      toast.error('알림 설정을 바꾸지 못했어요.');
    }
  };

  if (loading) {
    return <p className="m-0 px-2 py-5 text-sm text-ink-muted md:px-3 md:py-6 md:text-[15px]">친구 목록을 불러오는 중이에요.</p>;
  }

  if (friends.length === 0) {
    return (
      <p className="m-0 px-2 py-5 text-sm text-ink-muted md:px-3 md:py-6 md:text-[15px]">
        아직 친구가 없어요. 찾기에서 친구를 추가해 보세요.
      </p>
    );
  }

  const dayStart = getDayStart(new Date(now));
  const weekStart = getStudyWeekRange(dayStart).start;
  const rows: RankingRow[] = [
    ...friends.map((friend) => {
      const totals = withLiveTime(
        friend.friend,
        { today: todayTimes[friend.friend_id] || 0, week: weekTimes[friend.friend_id] || 0 },
        dayStart,
        weekStart,
        now
      );
      return {
        key: friend.id,
        userId: friend.friend_id,
        name: getFriendName(friend),
        isMe: false,
        friendship: friend,
        status: friend.friend.status,
        task: friend.friend.current_task,
        ...totals,
      };
    }),
    {
      key: 'me',
      userId,
      name: getDisplayName(session.user) ?? '나',
      isMe: true,
      friendship: null,
      status: myProfile?.status ?? null,
      task: myProfile?.current_task ?? null,
      ...withLiveTime(myProfile, myTimes, dayStart, weekStart, now),
    },
  ].sort((a, b) => b.today - a.today || b.week - a.week);

  return (
    <>
      <section aria-label="오늘 집중 시간 순위" className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2 pb-1.5 text-xs font-semibold text-ink-muted md:hidden">
          <span>오늘 가장 오래 집중한 순서</span>
          <span className="mr-10 pl-3">오늘 (시:분)</span>
        </div>
        <div className="hidden items-center md:flex">
          <div className="flex min-w-0 flex-1 items-center gap-4 px-3 pb-2.5 text-[13px] font-semibold text-ink-muted">
            <span className="w-8 shrink-0">순위</span>
            <span className="min-w-0 flex-1">오늘 가장 오래 집중한 순서</span>
            <span className="w-[88px] shrink-0 text-right">오늘</span>
            <span className="w-[104px] shrink-0 text-right">이번 주</span>
          </div>
          <span aria-hidden="true" className="w-10 shrink-0" />
        </div>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {rows.map((row, index) => {
            const friend = row.friendship;
            return (
              <li
                key={row.key}
                className={cn(
                  'flex items-center rounded-tile transition-colors md:rounded-2xl',
                  row.isMe ? 'bg-surface' : 'hover:bg-hover',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedFriendForReport({ id: row.userId, name: row.name })}
                  className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 rounded-[inherit] px-2 py-1.5 text-left md:min-h-[82px] md:gap-4 md:px-3 md:py-2"
                >
                  <span
                    className={cn(
                      'w-6 shrink-0 font-display text-lg leading-none font-bold md:w-8 md:text-xl',
                      index === 0 ? 'text-pomo' : 'text-ink-muted',
                    )}
                  >
                    <span className="sr-only">순위 </span>
                    {index + 1}
                  </span>
                  <Avatar
                    name={row.name}
                    tone={row.isMe ? 'solid' : 'tint'}
                    className="md:size-10 md:text-[15px]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-px md:gap-0.5">
                    <span
                      className={cn(
                        'flex min-w-0 items-center gap-1.5 text-[15px] md:gap-2 md:text-base',
                        row.isMe ? 'font-bold' : 'font-semibold',
                      )}
                    >
                      <span className="min-w-0 truncate" title={friend?.nickname ? `${row.name} (${friend.friend_email})` : row.name}>
                        {row.name}
                      </span>
                      {row.isMe ? (
                        <span className="shrink-0 rounded-md bg-pomo-tint px-1.5 py-px text-[11px] font-bold text-pomo md:px-[7px] md:py-0.5">
                          나
                        </span>
                      ) : null}
                      {friend && !friend.is_notification_enabled ? (
                        <>
                          <BellOff aria-hidden="true" size={14} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
                          <span className="sr-only">공부 시작 알림 꺼짐</span>
                        </>
                      ) : null}
                    </span>
                    <FriendStatusBadge status={row.status} task={row.task} />
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-px md:contents">
                    <span className="text-[15px] font-bold md:w-[88px] md:text-right md:text-base">
                      <span className="sr-only">오늘 </span>
                      {formatHoursMinutes(row.today)}
                    </span>
                    <span className="text-[11px] text-ink-muted md:w-[104px] md:text-right md:text-[15px]">
                      <span className="sr-only">이번 주 </span>
                      <span aria-hidden="true" className="md:hidden">주 </span>
                      {formatHoursMinutes(row.week)}
                    </span>
                  </span>
                </button>
                {friend ? (
                  <FriendRowMenu
                    friend={friend}
                    name={row.name}
                    onToggleNotification={() => void toggleNotification(friend)}
                    onEditNickname={() => handleStartEdit(friend)}
                    onDelete={() => confirmDelete(friend)}
                  />
                ) : (
                  <span aria-hidden="true" className="w-10 shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
        <p className="mx-3 mt-3.5 mb-0 hidden text-[13px] text-ink-muted md:block">
          시간은 시:분이에요. 공부 중인 친구는 지금 하는 작업이 함께 보여요.
        </p>
      </section>

      <FriendNicknameDialog
        open={!!editingFriend}
        email={editingFriend?.friend_email ?? ''}
        value={editName}
        saving={savingName}
        onChange={setEditName}
        onSave={() => void handleSaveEdit()}
        onCancel={handleCancelEdit}
      />

      <ConfirmModal
        isOpen={!!deletingFriend}
        onClose={() => setDeletingFriend(null)}
        onConfirm={() => void handleDelete()}
        title="친구 삭제"
        message={`${deletingFriend?.name ?? ''} 님을 친구 목록에서 삭제할까요? 서로의 공부 상태와 순위가 더 이상 보이지 않아요.`}
        confirmText="삭제"
        confirmTone="danger"
      />

      {
        selectedFriendForReport && (
          <MemberReportModal
            isOpen={!!selectedFriendForReport}
            onClose={() => setSelectedFriendForReport(null)}
            userId={selectedFriendForReport.id}
            userName={selectedFriendForReport.name}
          />
        )
      }
    </>
  );
}

const MENU_ITEM_CLASS =
  'flex min-h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium transition-colors hover:bg-hover';

interface FriendRowMenuProps {
  friend: Friendship;
  name: string;
  onToggleNotification: () => void;
  onEditNickname: () => void;
  onDelete: () => void;
}

// 친구 줄 끝의 더보기: 친구 정보(이메일·추가일)와 알림·닉네임·삭제.
function FriendRowMenu({ friend, name, onToggleNotification, onEditNickname, onDelete }: FriendRowMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 대화상자를 열기 전에 트리거로 포커스를 돌려 두어, 대화상자가 닫히면 이 버튼으로 돌아오게 한다.
  const run = (action: () => void) => {
    triggerRef.current?.focus();
    setOpen(false);
    action();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${name} 친구 메뉴`}
          onKeyDown={stopActivationKeys}
          className="ui-icon-button shrink-0 text-ink-muted"
        >
          <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={`${name} 친구 메뉴`}
          align="end"
          sideOffset={4}
          collisionPadding={12}
          onKeyDown={stopAllKeys}
          className="ui-popover ui-popover-surface z-50 w-64 max-w-[calc(100vw-24px)] outline-none"
        >
          <div className="flex flex-col gap-0.5 px-3 pt-2 pb-2.5">
            <p className="m-0 truncate text-sm font-semibold text-ink">{name}</p>
            <p className="m-0 truncate text-xs text-ink-subtle">{friend.friend_email}</p>
            <p className="m-0 text-xs text-ink-subtle">
              {new Date(friend.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}에 친구가 됐어요
            </p>
          </div>
          <button type="button" onClick={() => run(onToggleNotification)} className={cn(MENU_ITEM_CLASS, 'text-ink')}>
            {friend.is_notification_enabled ? (
              <BellOff aria-hidden="true" size={16} strokeWidth={1.8} />
            ) : (
              <Bell aria-hidden="true" size={16} strokeWidth={1.8} />
            )}
            {friend.is_notification_enabled ? '공부 시작 알림 끄기' : '공부 시작 알림 켜기'}
          </button>
          <button type="button" onClick={() => run(onEditNickname)} className={cn(MENU_ITEM_CLASS, 'text-ink')}>
            <Pencil aria-hidden="true" size={16} strokeWidth={1.8} />
            닉네임 수정
          </button>
          <button type="button" onClick={() => run(onDelete)} className={cn(MENU_ITEM_CLASS, 'text-pomo-deep')}>
            <Trash2 aria-hidden="true" size={16} strokeWidth={1.8} />
            친구 삭제
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
