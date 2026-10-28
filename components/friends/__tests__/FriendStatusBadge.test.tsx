import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FriendStatusBadge } from '../FriendStatusBadge';

describe('FriendStatusBadge', () => {
  afterEach(() => cleanup());

  it.each([
    ['studying', '공부 중', 'bg-pomo'],
    ['paused', '일시정지', 'bg-away'],
    ['online', '접속 중', 'bg-rest'],
    ['offline', '오프라인', 'bg-bead-past'],
    [null, '오프라인', 'bg-bead-past'],
  ] as const)('shows %s as "%s" with its dot color', (status, word, dotClass) => {
    const { container } = render(<FriendStatusBadge status={status} task={null} />);

    expect(screen.getByText(word)).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(dotClass);
  });

  it('shows the current task while studying or paused', () => {
    const { rerender } = render(<FriendStatusBadge status="studying" task="알고리즘 문제 풀기" />);
    expect(screen.getByText('알고리즘 문제 풀기')).toBeVisible();

    // 일시정지한 친구가 하던 작업도 상태 옆에 그대로 보인다.
    rerender(<FriendStatusBadge status="paused" task="토익 LC" />);
    expect(screen.getByText('일시정지')).toBeVisible();
    expect(screen.getByText('토익 LC')).toBeVisible();
    expect(screen.getByText('토익 LC')).toHaveAttribute('title', '토익 LC');
  });

  it('hides a leftover task for online and offline friends', () => {
    const { rerender } = render(<FriendStatusBadge status="online" task="토익 LC" />);
    expect(screen.queryByText('토익 LC')).not.toBeInTheDocument();

    rerender(<FriendStatusBadge status="offline" task="토익 LC" />);
    expect(screen.queryByText('토익 LC')).not.toBeInTheDocument();
  });
});
