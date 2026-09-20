import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudySubject } from '@/lib/studySubjects';

const db = vi.hoisted(() => ({
  subjects: [] as StudySubject[],
  create: vi.fn(), rename: vi.fn(), refresh: vi.fn(),
}));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: (userId: string) => ({
    subjects: db.subjects.filter((subject) => subject.user_id === userId),
    loading: false, error: null, createSubject: db.create, renameSubject: db.rename, refresh: db.refresh,
  }),
}));
import SubjectManager from '../SubjectManager';

beforeEach(() => {
  db.subjects = [];
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
});
