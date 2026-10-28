'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import MobileTopBar, { TopBarTitle } from '@/components/layout/MobileTopBar';
import NotificationBell from '@/components/layout/NotificationBell';
import { useShell } from '@/components/layout/ShellProvider';
import { cn } from '@/lib/utils';
import AddFriend from './AddFriend';
import FriendRequestList from './FriendRequestList';
import FriendList, { type FriendListSummary } from './FriendList';
import Navbar from '../Navbar';

interface FriendsDashboardProps {
  session: Session | null;
  onOpenLogin?: () => void;
}

type FriendsTab = 'friends' | 'requests' | 'search';

const TABS: FriendsTab[] = ['friends', 'requests', 'search'];

// ?tab=requests 처럼 주소로 탭을 고를 수 있다(알림에서 받은 요청으로 바로 가기 등).
function parseTab(value: string | null): FriendsTab {
  return value === 'requests' || value === 'search' ? value : 'friends';
}

export default function FriendsDashboard({ session, onOpenLogin }: FriendsDashboardProps) {
  const { friendRequestCount } = useShell();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = parseTab(searchParams.get('tab'));
  const [tab, setTab] = useState<FriendsTab>(urlTab);
  // 탭을 바꿔 새로 보이게 된 패널. 그 패널만 서서히 나타난다(처음 열 때는 화면 전환이 맡는다).
  const [enteredTab, setEnteredTab] = useState<FriendsTab | null>(null);
  // 같은 페이지에서 주소의 탭이 바뀌면(알림 링크 등) 따라간다.
  const [lastUrlTab, setLastUrlTab] = useState(urlTab);
  if (urlTab !== lastUrlTab) {
    setLastUrlTab(urlTab);
    setTab(urlTab);
    if (urlTab !== tab) setEnteredTab(urlTab);
  }
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Shared state refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [summary, setSummary] = useState<FriendListSummary | null>(null);
  const [requestCount, setRequestCount] = useState<number | null>(null);

  const refreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // 탭은 기록을 쌓지 않고 주소만 바꾼다(새로고침·공유해도 같은 탭).
  const selectTab = (next: FriendsTab) => {
    if (next !== tab) setEnteredTab(next);
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'friends') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const nextIndex =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
          : event.key === 'Home' ? 0
            : event.key === 'End' ? last
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(TABS[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  const studyingCount = summary?.studyingCount ?? 0;
  const subtitle = session && summary
    ? studyingCount ? `지금 ${studyingCount}명이 공부하고 있어요` : '지금 공부 중인 친구가 없어요'
    : null;
  const mobileSubtitle = session && summary
    ? studyingCount ? `지금 ${studyingCount}명 공부 중` : '지금 공부 중인 친구 없음'
    : null;

  const tabLabels: Record<FriendsTab, string> = {
    friends: summary ? `친구 ${summary.friendCount}` : '친구',
    requests: requestCount !== null ? `요청 ${requestCount}` : '요청',
    search: '찾기',
  };
  const tabId = (key: FriendsTab) => `${baseId}-tab-${key}`;
  const panelId = (key: FriendsTab) => `${baseId}-panel-${key}`;
  // 숨겼다(hidden) 보이는 패널은 CSS 애니메이션이 처음부터 다시 돈다. 바꿔서 보이게 된 패널에만 붙인다.
  const panelClass = (key: FriendsTab) => (enteredTab === key ? 'animate-fade-in' : undefined);

  const loginButton = (
    <button type="button" onClick={onOpenLogin} className="ui-button-secondary min-h-10 px-4 text-sm">
      로그인
    </button>
  );

  return (
    <div className="flex flex-col bg-white">
      <Navbar
        session={session}
        onOpenLogin={onOpenLogin}
        mobileTopBar={
          <MobileTopBar
            start={<TopBarTitle title="친구" subtitle={mobileSubtitle} />}
            end={session ? <NotificationBell variant="topbar" /> : loginButton}
          />
        }
      />

      <section
        aria-label="친구 보기"
        className={cn(
          'mx-auto box-border w-full max-w-[960px] flex-wrap items-end justify-between gap-4 px-4 pt-3 pb-4 md:flex md:px-10 md:pt-2 md:pb-5',
          // 모바일 제목은 상단 바에 있으므로 로그아웃 상태(탭 없음)에서는 이 줄을 숨긴다.
          session ? 'flex' : 'hidden',
        )}
      >
        <div className="hidden min-w-0 flex-col gap-1 md:flex">
          <h1 className="ui-h1">친구</h1>
          {subtitle ? <p className="m-0 text-ink-muted">{subtitle}</p> : null}
        </div>
        {session ? (
          <div
            role="tablist"
            aria-label="친구 보기"
            className="ui-segmented [&>button]:h-[34px] [&>button]:px-3.5 md:[&>button]:h-[38px] md:[&>button]:px-4 md:[&>button]:text-[15px]"
          >
            {TABS.map((key, index) => (
              <button
                key={key}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={tabId(key)}
                aria-selected={tab === key}
                aria-controls={panelId(key)}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => selectTab(key)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tabLabels[key]}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {session ? (
        <div className="mx-auto box-border w-full max-w-[960px] px-3 pt-1 pb-8 md:px-10 md:pt-2 md:pb-16">
          <div role="tabpanel" id={panelId('friends')} aria-labelledby={tabId('friends')} hidden={tab !== 'friends'} className={panelClass('friends')}>
            <FriendList session={session} refreshTrigger={refreshTrigger} onSummaryChange={setSummary} active={tab === 'friends'} />
          </div>
          <div role="tabpanel" id={panelId('requests')} aria-labelledby={tabId('requests')} hidden={tab !== 'requests'} className={panelClass('requests')}>
            <FriendRequestList
              session={session}
              refreshTrigger={refreshTrigger}
              onUpdate={refreshData}
              incomingCount={friendRequestCount}
              onCountChange={setRequestCount}
              active={tab === 'requests'}
            />
          </div>
          <div role="tabpanel" id={panelId('search')} aria-labelledby={tabId('search')} hidden={tab !== 'search'} className={panelClass('search')}>
            <AddFriend session={session} onFriendAdded={refreshData} active={tab === 'search'} />
          </div>
        </div>
      ) : (
        <section
          aria-labelledby={`${baseId}-guest`}
          className="mx-auto box-border flex w-full max-w-[960px] flex-col items-start gap-5 px-4 pt-6 pb-12 md:px-10 md:pt-4 md:pb-16"
        >
          <div className="flex max-w-[480px] flex-col gap-1.5">
            <h2 id={`${baseId}-guest`} className="ui-h2">
              로그인하고 친구와 함께 공부해요
            </h2>
            <p className="m-0 text-ink-muted">
              친구가 지금 공부 중인지, 오늘 얼마나 집중했는지 순위로 볼 수 있어요. 이메일로 친구 요청을 보내고 받을 수 있어요.
            </p>
          </div>
          <button type="button" onClick={onOpenLogin} className="ui-button-primary ui-press min-h-12 rounded-tile px-6">
            로그인
          </button>
        </section>
      )}
    </div>
  );
}
