import { useState, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeleteStudySubjectResult, StudySubject } from '@/lib/studySubjects';
import { simulateRunningAnimations } from '@/components/ui/__tests__/motionTestUtils';

const db = vi.hoisted(() => ({
  subjects: [] as StudySubject[],
  loading: false,
  clock: 0,
  // 다른 기기에서 바뀌어 이 화면이 아직 모르는 서버의 이름(과목 ID → 이름)
  serverNames: new Map<string, string>(),
  create: vi.fn(), rename: vi.fn(), refresh: vi.fn(), remove: vi.fn(), archive: vi.fn(), restore: vi.fn(),
}));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: (userId: string) => ({
    subjects: db.subjects.filter((subject) => subject.user_id === userId),
    loading: db.loading, error: null, createSubject: db.create, renameSubject: db.rename, refresh: db.refresh, deleteSubject: db.remove,
    archiveSubject: db.archive, restoreSubject: db.restore,
  }),
}));
import SubjectManager from '../SubjectManager';

// 보관 시각은 부를 때마다 1분씩 늦어진다(최근에 보관한 순서를 확인할 수 있게).
const nextArchivedAt = () => new Date(Date.UTC(2026, 10, 9, 9, ++db.clock)).toISOString();
const setArchivedAt = (id: string, archivedAt: string | null) => {
  db.subjects = db.subjects.map((subject) => subject.id === id ? { ...subject, archived_at: archivedAt } : subject);
};

beforeEach(() => {
  db.subjects = [];
  db.loading = false;
  db.clock = 0;
  db.serverNames = new Map();
  db.remove.mockReset();
  db.archive.mockReset(); db.restore.mockReset();
  db.archive.mockImplementation(async (id: string) => { setArchivedAt(id, nextArchivedAt()); return true; });
  // 훅처럼 이름 조건(expectedName)이 있으면 서버의 이름이 그대로일 때만 바꾼다(아니면 0행 → false).
  db.restore.mockImplementation(async (id: string, expectedName?: string) => {
    const serverName = db.serverNames.get(id) ?? db.subjects.find((subject) => subject.id === id)?.name;
    if (expectedName !== undefined && serverName !== expectedName) return false;
    setArchivedAt(id, null);
    return true;
  });
  db.create.mockReset(); db.rename.mockReset();
  db.create.mockImplementation(async (name: string) => {
    const subject = { id: String(db.subjects.length + 1), user_id: 'user-a', name };
    db.subjects = [...db.subjects, subject];
    return subject;
  });
  db.rename.mockImplementation(async (id: string, name: string) => {
    db.subjects = db.subjects.map((subject) => subject.id === id ? { ...subject, name } : subject);
    return true;
  });
});
afterEach(cleanup);

function LegacyManager({ values, onImported = () => undefined }: { values: string[]; onImported?: (names: string[]) => void }) {
  const [legacy, setLegacy] = useState(values);
  return <SubjectManager userId="user-a" legacyTasks={legacy} onLegacyImported={(names) => {
    onImported(names);
    setLegacy((current) => current.filter((name) => !names.includes(name)));
  }} />;
}
function selectLegacy(...indices: number[]) {
  indices.forEach((index) => fireEvent.click(screen.getByRole('checkbox', { name: `이전 항목 ${index} 선택`, hidden: true })));
}

