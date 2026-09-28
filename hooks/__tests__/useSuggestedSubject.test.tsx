import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSuggestedSubject } from '@/hooks/useSuggestedSubject';

const subjects = [
  { id: 'blockchain', user_id: 'user', name: '블록체인' },
  { id: 'database', user_id: 'user', name: '데이터베이스' },
];

afterEach(cleanup);

describe('useSuggestedSubject', () => {
  it('updates suggestions immediately as the title changes and clears unmatched titles', () => {
    const { result, rerender } = renderHook(({ title }) => useSuggestedSubject(title, subjects), {
      initialProps: { title: '블록체인 9/13 복습' },
    });
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: true });
    rerender({ title: '데이터베이스 9/15 복습' });
    expect(result.current).toMatchObject({ subjectId: 'database', isAutomatic: true });
    rerender({ title: '독서' });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: true });
  });

  it('suggests a subject when the registered list loads after the title', () => {
    const { result, rerender } = renderHook(({ available }) => useSuggestedSubject('블록체인 복습', available), {
      initialProps: { available: subjects.slice(0, 0) },
    });
    expect(result.current.subjectId).toBeNull();
    rerender({ available: subjects });
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: true });
  });

  it.each(['database', null])('preserves an explicit %s selection while typing and resumes inference after reset', selection => {
    const { result, rerender } = renderHook(({ title }) => useSuggestedSubject(title, subjects), {
      initialProps: { title: '블록체인 9/13 복습' },
    });
    act(() => result.current.selectSubject(selection));
    rerender({ title: '블록체인 9/15 복습' });
    expect(result.current).toMatchObject({ subjectId: selection, isAutomatic: false });
    act(() => result.current.resetSubject());
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: true });
  });

  it('treats explicitly confirming the suggested subject as a manual selection', () => {
    const { result, rerender } = renderHook(({ title }) => useSuggestedSubject(title, subjects), {
      initialProps: { title: '블록체인 복습' },
    });
    act(() => result.current.selectSubject('blockchain'));
    rerender({ title: '데이터베이스 복습' });
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: false });
  });
});
