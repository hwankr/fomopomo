import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppSelect, { type AppSelectProps } from '../AppSelect';

afterEach(cleanup);

const options = [
  { value: '', label: '미분류' },
  { value: 'database', label: '데이터베이스' },
  { value: 'blockchain', label: '블록체인' },
];

function ControlledSelect({ onValueChange = () => {}, ...props }: Partial<AppSelectProps>) {
  const [value, setValue] = useState(props.value ?? 'database');
  return <AppSelect label="과목" options={options} {...props} value={value} onValueChange={next => {
    setValue(next);
    onValueChange(next);
  }} />;
}

async function openSelect(name = '과목') {
  const trigger = screen.getByRole('combobox', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await screen.findByRole('listbox');
  return trigger;
}

describe('AppSelect', () => {
  it('selects stable values with the keyboard and preserves an explicit empty option', async () => {
    const change = vi.fn();
    render(<ControlledSelect value="" onValueChange={change} />);
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('미분류');

    await openSelect();
    const unclassified = screen.getByRole('option', { name: '미분류' });
    await waitFor(() => expect(unclassified).toHaveFocus());
    fireEvent.keyDown(unclassified, { key: 'ArrowDown' });
    const database = screen.getByRole('option', { name: '데이터베이스' });
    await waitFor(() => expect(database).toHaveFocus());
    fireEvent.keyDown(database, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('database');
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('데이터베이스');

    await openSelect();
    fireEvent.click(screen.getByRole('option', { name: '미분류' }));
    expect(change).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('미분류');
  });

  it('shows a placeholder when there is no explicit empty option', () => {
    render(<AppSelect value="" onValueChange={vi.fn()} options={options.slice(1)} placeholder="과목 선택" aria-label="기록 과목" />);
    expect(screen.getByRole('combobox', { name: '기록 과목' })).toHaveTextContent('과목 선택');
    expect(screen.getByRole('combobox')).toHaveAttribute('data-placeholder');
  });

  it('closes on Escape and restores focus without changing the value', async () => {
    const change = vi.fn();
    render(<ControlledSelect onValueChange={change} />);
    const trigger = await openSelect();
    await waitFor(() => expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps Space selection from reaching global timer keyboard shortcuts', async () => {
    const shortcut = vi.fn();
    const change = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      render(<ControlledSelect onValueChange={change} />);
      const trigger = screen.getByRole('combobox', { name: '과목' });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: ' ' });
      const database = await screen.findByRole('option', { name: '데이터베이스' });
      await waitFor(() => expect(database).toHaveFocus());
      fireEvent.keyDown(database, { key: 'ArrowDown' });
      const blockchain = screen.getByRole('option', { name: '블록체인' });
      await waitFor(() => expect(blockchain).toHaveFocus());
      fireEvent.keyDown(blockchain, { key: ' ' });
      expect(change).toHaveBeenLastCalledWith('blockchain');
      expect(shortcut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', shortcut);
    }
  });

  it('skips disabled options with arrow keys and supports typeahead', async () => {
    const change = vi.fn();
    render(<ControlledSelect value="" onValueChange={change} options={[
      options[0], { ...options[1], disabled: true }, options[2],
    ]} />);
    await openSelect();
    const unclassified = screen.getByRole('option', { name: '미분류' });
    await waitFor(() => expect(unclassified).toHaveFocus());
    expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(unclassified, { key: 'ArrowDown' });
    const blockchain = screen.getByRole('option', { name: '블록체인' });
    await waitFor(() => expect(blockchain).toHaveFocus());
    fireEvent.keyDown(blockchain, { key: '미' });
    await waitFor(() => expect(unclassified).toHaveFocus());
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps disabled controls closed', () => {
    const change = vi.fn();
    render(<ControlledSelect disabled onValueChange={change} />);
    const trigger = screen.getByRole('combobox', { name: '과목' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it('dismisses on the first outside pointer press after interacting with its content', async () => {
    render(<ControlledSelect />);
    await openSelect();
    await waitFor(() => expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveFocus());
    fireEvent.pointerDown(screen.getByRole('listbox'), { pointerType: 'mouse', button: 0 });
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('does not bubble portalled option clicks into a parent modal or submit its form', async () => {
    const click = vi.fn();
    const submit = vi.fn(event => event.preventDefault());
    const change = vi.fn();
    render(<div onClick={click}><form onSubmit={submit}><ControlledSelect onValueChange={change} /></form></div>);
    const trigger = await openSelect();
    expect(trigger).toHaveAttribute('type', 'button');
    fireEvent.click(screen.getByRole('option', { name: '블록체인' }));
    expect(change).toHaveBeenLastCalledWith('blockchain');
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