describe('SubjectManager', () => {
  it('creates and renames the canonical subject without replacing its id', async () => {
    render(<SubjectManager userId="user-a" />);
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: ' 블록체인 ' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByText('블록체인');
    expect(db.create).toHaveBeenCalledWith('블록체인');
    fireEvent.click(screen.getByRole('button', { name: '블록체인 이름 변경' }));
    fireEvent.change(screen.getByLabelText('과목 이름 수정'), { target: { value: '분산 시스템' } });
    fireEvent.click(screen.getByRole('button', { name: '과목 이름 저장' }));
    await screen.findByText('분산 시스템');
    expect(db.rename).toHaveBeenCalledWith('1', '분산 시스템');
    expect(db.subjects).toEqual([{ id: '1', user_id: 'user-a', name: '분산 시스템' }]);
  });

  it('imports only selected names and deduplicates trimmed names against existing subjects', async () => {
    db.subjects = [{ id: 'existing', user_id: 'user-a', name: 'SQL' }];
    const imported = vi.fn();
    render(<LegacyManager values={[' 블록체인 ', '블록체인', ' sql ', '남겨둘 메모']} onImported={imported} />);
    expect(db.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (4)'));
    selectLegacy(1, 2, 3);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith([' 블록체인 ', '블록체인', ' sql ']));
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create).toHaveBeenCalledWith('블록체인');
    expect(screen.getByDisplayValue('남겨둘 메모')).toBeInTheDocument();
  });

  it('retains blank and malformed names until a valid draft is explicitly imported', async () => {
    const imported = vi.fn();
    render(<LegacyManager values={['', null] as unknown as string[]} onImported={imported} />);
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (2)'));
    selectLegacy(1);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1~80자');
    expect(db.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('이전 항목 1 과목 이름'), { target: { value: '코딩테스트' } });
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith(['']));
    expect(screen.getByText(/이름을 읽을 수 없는 항목 1개/)).toBeInTheDocument();
  });

  it('removes only successful imports and can retry the remaining names', async () => {
    db.create.mockImplementationOnce(async () => ({ id: 'ok', user_id: 'user-a', name: '성공 과목' }));
    db.create.mockImplementationOnce(async () => null);
    const imported = vi.fn();
    render(<LegacyManager values={['성공 과목', '실패 과목']} onImported={imported} />);
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (2)'));
    selectLegacy(1, 2);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith(['성공 과목']));
    expect(screen.getByRole('alert')).toHaveTextContent('남은 항목은 보관');
    expect(screen.getByDisplayValue('실패 과목')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenLastCalledWith(['실패 과목']));
    expect(db.create.mock.calls.map(([name]) => name)).toEqual(['성공 과목', '실패 과목', '실패 과목']);
  });

  it('does not expose a guest legacy list as subjects or offer import', () => {
    render(<SubjectManager userId={null} legacyTasks={['guest private']} />);
    expect(screen.getByText(/로그인하면 과목/)).toBeInTheDocument();
    expect(screen.queryByText(/가져오기/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('guest private')).not.toBeInTheDocument();
    expect(db.create).not.toHaveBeenCalled();
  });

  it('ignores an old account import completion after switching accounts', async () => {
    let finish!: (subject: StudySubject) => void;
    db.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const imported = vi.fn();
    const { rerender } = render(<SubjectManager userId="user-a" legacyTasks={['A subject']} onLegacyImported={imported} />);
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (1)'));
    selectLegacy(1);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    rerender(<SubjectManager userId="user-b" legacyTasks={['B subject']} onLegacyImported={imported} />);
    await act(async () => finish({ id: 'a', user_id: 'user-a', name: 'A subject' }));
    expect(imported).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('B subject')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('A subject')).not.toBeInTheDocument();
  });

  it('reports add, rename and duplicate results in the status line', async () => {
    render(<SubjectManager userId="user-a" />);
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: '영어' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    // 설정 화면(wide)은 빈 결과 줄(role=status)을 처음부터 그린다. findByRole은 문구가 그려지기 전에 그 빈 줄로 끝나므로 문구까지 기다린다.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('영어 과목을 추가했어요.'));
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: ' 영어 ' } });
    // The board keeps the result line's slot; typing only clears its text.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByRole('alert')).toHaveTextContent('이미 있는 과목이에요.');
    expect(db.create).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '영어 이름 변경' }));
    fireEvent.change(screen.getByLabelText('과목 이름 수정'), { target: { value: '영어 회화' } });
    fireEvent.keyDown(screen.getByLabelText('과목 이름 수정'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('과목 이름을 바꿨어요. 기록은 그대로예요.'));
    expect(db.rename).toHaveBeenCalledWith('1', '영어 회화');
  });

  it('cancels a rename with Escape without letting the key reach the page', () => {
    db.subjects = [{ id: 's1', user_id: 'user-a', name: '통계' }];
    const pageKeyDown = vi.fn();
    render(<div onKeyDown={pageKeyDown}><SubjectManager userId="user-a" /></div>);
    fireEvent.click(screen.getByRole('button', { name: '통계 이름 변경' }));
    fireEvent.keyDown(screen.getByLabelText('과목 이름 수정'), { key: 'Escape' });
    expect(screen.queryByLabelText('과목 이름 수정')).not.toBeInTheDocument();
    expect(pageKeyDown).not.toHaveBeenCalled();
    expect(db.rename).not.toHaveBeenCalled();
  });

  it('lets the settings page own the heading and offer login to guests', () => {
    const onLogin = vi.fn();
    const { rerender } = render(<SubjectManager userId="user-a" showHeading={false} />);
    expect(screen.queryByRole('heading', { name: '과목 관리' })).not.toBeInTheDocument();
    rerender(<SubjectManager userId="user-a" compact />);
    expect(screen.getByRole('heading', { name: '과목 관리' })).toBeInTheDocument();
    rerender(<SubjectManager userId={null} onLogin={onLogin} />);
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('reserves the result line on the settings page but not in the compact panel', () => {
    const { rerender } = render(<SubjectManager userId="user-a" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    rerender(<SubjectManager userId="user-a" compact />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('marks only the subject just added and fades the inline editor and result line in, each once', async () => {
    // 애니메이션이 도는 동안을 흉내 내 클래스가 붙어 있는 동안과 한 번 돈 뒤를 본다(usePlayOnce).
    const animations = simulateRunningAnimations();
    try {
      db.subjects = [{ id: 'existing', user_id: 'user-a', name: 'SQL' }];
      const view = render(<SubjectManager userId="user-a" />);
      fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: '블록체인' } });
      fireEvent.click(screen.getByRole('button', { name: '추가' }));
      const added = (await screen.findByText('블록체인')).closest('li')!;
      const existing = screen.getByText('SQL').closest('li')!;
      expect(added).toHaveClass('animate-fade-up');
      expect(existing).not.toHaveClass('animate-fade-up');
      expect(screen.getByText('블록체인 과목을 추가했어요.')).toHaveClass('animate-fade-in');
      await animations.finish();
      expect(added).not.toHaveClass('animate-fade-up');

      // 다시 읽어 순서가 바뀌어도(서버는 코드 순서) 옮겨진 줄이 다시 떠오르지 않는다.
      db.subjects = [db.subjects[1], db.subjects[0]];
      view.rerender(<SubjectManager userId="user-a" />);
      expect(screen.getAllByRole('listitem').map((item) => item.textContent?.slice(0, 4))).toEqual(['블록체인', 'SQL']);
      expect(screen.getByText('블록체인').closest('li')).toBe(added);
      expect(added).not.toHaveClass('animate-fade-up');

      fireEvent.click(screen.getByRole('button', { name: 'SQL 이름 변경' }));
      const editor = screen.getByLabelText('과목 이름 수정').closest('li')!;
      expect(editor).toHaveClass('animate-fade-in');
      await animations.finish();
      expect(editor).not.toHaveClass('animate-fade-in');
      db.subjects = [db.subjects[1], db.subjects[0]];
      view.rerender(<SubjectManager userId="user-a" />);
      expect(screen.getByLabelText('과목 이름 수정').closest('li')).not.toHaveClass('animate-fade-in');
    } finally {
      animations.restore();
    }
  });
});


const subject = (id: string, name: string, userId = 'user-a', archivedAt: string | null = null): StudySubject => ({ id, user_id: userId, name, archived_at: archivedAt });
// 보관한 과목. minute가 클수록 최근에 보관했다.
const archivedSubject = (id: string, name: string, minute: number, userId = 'user-a') => subject(id, name, userId, new Date(Date.UTC(2026, 10, 1, 9, minute)).toISOString());
const label = (button: HTMLElement) => button.getAttribute('aria-label');
const rowNames = (list: HTMLElement) => within(list).queryAllByRole('listitem').map((item) => item.querySelector('span')?.textContent ?? item.textContent);
// 사용 중 목록은 첫 목록, 보관한 과목 칸의 목록은 이름이 있다.
const activeList = () => screen.getAllByRole('list')[0];
const archivedList = () => screen.getByRole('list', { name: '보관한 과목' });
const archivedSummary = () => screen.queryByText(/^보관한 과목 \(\d+\)$/);
const openArchived = () => {
  const summary = archivedSummary()!;
  const details = summary.closest('details') as HTMLDetailsElement;
  if (!details.open) fireEvent.click(summary);
  if (!details.open) details.open = true;
};
// 실제 브라우저처럼 누른 버튼에 포커스를 둔 채 누른다.
const press = (name: string) => {
  const button = screen.getByRole('button', { name });
  button.focus();
  fireEvent.click(button);
};

describe('SubjectManager 과목 보관', () => {
  const seed = () => { db.subjects = [subject('s1', '통계'), subject('s2', '영어'), subject('s3', '논문')]; };
  const ARCHIVED = (name: string) => `‘${name}’ 과목을 보관했어요. 기록과 통계에는 그대로 남아요.`;
  const RESTORED = (name: string) => `‘${name}’ 과목을 다시 사용해요.`;
  const ARCHIVE_FAILED = '과목을 보관하지 못했어요. 다시 시도해주세요.';
  const RESTORE_FAILED = '과목을 다시 사용하지 못했어요. 다시 시도해주세요.';

  it('puts a rename and an archive button on each row in use and no delete button', () => {
    seed();
    const view = render(<SubjectManager userId="user-a" />);
    const row = screen.getByText('영어').closest('li')!;
    expect(within(row).getAllByRole('button').map(label)).toEqual(['영어 이름 변경', '영어 보관']);
    expect(screen.queryByRole('button', { name: /삭제$/ })).not.toBeInTheDocument();
    expect(archivedSummary()).not.toBeInTheDocument();
    expect(screen.getByText('할 일, 타이머, 공부 기록에서 같은 과목을 사용해요. 이름을 바꾸거나 보관해도 기록은 유지돼요.')).toBeInTheDocument();

    // 이름을 고치는 동안은 다른 줄도 보관하지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '통계 이름 변경' }));
    expect(screen.queryByRole('button', { name: '통계 보관' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영어 보관' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '과목 이름 수정 취소' }));
    expect(screen.getByRole('button', { name: '영어 보관' })).toBeEnabled();

    // 되돌릴 수 있는 동작이라 목록을 다시 불러오는 동안에도 쓸 수 있다.
    db.loading = true;
    view.rerender(<SubjectManager userId="user-a" compact />);
    expect(screen.getByRole('button', { name: '영어 보관' })).toBeEnabled();
    expect(db.archive).not.toHaveBeenCalled();
  });

  it('archives at once without a dialog, moves the row under 보관한 과목 (N) and moves focus to the next row', async () => {
    seed();
    const busy = vi.fn();
    render(<SubjectManager userId="user-a" onBusyChange={busy} />);
    press('영어 보관');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(ARCHIVED('영어')));
    expect(db.archive).toHaveBeenCalledTimes(1);
    expect(db.archive).toHaveBeenCalledWith('s2');
    expect(rowNames(activeList())).toEqual(['통계', '논문']);
    expect(screen.getByRole('button', { name: '논문 보관' })).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(busy.mock.calls).toEqual([[true], [false]]);

    expect(archivedSummary()).toHaveTextContent('보관한 과목 (1)');
    expect(archivedSummary()!.closest('details')).not.toHaveAttribute('open');
    openArchived();
    expect(screen.getByText('보관한 과목은 과목 선택 칸에 나오지 않아요. 공부 기록과 통계에는 이름이 그대로 남아요.')).toBeInTheDocument();
    expect(rowNames(archivedList())).toEqual(['영어']);
    const archivedRow = within(archivedList()).getByRole('listitem');
    expect(within(archivedRow).getAllByRole('button').map(label)).toEqual(['영어 다시 사용', '영어 삭제']);
    // 사용 중 줄과 같은 줄 크기, 이름은 한 단계 흐리다.
    expect(archivedRow.className).toBe(screen.getByText('통계').closest('li')!.className);
    expect(within(archivedRow).getByText('영어')).toHaveClass('truncate', 'text-ink-muted');
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('moves focus to the previous row after archiving the last one, and to the list when none are in use', async () => {
    db.subjects = [subject('s1', '통계'), subject('s2', '영어')];
    render(<SubjectManager userId="user-a" compact />);
    press('영어 보관');
    expect(await screen.findByText(ARCHIVED('영어'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '통계 보관' })).toHaveFocus();

    press('통계 보관');
    expect(await screen.findByText(ARCHIVED('통계'))).toBeInTheDocument();
    expect(screen.getByText('사용 중인 과목이 없어요. 새 과목을 추가하거나 보관한 과목을 다시 사용해보세요.')).toBeInTheDocument();
    expect(activeList()).toHaveFocus();
    expect(document.activeElement).not.toBe(screen.getByLabelText('새 과목 이름'));
    // 최근에 보관한 순
    expect(archivedSummary()).toHaveTextContent('보관한 과목 (2)');
    openArchived();
    expect(rowNames(archivedList())).toEqual(['통계', '영어']);
  });

  it('orders 보관한 과목 by most recently archived, then by name', () => {
    db.subjects = [archivedSubject('a', '다', 1), archivedSubject('b', '가', 3), archivedSubject('c', '나', 1), subject('d', '라')];
    render(<SubjectManager userId="user-a" />);
    openArchived();
    expect(rowNames(archivedList())).toEqual(['가', '나', '다']);
    expect(rowNames(activeList())).toEqual(['라']);
  });

  it('restores at once back to the list in use, reports it and focuses the returned row once animated', async () => {
    const animations = simulateRunningAnimations();
    try {
      db.subjects = [subject('s1', '통계'), archivedSubject('s2', '영어', 1)];
      const busy = vi.fn();
      render(<SubjectManager userId="user-a" onBusyChange={busy} />);
      openArchived();
      press('영어 다시 사용');
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(RESTORED('영어')));
      // 다시 사용 버튼은 ID만 보낸다(이름 조건 없음).
      expect(db.restore.mock.calls).toEqual([['s2']]);
      expect(rowNames(activeList())).toEqual(['통계', '영어']);
      expect(archivedSummary()).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '영어 보관' })).toHaveFocus();
      const returned = screen.getByText('영어').closest('li')!;
      expect(returned).toHaveClass('animate-fade-up');
      await animations.finish();
      expect(returned).not.toHaveClass('animate-fade-up');
      expect(busy.mock.calls).toEqual([[true], [false]]);
    } finally {
      animations.restore();
    }
  });

  it.each([
    ['a failed result', () => db.archive.mockResolvedValue(false)],
    ['a thrown error', () => db.archive.mockRejectedValue(new Error('offline'))],
  ])('shows an archive failure once on %s and keeps the row and focus', async (_label, arrange) => {
    seed();
    arrange();
    render(<SubjectManager userId="user-a" compact />);
    press('영어 보관');
    expect((await screen.findByRole('alert')).textContent).toBe(ARCHIVE_FAILED);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(rowNames(activeList())).toEqual(['통계', '영어', '논문']);
    expect(archivedSummary()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영어 보관' })).toHaveFocus();
  });

  it.each([
    ['a failed result', () => db.restore.mockResolvedValue(false)],
    ['a thrown error', () => db.restore.mockRejectedValue(new Error('offline'))],
  ])('shows a restore failure once on %s and keeps the row and focus', async (_label, arrange) => {
    db.subjects = [subject('s1', '통계'), archivedSubject('s2', '영어', 1)];
    arrange();
    render(<SubjectManager userId="user-a" />);
    openArchived();
    press('영어 다시 사용');
    expect((await screen.findByRole('alert')).textContent).toBe(RESTORE_FAILED);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(rowNames(archivedList())).toEqual(['영어']);
    expect(screen.getByRole('button', { name: '영어 다시 사용' })).toHaveFocus();
  });

  it('sends one request and locks every row control until an archive settles', async () => {
    db.subjects = [subject('s1', '통계'), subject('s2', '영어'), archivedSubject('s3', '논문', 1)];
    let respond!: (archived: boolean) => void;
    db.archive.mockImplementation(() => new Promise((done) => { respond = done; }));
    const busy = vi.fn();
    render(<SubjectManager userId="user-a" onBusyChange={busy} />);
    openArchived();
    press('영어 보관');
    fireEvent.click(screen.getByRole('button', { name: '영어 보관' }));
    expect(db.archive).toHaveBeenCalledTimes(1);
    for (const name of ['통계 이름 변경', '통계 보관', '영어 이름 변경', '영어 보관', '논문 다시 사용', '논문 삭제']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByLabelText('새 과목 이름')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '논문 다시 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '통계 보관' }));
    expect(db.restore).not.toHaveBeenCalled();
    expect(db.archive).toHaveBeenCalledTimes(1);
    expect(busy.mock.calls).toEqual([[true]]);

    await act(async () => {
      setArchivedAt('s2', nextArchivedAt());
      respond(true);
    });
    expect(busy.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole('button', { name: '통계 보관' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '논문 다시 사용' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '영어 다시 사용' })).toBeEnabled();
  });

  it('leaves focus where the user moved it while the archive was pending', async () => {
    seed();
    let respond!: (archived: boolean) => void;
    db.archive.mockImplementation(() => new Promise((done) => { respond = done; }));
    render(<><button type="button">다른 곳</button><SubjectManager userId="user-a" /></>);
    press('영어 보관');
    screen.getByRole('button', { name: '다른 곳' }).focus();
    await act(async () => {
      setArchivedAt('s2', nextArchivedAt());
      respond(true);
    });
    expect(screen.getByRole('status')).toHaveTextContent(ARCHIVED('영어'));
    expect(screen.getByRole('button', { name: '다른 곳' })).toHaveFocus();
  });

  it('ignores an archive that finishes after switching accounts', async () => {
    seed();
    db.subjects.push(subject('b1', '물리', 'user-b'));
    let respond!: (archived: boolean) => void;
    db.archive.mockImplementation(() => new Promise((done) => { respond = done; }));
    const busy = vi.fn();
    const { rerender } = render(<SubjectManager userId="user-a" onBusyChange={busy} />);
    press('영어 보관');
    rerender(<SubjectManager userId="user-b" onBusyChange={busy} />);
    expect(busy.mock.calls).toEqual([[true], [false]]);
    await act(async () => respond(true));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '물리 보관' })).toBeEnabled();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });

  it('restores an archived subject instead of creating one when its name is added again', async () => {
    db.subjects = [subject('s1', '통계'), archivedSubject('s2', 'Toeic', 1)];
    render(<SubjectManager userId="user-a" />);
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: ' toeic ' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('보관한 ‘Toeic’ 과목을 다시 사용해요. 이전 기록과 이어져요.'));
    // 이름으로 고른 다시 사용이라 저장된 이름을 함께 보낸다.
    expect(db.restore.mock.calls).toEqual([['s2', 'Toeic']]);
    expect(db.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText('새 과목 이름')).toHaveValue('');
    expect(rowNames(activeList())).toEqual(['통계', 'Toeic']);
    expect(archivedSummary()).not.toBeInTheDocument();
  });

  it('keeps the typed name and creates nothing when restoring by name fails', async () => {
    db.subjects = [archivedSubject('s2', '영어', 1)];
    db.restore.mockResolvedValue(false);
    render(<SubjectManager userId="user-a" />);
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: '영어' } });
    fireEvent.keyDown(screen.getByLabelText('새 과목 이름'), { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe('과목을 저장하지 못했어요. 다시 시도해주세요.');
    expect(db.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText('새 과목 이름')).toHaveValue('영어');
    expect(archivedSummary()).toHaveTextContent('보관한 과목 (1)');
  });

  it('does not restore by name an archived subject that was renamed elsewhere', async () => {
    db.subjects = [subject('s1', '통계'), archivedSubject('s2', 'Toeic', 1)];
    // 다른 기기에서 보관한 과목의 이름을 바꿨고 이 화면은 아직 다시 읽지 않았다.
    db.serverNames.set('s2', 'TOEIC 900');
    render(<SubjectManager userId="user-a" />);
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: ' toeic ' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect((await screen.findByRole('alert')).textContent).toBe('과목을 저장하지 못했어요. 다시 시도해주세요.');
    expect(db.restore.mock.calls).toEqual([['s2', 'Toeic']]);
    expect(db.create).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByLabelText('새 과목 이름')).toHaveValue(' toeic ');
    expect(rowNames(activeList())).toEqual(['통계']);
    expect(archivedSummary()).toHaveTextContent('보관한 과목 (1)');
  });

  it('blocks renaming to the name of an archived subject without sending a request', () => {
    db.subjects = [subject('s1', '통계'), subject('s2', '영어'), archivedSubject('s3', '논문', 1)];
    render(<SubjectManager userId="user-a" />);
    fireEvent.click(screen.getByRole('button', { name: '통계 이름 변경' }));
    fireEvent.change(screen.getByLabelText('과목 이름 수정'), { target: { value: ' 논문 ' } });
    fireEvent.keyDown(screen.getByLabelText('과목 이름 수정'), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('보관한 과목에 같은 이름이 있어요.');
    fireEvent.change(screen.getByLabelText('과목 이름 수정'), { target: { value: '영어' } });
    fireEvent.click(screen.getByRole('button', { name: '과목 이름 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('이미 있는 과목이에요.');
    expect(db.rename).not.toHaveBeenCalled();
    expect(db.restore).not.toHaveBeenCalled();
    expect(screen.getByLabelText('과목 이름 수정')).toBeInTheDocument();
  });

  it('links an imported name to an archived subject by restoring it', async () => {
    db.subjects = [archivedSubject('x', 'SQL', 1), subject('y', '통계')];
    const imported = vi.fn();
    render(<LegacyManager values={[' sql ', '통계', '새 과목']} onImported={imported} />);
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (3)'));
    expect(screen.getAllByText('보관한 과목을 다시 사용해요.')).toHaveLength(1);
    expect(screen.getAllByText('이미 있는 과목으로 연결돼요.')).toHaveLength(1);
    selectLegacy(1, 2, 3);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith([' sql ', '통계', '새 과목']));
    expect(db.restore.mock.calls).toEqual([['x', 'SQL']]);
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create).toHaveBeenCalledWith('새 과목');
    expect(screen.getByRole('status')).toHaveTextContent('3개 항목을 과목으로 가져왔어요.');
    expect(rowNames(activeList())).toEqual(['SQL', '통계', '새 과목']);
  });

  it('keeps an imported name whose archived subject could not be restored', async () => {
    db.subjects = [archivedSubject('x', 'SQL', 1)];
    db.restore.mockResolvedValue(false);
    const imported = vi.fn();
    render(<LegacyManager values={[' sql ', '새 과목']} onImported={imported} />);
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (2)'));
    selectLegacy(1, 2);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith(['새 과목']));
    expect(screen.getByRole('alert')).toHaveTextContent('남은 항목은 보관');
    expect(screen.getByLabelText('이전 항목 1 과목 이름')).toHaveValue(' sql ');
    expect(screen.queryByLabelText('이전 항목 2 과목 이름')).not.toBeInTheDocument();
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it('keeps an imported name whose archived subject was renamed elsewhere instead of restoring it', async () => {
    db.subjects = [archivedSubject('x', 'SQL', 1)];
    // 다른 기기에서 보관한 SQL의 이름을 바꿨고 이 화면은 아직 다시 읽지 않았다.
    db.serverNames.set('x', 'NoSQL');
    const imported = vi.fn();
    render(<LegacyManager values={[' sql ', '새 과목']} onImported={imported} />);
    fireEvent.click(screen.getByText('이전 작업 목록 가져오기 (2)'));
    selectLegacy(1, 2);
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 가져오기' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith(['새 과목']));
    expect(db.restore.mock.calls).toEqual([['x', 'SQL']]);
    expect(db.create.mock.calls).toEqual([['새 과목']]);
    expect(screen.getByRole('alert')).toHaveTextContent('일부 항목을 가져오지 못했어요. 남은 항목은 보관되며 다시 시도할 수 있어요.');
    expect(screen.getByLabelText('이전 항목 1 과목 이름')).toHaveValue(' sql ');
    expect(archivedSummary()).toHaveTextContent('보관한 과목 (1)');
  });
});

describe('SubjectManager 과목 삭제 (보관한 과목 칸)', () => {
  // 사용 중 과목은 컴퓨터과학 하나, 보관한 과목 칸은 최근에 보관한 순으로 통계, 영어, 논문.
  const seed = () => {
    db.subjects = [subject('c1', '컴퓨터과학'), archivedSubject('s1', '통계', 3), archivedSubject('s2', '영어', 2), archivedSubject('s3', '논문', 1)];
  };
  const succeed = () => db.remove.mockImplementation(async (id: string) => {
    db.subjects = db.subjects.filter((item) => item.id !== id);
    return { status: 'deleted' };
  });
  const renderOpen = (ui: ReactElement) => {
    const view = render(ui);
    openArchived();
    return view;
  };
  // 실제 브라우저처럼 누른 버튼에 포커스를 둔 채 확인 창을 연다(닫히면 그 버튼으로 포커스가 돌아간다).
  const openDelete = (name: string) => {
    press(`${name} 삭제`);
    return screen.getByRole('alertdialog', { name: '과목을 삭제할까요?' });
  };
  const confirmDelete = (name: string) => {
    fireEvent.click(within(openDelete(name)).getByRole('button', { name: '삭제' }));
  };
  const DELETED = (name: string) => `‘${name}’ 과목을 삭제했어요. 공부 기록은 미분류로 남아요.`;
  const FAILED = '과목을 삭제하지 못했어요. 다시 시도해주세요.';

  it('puts an accessible delete button after each restore button, disabled while editing or loading', () => {
    seed();
    const view = renderOpen(<SubjectManager userId="user-a" />);
    const row = screen.getByText('영어').closest('li')!;
    expect(within(row).getAllByRole('button').map(label)).toEqual(['영어 다시 사용', '영어 삭제']);
    expect(within(screen.getByText('컴퓨터과학').closest('li')!).getAllByRole('button').map(label)).toEqual(['컴퓨터과학 이름 변경', '컴퓨터과학 보관']);
    for (const name of ['통계', '영어', '논문']) expect(screen.getByRole('button', { name: `${name} 삭제` })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '컴퓨터과학 이름 변경' }));
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '영어 다시 사용' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '영어 삭제' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '과목 이름 수정 취소' }));
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeEnabled();

    // 다시 불러오는 동안 삭제는 막고(지금 규칙), 되돌릴 수 있는 다시 사용은 둔다.
    db.loading = true;
    view.rerender(<SubjectManager userId="user-a" />);
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '영어 다시 사용' })).toBeEnabled();

    db.loading = false;
    view.rerender(<SubjectManager userId="user-a" compact />);
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeEnabled();
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('asks in a danger dialog that starts on cancel, and cancel or Escape sends nothing', () => {
    seed();
    renderOpen(<SubjectManager userId="user-a" />);
    const dialog = openDelete('영어');
    expect(dialog).toHaveAccessibleDescription('‘영어’ 과목을 삭제하면 되돌릴 수 없어요. 이 과목으로 공부한 시간은 그대로 남고, 이 과목이 지정된 공부 기록과 할 일·목표·장기 과제는 미분류로 바뀌어요.');
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: '삭제' })).toHaveClass('bg-pomo-deep');

    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영어 삭제' })).toHaveFocus();

    const again = openDelete('영어');
    fireEvent.keyDown(within(again).getByRole('button', { name: '취소' }), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영어 삭제' })).toHaveFocus();
    expect(db.remove).not.toHaveBeenCalled();
    expect(screen.getByText('영어')).toBeInTheDocument();
  });

  it('deletes after confirming, reports it and moves focus to the next archived row instead of the page', async () => {
    seed();
    succeed();
    const busy = vi.fn();
    renderOpen(<SubjectManager userId="user-a" onBusyChange={busy} />);
    confirmDelete('영어');
    // 설정 화면(wide)은 빈 결과 줄(role=status)을 처음부터 그린다. findByRole은 문구가 그려지기 전에 그 빈 줄로 끝나므로 문구까지 기다린다.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(DELETED('영어')));
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(db.remove).toHaveBeenCalledWith('s2');
    expect(screen.queryByText('영어')).not.toBeInTheDocument();
    expect(rowNames(archivedList())).toEqual(['통계', '논문']);
    expect(archivedSummary()).toHaveTextContent('보관한 과목 (2)');
    expect(rowNames(activeList())).toEqual(['컴퓨터과학']);
    // 삭제 버튼은 곧바로 시작되는 다시 불러오기 동안 비활성이라 이웃 줄의 다시 사용 버튼으로 옮긴다.
    expect(screen.getByRole('button', { name: '논문 다시 사용' })).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });

  it('moves focus to the previous row after deleting the last archived row, and to the list in use once the section is gone', async () => {
    db.subjects = [archivedSubject('s1', '통계', 2), archivedSubject('s2', '영어', 1)];
    succeed();
    renderOpen(<SubjectManager userId="user-a" compact />);
    confirmDelete('영어');
    expect(await screen.findByText(DELETED('영어'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '통계 다시 사용' })).toHaveFocus();

    confirmDelete('통계');
    expect(await screen.findByText(DELETED('통계'))).toBeInTheDocument();
    expect(archivedSummary()).not.toBeInTheDocument();
    expect(screen.getByText('아직 과목이 없어요. 자주 공부하는 과목을 추가해보세요.')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveFocus();
    expect(document.activeElement).not.toBe(screen.getByLabelText('새 과목 이름'));
  });

  it('moves focus to the section summary when the neighbor row is gone too', async () => {
    seed();
    // 다른 기기에서 논문도 지워 다시 읽은 목록에 이웃 줄이 없다.
    db.remove.mockImplementation(async (id: string) => {
      db.subjects = db.subjects.filter((item) => item.id !== id && item.id !== 's3');
      return { status: 'deleted' };
    });
    renderOpen(<SubjectManager userId="user-a" />);
    confirmDelete('영어');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(DELETED('영어')));
    expect(archivedSummary()).toHaveTextContent('보관한 과목 (1)');
    expect(archivedSummary()).toHaveFocus();
  });

  it.each([
    [['중간고사'], '‘중간고사’ 장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. 계획 화면에서 과목 항목을 먼저 삭제해주세요.'],
    [['중간고사', '기말고사'], '‘중간고사’, ‘기말고사’ 장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. 계획 화면에서 과목 항목을 먼저 삭제해주세요.'],
    [['중간고사', '기말고사', '자격증'], '‘중간고사’, ‘기말고사’ 외 1개 장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. 계획 화면에서 과목 항목을 먼저 삭제해주세요.'],
    [['중간고사', '기말고사', '자격증', '토익'], '‘중간고사’, ‘기말고사’ 외 2개 장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. 계획 화면에서 과목 항목을 먼저 삭제해주세요.'],
    [['', '  '], '장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. 계획 화면에서 과목 항목을 먼저 삭제해주세요.'],
    [[], '장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. 계획 화면에서 과목 항목을 먼저 삭제해주세요.'],
  ])('explains a subject group refusal for %j and keeps the row', async (projects, text) => {
    seed();
    db.remove.mockResolvedValue({ status: 'in_use_by_subject_group', projects });
    renderOpen(<SubjectManager userId="user-a" />);
    confirmDelete('영어');
    expect((await screen.findByRole('alert')).textContent).toBe(text);
    expect(screen.getByText('영어')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: '영어 삭제' })).toHaveFocus();
  });

  it.each([
    ['a failed result', () => db.remove.mockResolvedValue({ status: 'failed' })],
    ['a thrown error', () => db.remove.mockRejectedValue(new Error('offline'))],
  ])('shows the failure once on %s and keeps the subject', async (_label, arrange) => {
    seed();
    arrange();
    renderOpen(<SubjectManager userId="user-a" compact />);
    confirmDelete('영어');
    expect((await screen.findByRole('alert')).textContent).toBe(FAILED);
    expect(screen.getAllByText(FAILED)).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('영어')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영어 삭제' })).toHaveFocus();
    // 다음 동작에서 지난 실패 문구를 지운다.
    db.remove.mockReset();
    succeed();
    confirmDelete('영어');
    expect(await screen.findByText(DELETED('영어'))).toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it('sends one request and locks every row control until the deletion settles', async () => {
    seed();
    let respond!: (result: DeleteStudySubjectResult) => void;
    db.remove.mockImplementation(() => new Promise((done) => { respond = done; }));
    const busy = vi.fn();
    renderOpen(<SubjectManager userId="user-a" onBusyChange={busy} />);
    const confirm = within(openDelete('영어')).getByRole('button', { name: '삭제' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    for (const name of ['통계', '영어', '논문']) {
      expect(screen.getByRole('button', { name: `${name} 삭제` })).toBeDisabled();
      expect(screen.getByRole('button', { name: `${name} 다시 사용` })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: '컴퓨터과학 이름 변경' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '컴퓨터과학 보관' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '통계 삭제' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(busy.mock.calls).toEqual([[true]]);

    await act(async () => {
      db.subjects = db.subjects.filter((item) => item.id !== 's2');
      respond({ status: 'deleted' });
    });
    expect(busy.mock.calls).toEqual([[true], [false]]);
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '통계 삭제' })).toBeEnabled();
  });

  // 확인 창이 열린 사이 다른 화면의 변경으로 목록을 다시 불러오기 시작해도, 목록이 보이면 확인을 무시하지 않는다(서버가 기준).
  it('deletes on confirm while the visible list is reloading in the background', async () => {
    seed();
    succeed();
    const view = renderOpen(<SubjectManager userId="user-a" />);
    const dialog = openDelete('영어');
    db.loading = true;
    view.rerender(<SubjectManager userId="user-a" />);
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText(DELETED('영어'))).toBeInTheDocument();
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(db.remove).toHaveBeenCalledWith('s2');
  });

  it('still blocks a confirm while no list has loaded yet', () => {
    seed();
    succeed();
    const view = renderOpen(<SubjectManager userId="user-a" />);
    const dialog = openDelete('영어');
    db.subjects = [];
    db.loading = true;
    view.rerender(<SubjectManager userId="user-a" />);
    expect(screen.getByText('과목을 불러오는 중…')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('ignores a deletion that finishes after switching accounts', async () => {
    seed();
    db.subjects.push(archivedSubject('b1', '물리', 5, 'user-b'));
    let respond!: (result: DeleteStudySubjectResult) => void;
    db.remove.mockImplementation(() => new Promise((done) => { respond = done; }));
    const busy = vi.fn();
    const { rerender } = renderOpen(<SubjectManager userId="user-a" onBusyChange={busy} />);
    confirmDelete('영어');
    rerender(<SubjectManager userId="user-b" onBusyChange={busy} />);
    // 계정이 바뀌면 바쁨을 바로 풀어 준다(설정의 나머지가 잠긴 채 남지 않게).
    expect(busy.mock.calls).toEqual([[true], [false]]);
    await act(async () => respond({ status: 'deleted' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    openArchived();
    expect(screen.getByRole('button', { name: '물리 삭제' })).toBeEnabled();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
});
