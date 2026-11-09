import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeleteStudySubjectResult, StudySubject } from '@/lib/studySubjects';
import { simulateRunningAnimations } from '@/components/ui/__tests__/motionTestUtils';

const db = vi.hoisted(() => ({
  subjects: [] as StudySubject[],
  loading: false,
  create: vi.fn(), rename: vi.fn(), refresh: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: (userId: string) => ({
    subjects: db.subjects.filter((subject) => subject.user_id === userId),
    loading: db.loading, error: null, createSubject: db.create, renameSubject: db.rename, refresh: db.refresh, deleteSubject: db.remove,
  }),
}));
import SubjectManager from '../SubjectManager';

beforeEach(() => {
  db.subjects = [];
  db.loading = false;
  db.remove.mockReset();
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

describe('SubjectManager 과목 삭제', () => {
  const subject = (id: string, name: string, userId = 'user-a') => ({ id, user_id: userId, name });
  const seed = () => { db.subjects = [subject('s1', '통계'), subject('s2', '영어'), subject('s3', '논문')]; };
  const succeed = () => db.remove.mockImplementation(async (id: string) => {
    db.subjects = db.subjects.filter((item) => item.id !== id);
    return { status: 'deleted' };
  });
  // 실제 브라우저처럼 누른 버튼에 포커스를 둔 채 확인 창을 연다(닫히면 그 버튼으로 포커스가 돌아간다).
  const openDelete = (name: string) => {
    const trigger = screen.getByRole('button', { name: `${name} 삭제` });
    trigger.focus();
    fireEvent.click(trigger);
    return screen.getByRole('alertdialog', { name: '과목을 삭제할까요?' });
  };
  const confirmDelete = (name: string) => {
    fireEvent.click(within(openDelete(name)).getByRole('button', { name: '삭제' }));
  };
  const DELETED = (name: string) => `‘${name}’ 과목을 삭제했어요. 공부 기록은 미분류로 남아요.`;
  const FAILED = '과목을 삭제하지 못했어요. 다시 시도해주세요.';

  it('puts an accessible delete button after each rename button, disabled while editing or loading', () => {
    seed();
    const view = render(<SubjectManager userId="user-a" />);
    const row = screen.getByText('영어').closest('li')!;
    expect(within(row).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['영어 이름 변경', '영어 삭제']);
    for (const name of ['통계', '영어', '논문']) expect(screen.getByRole('button', { name: `${name} 삭제` })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '통계 이름 변경' }));
    expect(screen.queryByRole('button', { name: '통계 삭제' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '논문 삭제' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '영어 삭제' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '과목 이름 수정 취소' }));
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeEnabled();

    db.loading = true;
    view.rerender(<SubjectManager userId="user-a" />);
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeDisabled();

    db.loading = false;
    view.rerender(<SubjectManager userId="user-a" compact />);
    expect(screen.getByRole('button', { name: '영어 삭제' })).toBeEnabled();
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('asks in a danger dialog that starts on cancel, and cancel or Escape sends nothing', () => {
    seed();
    render(<SubjectManager userId="user-a" />);
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

  it('deletes after confirming, reports it and moves focus to the next row instead of the page', async () => {
    seed();
    succeed();
    const busy = vi.fn();
    render(<SubjectManager userId="user-a" onBusyChange={busy} />);
    confirmDelete('영어');
    // 설정 화면(wide)은 빈 결과 줄(role=status)을 처음부터 그린다. findByRole은 문구가 그려지기 전에 그 빈 줄로 끝나므로 문구까지 기다린다.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(DELETED('영어')));
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(db.remove).toHaveBeenCalledWith('s2');
    expect(screen.queryByText('영어')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '논문 이름 변경' })).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });

  it('moves focus to the previous row after deleting the last row, and to the list when none are left', async () => {
    db.subjects = [subject('s1', '통계'), subject('s2', '영어')];
    succeed();
    render(<SubjectManager userId="user-a" compact />);
    confirmDelete('영어');
    expect(await screen.findByText(DELETED('영어'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '통계 이름 변경' })).toHaveFocus();

    confirmDelete('통계');
    expect(await screen.findByText(DELETED('통계'))).toBeInTheDocument();
    expect(screen.getByText('아직 과목이 없어요. 자주 공부하는 과목을 추가해보세요.')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveFocus();
    expect(document.activeElement).not.toBe(screen.getByLabelText('새 과목 이름'));
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
    render(<SubjectManager userId="user-a" />);
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
    render(<SubjectManager userId="user-a" compact />);
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
    render(<SubjectManager userId="user-a" onBusyChange={busy} />);
    const confirm = within(openDelete('영어')).getByRole('button', { name: '삭제' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    for (const name of ['통계', '영어', '논문']) {
      expect(screen.getByRole('button', { name: `${name} 삭제` })).toBeDisabled();
      expect(screen.getByRole('button', { name: `${name} 이름 변경` })).toBeDisabled();
    }
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
    const view = render(<SubjectManager userId="user-a" />);
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
    const view = render(<SubjectManager userId="user-a" />);
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
    db.subjects.push(subject('b1', '물리', 'user-b'));
    let respond!: (result: DeleteStudySubjectResult) => void;
    db.remove.mockImplementation(() => new Promise((done) => { respond = done; }));
    const busy = vi.fn();
    const { rerender } = render(<SubjectManager userId="user-a" onBusyChange={busy} />);
    confirmDelete('영어');
    rerender(<SubjectManager userId="user-b" onBusyChange={busy} />);
    // 계정이 바뀌면 바쁨을 바로 풀어 준다(설정의 나머지가 잠긴 채 남지 않게).
    expect(busy.mock.calls).toEqual([[true], [false]]);
    await act(async () => respond({ status: 'deleted' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '물리 삭제' })).toBeEnabled();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
});
