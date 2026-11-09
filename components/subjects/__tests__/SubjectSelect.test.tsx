import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudySubject } from '@/lib/studySubjects';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import SubjectSelect from '../SubjectSelect';

// Business semantics are independent of AppSelect's separately tested keyboard UI.
vi.mock('@/components/ui/AppSelect', () => ({ default: ({ value, onValueChange, options, label, disabled }: {
  value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; label?: string; disabled?: boolean;
}) => <label>{label}<select value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }));

// 실제 useStudySubjects로 만들기 → 삭제 → 다시 만들기, 보관한 과목 다시 사용을 확인하는 통합 테스트용 메모리 서버.
const server = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; name: string; archived_at?: string | null }[],
  inserts: 0,
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  updates: [] as { values: Record<string, unknown>; filters: Record<string, unknown> }[],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      server.rpc.push({ name, args });
      const before = server.rows.length;
      server.rows = server.rows.filter(row => row.id !== args.p_subject_id);
      return { data: { status: server.rows.length < before ? 'deleted' : 'not_found' }, error: null };
    },
    from: () => {
      let insert: Record<string, unknown> | null = null;
      let update: Record<string, unknown> | null = null;
      const filters: Record<string, unknown> = {};
      let offset = 0;
      const query = {
        select: () => query, order: () => query, single: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        range: (from: number) => { offset = from; return query; },
        insert: (value: Record<string, unknown>) => { insert = value; return query; },
        update: (value: Record<string, unknown>) => { update = value; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          if (insert) {
            const row = { id: `subject-${++server.inserts}`, user_id: String(insert.user_id), name: String(insert.name) };
            // DB 유일 인덱스 lower(btrim(name))처럼 보관한 과목까지 같은 이름을 막는다.
            const key = (name: string) => name.trim().toLocaleLowerCase();
            const duplicate = server.rows.some(item => item.user_id === row.user_id && key(item.name) === key(row.name));
            if (duplicate) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve);
            server.rows.push(row);
            return Promise.resolve({ data: row, error: null }).then(resolve);
          }
          if (update) {
            server.updates.push({ values: update, filters: { ...filters } });
            const target = server.rows.find(item => Object.entries(filters).every(([column, value]) => item[column as keyof typeof item] === value));
            if (!target) return Promise.resolve({ data: null, error: { code: 'PGRST116' } }).then(resolve);
            Object.assign(target, update);
            return Promise.resolve({ data: { id: target.id, archived_at: target.archived_at ?? null }, error: null }).then(resolve);
          }
          const mine = server.rows.filter(row => row.user_id === filters.user_id);
          return Promise.resolve({ data: mine.slice(offset, offset + 1000), error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

afterEach(cleanup);
const subject = { id: 'blockchain', user_id: 'user', name: '블록체인' };

async function createInline(name: string) {
  fireEvent.click(screen.getByRole('button', { name: '+ 새 과목' }));
  fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
}
const optionLabels = () => Array.from((screen.getByLabelText('과목') as HTMLSelectElement).options).map(option => option.textContent);

describe('SubjectSelect', () => {
  it('uses stable IDs and allows clearing a subject', () => {
    const onChange = vi.fn();
    render(<SubjectSelect subjects={[subject]} value={subject.id} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('과목'), { target: { value: '__unclassified__' } });
    expect(onChange).toHaveBeenCalledWith(null);
    fireEvent.change(screen.getByLabelText('과목'), { target: { value: subject.id } });
    expect(onChange).toHaveBeenLastCalledWith(subject.id);
  });

  it('creates a subject inline without submitting the parent task form', async () => {
    const create = vi.fn(async () => subject);
    const change = vi.fn();
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><SubjectSelect subjects={[]} value={null} onChange={change} onCreate={create} /></form>);
    fireEvent.click(screen.getByRole('button', { name: '+ 새 과목' }));
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: ' 블록체인 ' } });
    fireEvent.keyDown(screen.getByLabelText('새 과목 이름'), { key: 'Enter' });
    await waitFor(() => expect(change).toHaveBeenCalledWith('blockchain'));
    expect(create).toHaveBeenCalledWith('블록체인');
    expect(submit).not.toHaveBeenCalled();
  });

  it('selects an existing name instead of creating duplicates', async () => {
    const create = vi.fn();
    const change = vi.fn();
    render(<SubjectSelect subjects={[subject]} value={null} onChange={change} onCreate={create} />);
    fireEvent.click(screen.getByRole('button', { name: '+ 새 과목' }));
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: ' 블록체인 ' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(change).toHaveBeenCalledWith(subject.id);
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps a just-created subject named and selected until the reloaded list includes it', async () => {
    const created: StudySubject = { id: 'english-new', user_id: 'user', name: '영어' };
    const create = vi.fn(async () => created);
    function Picker({ subjects }: { subjects: StudySubject[] }) {
      const [value, setValue] = useState<string | null>(null);
      return <SubjectSelect subjects={subjects} value={value} onChange={setValue} onCreate={create} />;
    }
    const view = render(<Picker subjects={[subject]} />);
    await createInline('영어');
    await waitFor(() => expect(screen.getByLabelText('과목')).toHaveValue('english-new'));
    // 목록은 아직 다시 불러오는 중이라 새 과목이 없다. 그래도 이름으로 보이고 선택돼 있다.
    expect(optionLabels()).toEqual(['미분류', '블록체인', '영어']);
    view.rerender(<Picker subjects={[subject]} />);
    expect(screen.getByRole('option', { name: '영어' })).toHaveValue('english-new');
    expect(screen.queryByRole('option', { name: '지정된 과목' })).not.toBeInTheDocument();
    // 다시 불러온 목록에 들어오면 한 번만 보인다.
    view.rerender(<Picker subjects={[subject, created]} />);
    expect(optionLabels()).toEqual(['미분류', '블록체인', '영어']);
    expect(screen.getByLabelText('과목')).toHaveValue('english-new');
  });

  it('forgets a created subject once the list has it, so a deleted one disappears and can be created again', async () => {
    const first: StudySubject = { id: 'english-old', user_id: 'user', name: '영어' };
    const second: StudySubject = { id: 'english-new', user_id: 'user', name: '영어' };
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const change = vi.fn();
    const view = render(<SubjectSelect subjects={[]} value={null} onChange={change} onCreate={create} />);
    await createInline('영어');
    await waitFor(() => expect(change).toHaveBeenCalledWith('english-old'));
    // 서버 목록이 새 과목을 확인한 뒤 삭제로 빠진다(공부 기록 정리는 선택을 미분류로 되돌린다).
    view.rerender(<SubjectSelect subjects={[first]} value="english-old" onChange={change} onCreate={create} />);
    view.rerender(<SubjectSelect subjects={[]} value={null} onChange={change} onCreate={create} />);
    expect(screen.queryByRole('option', { name: '영어' })).not.toBeInTheDocument();
    expect(optionLabels()).toEqual(['미분류']);

    change.mockClear();
    await createInline('영어');
    await waitFor(() => expect(change).toHaveBeenCalledWith('english-new'));
    expect(create).toHaveBeenCalledTimes(2);
    expect(change).not.toHaveBeenCalledWith('english-old');
  });
});

