import { useState } from 'react';
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

  it('reads a chosen subject that left the loaded list as unclassified, without judging an empty list', () => {
    const { result, rerender } = renderHook(({ available }) => useSuggestedSubject('블록체인 복습', available), {
      initialProps: { available: subjects },
    });
    act(() => result.current.selectSubject('database'));
    // 목록이 비어 있으면(불러오는 중 등) 판단하지 않는다.
    rerender({ available: [] });
    expect(result.current).toMatchObject({ subjectId: 'database', isAutomatic: false });
    rerender({ available: subjects.filter(subject => subject.id !== 'database') });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: false });
    // 선택 자체는 바꾸지 않은 파생값이다.
    rerender({ available: subjects });
    expect(result.current).toMatchObject({ subjectId: 'database', isAutomatic: false });
  });

  it('keeps automatic and explicit unclassified choices when a subject leaves the list', () => {
    const { result, rerender } = renderHook(({ available }) => useSuggestedSubject('블록체인 복습', available), {
      initialProps: { available: subjects },
    });
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: true });
    rerender({ available: subjects.filter(subject => subject.id !== 'blockchain') });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: true });
    rerender({ available: subjects });
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: true });
    act(() => result.current.selectSubject(null));
    rerender({ available: subjects.filter(subject => subject.id !== 'database') });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: false });
  });

  it('stops suggesting an archived subject but keeps it when the user chose it', () => {
    // 보관해도 과목은 목록에 남는다(이름 표시용). 그래서 "목록에서 사라진 선택 → 미분류" 규칙에 걸리지 않는다.
    const archive = (id: string) => subjects.map(subject => subject.id === id ? { ...subject, archived_at: '2026-11-09T01:00:00.000Z' } : subject);
    const { result, rerender } = renderHook(({ available }) => useSuggestedSubject('블록체인 복습', available), {
      initialProps: { available: subjects },
    });
    expect(result.current).toMatchObject({ subjectId: 'blockchain', isAutomatic: true });
    rerender({ available: archive('blockchain') });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: true });

    rerender({ available: subjects });
    act(() => result.current.selectSubject('database'));
    rerender({ available: archive('database') });
    expect(result.current).toMatchObject({ subjectId: 'database', isAutomatic: false });
  });

  it('keeps a subject that is created and chosen in the same step', () => {
    // 과목 선택기는 createSubject가 목록에 넣은 뒤에 그 과목을 고른다(같은 훅 인스턴스).
    const created = { id: 'new', user_id: 'user', name: '운영체제' };
    const { result } = renderHook(() => {
      const [available, setAvailable] = useState(subjects);
      return { ...useSuggestedSubject('독서', available), add: () => setAvailable(current => [...current, created]) };
    });
    act(() => { result.current.add(); result.current.selectSubject(created.id); });
    expect(result.current).toMatchObject({ subjectId: 'new', isAutomatic: false });
  });

  it('keeps a just-created subject that is not listed yet, and judges it only after it has been listed', () => {
    const created = { id: 'new', user_id: 'user', name: '운영체제' };
    const { result, rerender } = renderHook(({ available }) => useSuggestedSubject('독서', available), {
      initialProps: { available: subjects },
    });
    // 목록을 다시 불러오기 전: 비어 있지 않은 목록에 아직 없다.
    act(() => result.current.selectSubject(created.id));
    expect(result.current).toMatchObject({ subjectId: 'new', isAutomatic: false });
    rerender({ available: [...subjects, created] });
    expect(result.current).toMatchObject({ subjectId: 'new', isAutomatic: false });
    rerender({ available: subjects });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: false });
  });

  it('clears the listed mark when the user chooses again', () => {
    const { result, rerender } = renderHook(({ available }) => useSuggestedSubject('독서', available), {
      initialProps: { available: subjects },
    });
    const withoutDatabase = subjects.filter(subject => subject.id !== 'database');
    act(() => result.current.selectSubject('database'));
    // 목록에 보였던 database의 표시는 다른 과목(아직 목록에 없는 새 과목)에 옮겨지지 않는다.
    act(() => result.current.selectSubject('new'));
    rerender({ available: withoutDatabase });
    expect(result.current).toMatchObject({ subjectId: 'new', isAutomatic: false });
    // 같은 과목을 다시 골라도 표시는 새로 시작한다: 목록에 다시 보이기 전에는 판단하지 않는다.
    act(() => result.current.selectSubject('database'));
    expect(result.current).toMatchObject({ subjectId: 'database', isAutomatic: false });
    act(() => result.current.resetSubject());
    rerender({ available: subjects });
    act(() => result.current.selectSubject('database'));
    rerender({ available: withoutDatabase });
    expect(result.current).toMatchObject({ subjectId: null, isAutomatic: false });
  });
});
