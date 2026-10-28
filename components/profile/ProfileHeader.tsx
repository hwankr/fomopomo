import type { ReactNode } from 'react';
import Link from 'next/link';
import { SlidersVertical } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import Avatar, { getDisplayName } from '@/components/ui/Avatar';
import { formatStudyDuration, formatTotalHours } from '@/components/profile/studyDuration';
import { cn } from '@/lib/utils';

interface ProfileHeaderProps {
  user: User;
  totalFocusTime: number;
  todayFocusTime: number;
  /** 첫 집계가 오기 전에는 0 대신 자리 표시를 보여 준다. */
  loading?: boolean;
  /** 데스크톱 로그아웃 버튼. 모바일 로그아웃은 페이지 맨 아래에 있다. */
  onLogout: () => void;
}

export default function ProfileHeader({ user, totalFocusTime, todayFocusTime, loading = false, onLogout }: ProfileHeaderProps) {
  const name = getDisplayName(user) ?? '이름 없음';
  const pending = loading && totalFocusTime === 0;

  return (
    <section aria-label="내 정보" className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-8">
      <div className="flex min-w-0 items-center gap-4 md:gap-5">
        <Avatar name={name} size={64} />
        <div className="flex min-w-0 flex-col gap-px md:gap-0.5">
          <h1 className="ui-h1 [overflow-wrap:anywhere]">{name}</h1>
          {user.email ? <p className="m-0 text-sm text-ink-muted [overflow-wrap:anywhere] md:text-[15px]">{user.email}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 md:gap-10">
        <dl className="m-0 flex flex-wrap gap-x-7 gap-y-3 md:gap-x-10">
          <Stat label="누적 집중 시간" value={pending ? '–' : formatTotalHours(totalFocusTime)} />
          <Stat
            label={<>오늘<span className="hidden md:inline"> 집중 시간</span>, 오전 5시부터</>}
            value={pending ? '–' : formatStudyDuration(todayFocusTime)}
            accent
          />
        </dl>
        <div className="hidden items-center gap-1 md:flex">
          <Link href="/settings" className="ui-button-secondary rounded-tile px-4">
            <SlidersVertical size={18} strokeWidth={1.8} aria-hidden="true" />
            설정
          </Link>
          <button type="button" onClick={onLogout} className="ui-button-ghost rounded-tile px-3.5 text-ink-muted">
            로그아웃
          </button>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: ReactNode; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-px md:gap-0.5">
      <dt className="text-xs text-ink-muted md:text-[13px]">{label}</dt>
      <dd className={cn('m-0 font-display text-[30px] leading-[1.1] font-bold tracking-[-0.02em] whitespace-nowrap md:text-4xl', accent && 'text-pomo')}>
        {value}
      </dd>
    </div>
  );
}
