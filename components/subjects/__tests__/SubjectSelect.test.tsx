import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SubjectSelect from '../SubjectSelect';

// Business semantics are independent of AppSelect's separately tested keyboard UI.
vi.mock('@/components/ui/AppSelect', () => ({ default: ({ value, onValueChange, options, label, disabled }: {
  value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; label?: string; disabled?: boolean;
}) => <label>{label}<select value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }));

afterEach(cleanup);
const subject = { id: 'blockchain', user_id: 'user', name: '블록체인' };

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
});
