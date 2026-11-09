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

// 실제 useStudySubjects로 만들기 → 삭제 → 다시 만들기를 확인하는 통합 테스트용 메모리 서버.
const server = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; name: string }[],
  inserts: 0,
  rpc: [] as { name: string; args: Record<string, unknown> }[],
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
      let owner: unknown = null;
      let offset = 0;
      const query = {
        select: () => query, order: () => query, single: () => query,
        eq: (key: string, value: unknown) => { if (key === 'user_id') owner = value; return query; },
        range: (from: number) => { offset = from; return query; },
        insert: (value: Record<string, unknown>) => { insert = value; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          if (insert) {
            const row = { id: `subject-${++server.inserts}`, user_id: String(insert.user_id), name: String(insert.name) };
            const duplicate = server.rows.some(item => item.user_id === row.user_id && item.name === row.name);
            if (duplicate) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve);
            server.rows.push(row);
            return Promise.resolve({ data: row, error: null }).then(resolve);
          }
          const mine = server.rows.filter(row => row.user_id === owner);
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

describe('SubjectSelect with the real subject list', () => {
  beforeEach(() => {
    server.rows = [];
    server.inserts = 0;
    server.rpc = [];
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
});
