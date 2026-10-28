import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

type Row = { id: number; user_id: string; duration: number; created_at: string; task: string; subject_id: string | null };

// 실제 useStudyStats · StudyReport · ProfileHeader를 쓰고, Supabase만 메모리 표로 바꾼다.
const db = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: vi.fn(), signInWithOAuth: vi.fn() },
  from: () => {
    const filters: ((row: Row) => boolean)[] = [];
    let range: [number, number] = [0, Infinity];
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: keyof Row, value: unknown) => { filters.push(row => row[column] === value); return builder; },
      gte: (_: string, iso: string) => { filters.push(row => Date.parse(row.created_at) >= Date.parse(iso)); return builder; },
      lte: (_: string, iso: string) => { filters.push(row => Date.parse(row.created_at) <= Date.parse(iso)); return builder; },
      range: (from: number, to: number) => { range = [from, to]; return builder; },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const data = db.rows
          .filter(row => filters.every(filter => filter(row)))
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)
          .slice(range[0], range[1] + 1);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
} }));
vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({
  session: { user: { id: 'user-a', email: 'minji@example.com', user_metadata: { full_name: '민지' } } } as unknown as Session,
  loading: false,
}) }));
vi.mock('@/hooks/useStudySubjects', () => ({ useStudySubjects: () => ({ subjects: [], loading: false, error: null, createSubject: vi.fn() }) }));
vi.mock('@/lib/pushSubscriptionLifecycle', () => ({ signOutWithPushCleanup: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/Navbar', () => ({ default: ({ mobileTopBar }: { mobileTopBar?: ReactNode }) => <header>{mobileTopBar}</header> }));
vi.mock('@/components/LoginModal', () => ({ default: () => null }));
vi.mock('@/components/subjects/SubjectHistoryManager', () => ({ default: () => null }));

import ProfilePage from '@/app/profile/page';
import { __clearInflightLifetimeScansForTests } from '@/hooks/useStudyStats';

let nextId = 1;
const session = (createdAt: Date, minutes: number, task = '알고리즘 문제 풀기'): Row => ({
  id: nextId++, user_id: 'user-a', duration: minutes * 60, created_at: createdAt.toISOString(), task, subject_id: null,
});
const todayLabel = () => screen.getByText(/오전 5시부터/).nextElementSibling;

describe('프로필 머리와 상세 리포트의 오늘 집중 시간', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    nextId = 1;
    db.rows = [
      session(new Date(2026, 9, 28, 10), 25),
      session(new Date(2026, 9, 28, 10, 30), 25),
      // 오전 5시 전은 전날(10월 27일) 공부일이다.
      session(new Date(2026, 9, 28, 4, 30), 25, '새벽 복습'),
      session(new Date(2026, 9, 27, 20), 25),
    ];
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    __clearInflightLifetimeScansForTests();
  });

  it('새 기록이 생긴 뒤 기간을 넘기면 머리의 오늘 합계와 오늘 막대가 같은 값으로 바뀐다', async () => {
    render(<ProfilePage />);
    await screen.findByRole('button', { name: '10월 28일 수요일, 50분' });
    expect(screen.getByRole('button', { name: '10월 27일 화요일, 50분' })).toBeInTheDocument();
    expect(todayLabel()).toHaveTextContent('50분');

    // 페이지가 열린 동안 다른 곳(타이머)에서 오늘 기록이 하나 더 저장된다.
    db.rows.push(session(new Date(2026, 9, 28, 11, 30), 1));

    fireEvent.click(screen.getByRole('button', { name: '이전 주' }));
    await screen.findByRole('button', { name: '10월 19일 월요일, 기록 없음' });
    fireEvent.click(screen.getByRole('button', { name: '다음 주' }));

    await screen.findByRole('button', { name: '10월 28일 수요일, 51분' });
    await waitFor(() => expect(todayLabel()).toHaveTextContent('51분'));
  });
});