describe('SubjectSelect with archived subjects', () => {
  const english: StudySubject = { id: 'english', user_id: 'user', name: '영어', archived_at: '2026-11-09T01:00:00.000Z' };
  const exam: StudySubject = { id: 'exam', user_id: 'user', name: '정보처리기사', archived_at: '2026-11-08T01:00:00.000Z' };
  const math: StudySubject = { id: 'math', user_id: 'user', name: '수학', archived_at: null };
  const subjects = [subject, english, math, exam];

  it('offers only subjects in use for a new choice', () => {
    render(<SubjectSelect subjects={subjects} value={null} onChange={vi.fn()} onCreate={vi.fn()} />);
    expect(optionLabels()).toEqual(['미분류', '블록체인', '수학']);
    expect(screen.getByLabelText('과목')).toHaveValue('__unclassified__');
  });

  it('keeps an archived current value, shown by name after 미분류, without changing it', () => {
    const change = vi.fn();
    render(<SubjectSelect subjects={subjects} value="english" onChange={change} />);
    expect(optionLabels()).toEqual(['미분류', '영어 (보관)', '블록체인', '수학']);
    expect(screen.getByLabelText('과목')).toHaveValue('english');
    expect(screen.getByRole('option', { name: '영어 (보관)' })).toHaveValue('english');
    expect(screen.queryByRole('option', { name: '지정된 과목' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '정보처리기사 (보관)' })).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    // 다른 과목으로 바꿀 수 있고, 미분류로도 바꿀 수 있다.
    fireEvent.change(screen.getByLabelText('과목'), { target: { value: 'math' } });
    expect(change).toHaveBeenLastCalledWith('math');
  });

  it('still names a value missing from the list as 지정된 과목', () => {
    render(<SubjectSelect subjects={subjects} value="gone" onChange={vi.fn()} />);
    expect(optionLabels()).toEqual(['미분류', '지정된 과목', '블록체인', '수학']);
    expect(screen.getByLabelText('과목')).toHaveValue('gone');
  });

  it('with includeArchived lists archived subjects after those in use, once, before + 새 과목', () => {
    const change = vi.fn();
    const view = render(<SubjectSelect subjects={subjects} value={null} onChange={change} onCreate={vi.fn()} createAsOption includeArchived />);
    expect(optionLabels()).toEqual(['미분류', '블록체인', '수학', '영어 (보관)', '정보처리기사 (보관)', '+ 새 과목']);
    fireEvent.change(screen.getByLabelText('과목'), { target: { value: 'exam' } });
    expect(change).toHaveBeenLastCalledWith('exam');
    // 보관한 과목이 지금 값이어도 앞에 따로 두지 않는다(순서 그대로, 중복 없음).
    view.rerender(<SubjectSelect subjects={subjects} value="exam" onChange={change} onCreate={vi.fn()} createAsOption includeArchived />);
    expect(optionLabels()).toEqual(['미분류', '블록체인', '수학', '영어 (보관)', '정보처리기사 (보관)', '+ 새 과목']);
    expect(screen.getByLabelText('과목')).toHaveValue('exam');
  });

  it('keeps the automatic-choice label and option as before', () => {
    render(<SubjectSelect subjects={subjects} value="math" onChange={vi.fn()} automatic onAutoSelect={vi.fn()} />);
    expect(optionLabels()).toEqual(['제목에 맞춰 선택', '미분류', '블록체인', '수학']);
    expect(screen.getByLabelText('과목')).toHaveValue('__automatic__');
  });

  it.each(['영어', ' 영어 ', 'ENGLISH'])('sends an archived subject name (%j) to onCreate and selects the restored subject', async name => {
    const archived: StudySubject = { id: 'english-en', user_id: 'user', name: 'English', archived_at: '2026-11-09T01:00:00.000Z' };
    const list = name === 'ENGLISH' ? [subject, archived] : subjects;
    const restored = name === 'ENGLISH' ? { ...archived, archived_at: null } : { ...english, archived_at: null };
    const create = vi.fn(async () => restored);
    const change = vi.fn();
    render(<SubjectSelect subjects={list} value={null} onChange={change} onCreate={create} />);
    await createInline(name);
    await waitFor(() => expect(change).toHaveBeenCalledWith(restored.id));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(name.trim());
    expect(screen.queryByLabelText('새 과목 이름')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('selects a subject in use by name (any case and spacing) without onCreate', () => {
    const create = vi.fn();
    const change = vi.fn();
    const named = { ...math, name: 'Math' };
    render(<SubjectSelect subjects={[named, english]} value={null} onChange={change} onCreate={create} />);
    fireEvent.click(screen.getByRole('button', { name: '+ 새 과목' }));
    fireEvent.change(screen.getByLabelText('새 과목 이름'), { target: { value: '  mATH ' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(change).toHaveBeenCalledWith('math');
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the failure message when restoring an archived name returns nothing', async () => {
    const create = vi.fn(async () => null);
    const change = vi.fn();
    render(<SubjectSelect subjects={subjects} value={null} onChange={change} onCreate={create} />);
    await createInline('영어');
    expect(await screen.findByRole('alert')).toHaveTextContent('과목을 추가하지 못했습니다. 이름을 확인하고 다시 시도해주세요.');
    expect(create).toHaveBeenCalledWith('영어');
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText('새 과목 이름')).toHaveValue('영어');
  });
});

describe('SubjectSelect with the real subject list', () => {
  beforeEach(() => {
    server.rows = [];
    server.inserts = 0;
    server.rpc = [];
    server.updates = [];
  });

  // 공부 기록의 기록 정리처럼: 같은 훅의 목록·만들기를 쓰고, 지운 과목이 고른 값이면 미분류로 되돌린다.
  function HistoryLikePicker() {
    const { subjects, loading, error, createSubject, deleteSubject } = useStudySubjects('alice');
    const [value, setValue] = useState<string | null>(null);
    if (value && !loading && !error && !subjects.some(item => item.id === value)) setValue(null);
    return <>
      <SubjectSelect subjects={subjects} value={value} onChange={setValue} onCreate={createSubject} />
      <button type="button" onClick={() => { if (value) void deleteSubject(value); }}>고른 과목 삭제</button>
    </>;
  }

  it('creates a new subject again after the same-named one was deleted', async () => {
    render(<HistoryLikePicker />);
    await createInline('영어');
    await waitFor(() => expect(screen.getByLabelText('과목')).toHaveValue('subject-1'));
    expect(server.inserts).toBe(1);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고른 과목 삭제' })); });
    expect(server.rpc).toEqual([{ name: 'delete_study_subject', args: { p_subject_id: 'subject-1' } }]);
    await waitFor(() => expect(screen.getByLabelText('과목')).toHaveValue('__unclassified__'));
    expect(screen.queryByRole('option', { name: '영어' })).not.toBeInTheDocument();

    await createInline('영어');
    await waitFor(() => expect(screen.getByLabelText('과목')).toHaveValue('subject-2'));
    expect(server.inserts).toBe(2);
    expect(server.rows).toEqual([{ id: 'subject-2', user_id: 'alice', name: '영어' }]);
    expect(screen.getAllByRole('option', { name: '영어' })).toHaveLength(1);
  });

  // 계획·타이머 칸처럼: 같은 훅의 목록·만들기, 값은 화면이 들고 있다(편집이면 저장된 과목으로 시작).
  function PlanLikePicker({ initial = null }: { initial?: string | null }) {
    const { subjects, createSubject } = useStudySubjects('alice');
    const [value, setValue] = useState<string | null>(initial);
    return <SubjectSelect subjects={subjects} value={value} onChange={setValue} onCreate={createSubject} />;
  }
  const archivedEnglish = () => ({ id: 'english', user_id: 'alice', name: 'English', archived_at: '2026-11-09T01:00:00.000Z' });

  it('restores an archived subject typed in + 새 과목 instead of inserting a new one', async () => {
    server.rows = [archivedEnglish(), { id: 'math', user_id: 'alice', name: '수학', archived_at: null }];
    render(<PlanLikePicker />);
    await waitFor(() => expect(optionLabels()).toEqual(['미분류', '수학']));

    await createInline(' english ');
    await waitFor(() => expect(screen.getByLabelText('과목')).toHaveValue('english'));
    expect(server.inserts).toBe(0);
    // 이름으로 고른 다시 사용이라 저장된 이름을 조건으로 건다(훅 규칙).
    expect(server.updates).toEqual([{ values: { archived_at: null }, filters: { user_id: 'alice', id: 'english', name: 'English' } }]);
    expect(server.rows.map(row => [row.id, row.archived_at])).toEqual([['english', null], ['math', null]]);
    await waitFor(() => expect(optionLabels()).toEqual(['미분류', 'English', '수학']));
    expect(screen.queryByRole('option', { name: 'English (보관)' })).not.toBeInTheDocument();
  });

  it('keeps an archived subject already chosen as the current value', async () => {
    server.rows = [archivedEnglish(), { id: 'math', user_id: 'alice', name: '수학', archived_at: null }];
    render(<PlanLikePicker initial="english" />);
    await waitFor(() => expect(optionLabels()).toEqual(['미분류', 'English (보관)', '수학']));
    expect(screen.getByLabelText('과목')).toHaveValue('english');
    expect(server.updates).toEqual([]);
  });
});
