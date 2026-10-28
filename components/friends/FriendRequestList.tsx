'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import Avatar from '@/components/ui/Avatar';
import { getRunningAnimations, prefersReducedMotion, whenAnimationsFinish } from '@/components/ui/motion';
import { usePlayOnce } from '@/components/ui/usePlayOnce';
import { cn } from '@/lib/utils';

interface FriendRequestListProps {
  session: Session;
  refreshTrigger: number;
  onUpdate: () => void;
  /** 앱 셸이 구독하는 받은 요청 수. 바뀌면(새 요청 도착 등) 목록을 다시 불러온다. */
  incomingCount?: number;
  /** 받은 요청 수가 바뀔 때마다 알린다(탭 라벨용). */
  onCountChange?: (count: number) => void;
  /** 이 패널이 보이는지(요청 탭). 숨으면 남은 피드백 표시를 바로 뗀다. */
  active?: boolean;
}

interface FriendRequest {
  id: string;
  sender_email: string;
  created_at: string;
}

function formatRequestDate(createdAt: string) {
  const date = new Date(createdAt);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}년 `}${date.getMonth() + 1}월 ${date.getDate()}일에 받은 요청`;
}

export default function FriendRequestList({
  session,
  refreshTrigger,
  onUpdate,
  incomingCount,
  onCountChange,
  active = true,
}: FriendRequestListProps) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 수락·거절한 요청은 목록에서 바로 빠지고, 그 줄만 제자리에 남아 사라진다(클릭·포커스는 받지 않는다).
  const [leaving, setLeaving] = useState<{ request: FriendRequest; index: number } | null>(null);
  const leavingRef = useRef<HTMLLIElement>(null);
  // 사용자가 마지막 요청을 처리해 목록이 비었을 때만 빈 상태 문구가 서서히 나타난다.
  const [emptiedByUser, setEmptiedByUser] = useState(false);
  const emptyRef = useRef<HTMLParagraphElement>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('id, sender_email, created_at')
        .eq('receiver_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const nextRequests = data || [];
      setRequests(nextRequests);
      if (nextRequests.length > 0) setEmptiedByUser(false);
      onCountChange?.(nextRequests.length);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }, [onCountChange, session.user.id]);

  useEffect(() => {
    const load = async () => {
      await fetchRequests();
    };

    void load();
  }, [fetchRequests, refreshTrigger, incomingCount]);

  useLayoutEffect(() => {
    if (!leaving) return;
    const animations = prefersReducedMotion() ? [] : getRunningAnimations([leavingRef.current]);
    return whenAnimationsFinish(animations, () => setLeaving(null));
  }, [leaving]);

  // 서버가 처리한 요청을 목록에서 뺀다. 다시 불러오기(fetchRequests)가 결과를 맞춘다.
  const removeRequest = (requestId: string) => {
    const index = requests.findIndex((request) => request.id === requestId);
    if (index >= 0) setLeaving({ request: requests[index], index });
    if (requests.length === 1 && index === 0) setEmptiedByUser(true);
    setRequests((prev) => prev.filter((request) => request.id !== requestId));
  };

  const handleAccept = async (requestId: string) => {
    setPendingId(requestId);
    try {
      const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId });
      if (error) throw error;
      removeRequest(requestId);
      onUpdate();
      fetchRequests();
    } catch (error) {
      console.error('Error accepting request:', error);
      toast.error('친구 요청을 수락하지 못했어요.');
    } finally {
      setPendingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setPendingId(requestId);
    try {
      const { error } = await supabase.rpc('reject_friend_request', { request_id: requestId });
      if (error) throw error;
      removeRequest(requestId);
      onUpdate();
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error('친구 요청을 거절하지 못했어요.');
    } finally {
      setPendingId(null);
    }
  };

  // 사라지는 줄은 다시 불러온 목록에 없어도 원래 자리에 둔다.
  const shownRequests = leaving && !requests.some((request) => request.id === leaving.request.id)
    ? [...requests.slice(0, leaving.index), leaving.request, ...requests.slice(leaving.index)]
    : requests;

  const message = loading
    ? '받은 요청을 불러오는 중이에요.'
    : shownRequests.length === 0
      ? '받은 요청이 없어요. 찾기에서 친구를 추가해 보세요.'
      : null;

  // 사라지는 줄이 다 빠지고 문구가 그려진 뒤에 한 번 돌고 뗀다. 다른 탭을 골라 패널이 숨으면 그 렌더에서 떼어,
  // 돌아와도 다시 돌지 않는다.
  if (!active && emptiedByUser) setEmptiedByUser(false);
  const emptyEntering = !loading && emptiedByUser && shownRequests.length === 0;
  usePlayOnce(emptyEntering || null, emptyRef, () => setEmptiedByUser(false));

  return (
    <section aria-label="받은 친구 요청" className="flex flex-col gap-0.5">
      {message ? (
        <p
          ref={emptyRef}
          className={cn(
            'm-0 px-2 py-5 text-sm text-ink-muted md:px-3 md:py-6 md:text-[15px]',
            emptyEntering && 'animate-fade-in',
          )}
        >
          {message}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {shownRequests.map((req) => {
            const isLeaving = leaving?.request.id === req.id;
            const busy = pendingId === req.id || isLeaving;
            return (
              <li
                key={req.id}
                ref={isLeaving ? leavingRef : undefined}
                data-state={isLeaving ? 'closed' : undefined}
                inert={isLeaving || undefined}
                className={cn(
                  'flex min-h-20 items-center gap-3 rounded-tile p-2 md:min-h-[92px] md:flex-wrap md:gap-4 md:rounded-2xl md:px-3 md:py-2.5',
                  isLeaving && 'pointer-events-none animate-fade-out',
                )}
              >
                <Avatar name={req.sender_email} className="bg-surface text-ink md:size-10 md:text-[15px]" />
                <div className="flex min-w-0 flex-1 flex-col gap-px md:basis-[200px] md:gap-0.5">
                  <span className="truncate text-[15px] font-semibold md:text-base" title={req.sender_email}>
                    {req.sender_email}
                  </span>
                  <span className="text-xs text-ink-muted md:text-[13px]">{formatRequestDate(req.created_at)}</span>
                </div>
                <div className="flex shrink-0 gap-1.5 md:gap-2">
                  <button
                    type="button"
                    onClick={() => handleReject(req.id)}
                    disabled={busy}
                    aria-label={`${req.sender_email} 친구 요청 거절`}
                    className="ui-button-secondary min-h-10 rounded-control px-3 text-sm md:min-h-11 md:rounded-tile md:px-[18px] md:text-[15px]"
                  >
                    거절
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccept(req.id)}
                    disabled={busy}
                    aria-label={`${req.sender_email} 친구 요청 수락`}
                    className="ui-button-primary ui-press min-h-10 rounded-control px-3.5 text-sm md:min-h-11 md:rounded-tile md:px-5 md:text-[15px]"
                  >
                    수락
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
