import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ConfirmModal from '@/components/ConfirmModal';

afterEach(cleanup);

// 한국어 낱말과 '할 일·목표·장기 과제' 같은 묶음이 좁은 폭에서 글자 중간에 끊기지 않는다.
describe('ConfirmModal message', () => {
  it.each([
    ['a string', '이 과목이 지정된 공부 기록과 할 일·목표·장기 과제는 미분류로 바뀌어요.'],
    ['a node', <span key="node">이 과목이 지정된 할 일·목표·장기 과제는 미분류로 바뀌어요.</span>],
  ])('keeps words whole when the message is %s', (_label, message) => {
    render(<ConfirmModal isOpen onClose={() => undefined} onConfirm={() => undefined} title="과목을 삭제할까요?" message={message} />);
    const dialog = screen.getByRole('alertdialog', { name: '과목을 삭제할까요?' });
    const body = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(body).not.toBeNull();
    expect(body).toHaveClass('break-keep');
  });
});
