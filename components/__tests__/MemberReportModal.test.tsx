import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 친구·그룹 멤버의 리포트 창은 닫기(X) 말고 빠져나갈 동작이 없어 덮개를 눌러도 닫힌다.
const { supabaseMock } = vi.hoisted(() => {
  const sessions = [
    { duration: 3000, task: '알고리즘 문제 풀기' },
    { duration: 1200, task: '영어 단어 100개' },
  ];
  const chain: Record<string, unknown> = {};
  ['select', 'eq', 'gte'].forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  chain.lte = vi.fn(() => Promise.resolve({ data: sessions, error: null }));
  return { supabaseMock: { from: vi.fn(() => chain) } };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

import MemberReportModal from '../MemberReportModal';

// 실제 누름 순서: pointerdown → mousedown → pointerup → mouseup → click(누른 요소와 놓은 요소의 공통 조상).
function press(start: HTMLElement, end: HTMLElement = start, pointerType = 'mouse') {
  fireEvent.pointerDown(start, { pointerType });
  fireEvent.mouseDown(start);
  fireEvent.pointerUp(end, { pointerType });
  fireEvent.mouseUp(end);
  let common: HTMLElement = start;
  while (!common.contains(end)) common = common.parentElement!;
  fireEvent.click(common);
}

function ReportHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>김서연 리포트 보기</button>
      <MemberReportModal
        isOpen={open}
        onClose={() => { onClose(); setOpen(false); }}
        userId="friend-1"
        userName="김서연"
      />
    </>
  );
}

async function openReport(onClose = vi.fn()) {
  render(<ReportHarness onClose={onClose} />);
  const opener = screen.getByRole('button', { name: '김서연 리포트 보기' });
  act(() => opener.focus());
  fireEvent.click(opener);
  await screen.findByText('오늘 집중 시간');
  const dialog = screen.getByRole('dialog', { name: '김서연님의 리포트' });
  return { opener, dialog, onClose };
}

describe('MemberReportModal overlay', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('closes from a press on the overlay and returns focus to the opener', async () => {
    const { opener, dialog, onClose } = await openReport();

    press(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes from a touch tap on the overlay', async () => {
    const { dialog, onClose } = await openReport();

    press(dialog.parentElement!, dialog.parentElement!, 'touch');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays open on presses inside the panel, including a selection dragged out onto the overlay', async () => {
    const { dialog, onClose } = await openReport();
    const title = screen.getByRole('heading', { name: '김서연님의 리포트' });
    const total = screen.getByText('오늘 집중 시간').previousElementSibling as HTMLElement;

    press(title);
    press(total);
    press(dialog);
    press(screen.getByText('알고리즘 문제 풀기'));
    press(total, dialog.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '김서연님의 리포트' })).toBeInTheDocument();
  });
});
