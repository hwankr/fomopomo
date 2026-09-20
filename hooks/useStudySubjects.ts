'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  notifyStudySubjectsChanged,
  STUDY_SUBJECTS_CHANGED_EVENT,
  validateSubjectName,
  type StudySubject,
} from '@/lib/studySubjects';

export function useStudySubjects(userId?: string | null) {
  const owner = userId ?? null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const generation = useRef(0);
  const [state, setState] = useState<{
    owner: string | null;
    subjects: StudySubject[];
    loading: boolean;
    error: string | null;
  }>({ owner, subjects: [], loading: Boolean(owner), error: null });

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const isCurrent = () => currentOwner.current === owner && generation.current === request;
    if (!owner) {
      setState({ owner, subjects: [], loading: false, error: null });
      return;
    }
    setState(previous => ({
      owner,
      subjects: previous.owner === owner ? previous.subjects : [],
      loading: true,
      error: null,
    }));
    try {
      const subjects: StudySubject[] = [];
      // Respect server row caps: a short page does not necessarily mean the end.
      for (let offset = 0; ; ) {
        const { data, error } = await supabase
          .from('study_subjects')
          .select('id, user_id, name, created_at')
          .eq('user_id', owner)
          .order('name')
          .order('id')
          .range(offset, offset + 999);
        if (!isCurrent()) return;
        if (error) throw error;
        const page = (data ?? []) as StudySubject[];
        if (page.length === 0) break;
        subjects.push(...page);
        offset += page.length;
      }
      if (isCurrent()) setState({ owner, subjects, loading: false, error: null });
    } catch {
      if (isCurrent()) {
        setState(previous => ({
          owner,
          subjects: previous.owner === owner ? previous.subjects : [],
          loading: false,
          error: '과목을 불러오지 못했습니다. 다시 시도해주세요.',
        }));
      }
    }
  }, [owner]);

  useEffect(() => {
    void refresh();
    const reload = () => { void refresh(); };
    window.addEventListener(STUDY_SUBJECTS_CHANGED_EVENT, reload);
    return () => {
      generation.current += 1;
      window.removeEventListener(STUDY_SUBJECTS_CHANGED_EVENT, reload);
    };
  }, [refresh]);

  const reportError = useCallback((message: string) => {
    if (currentOwner.current !== owner) return;
    setState(previous => ({
      owner,
      subjects: previous.owner === owner ? previous.subjects : [],
      loading: false,
      error: message,
    }));
  }, [owner]);

  const createSubject = useCallback(async (value: string): Promise<StudySubject | null> => {
    if (!owner || currentOwner.current !== owner) return null;
    const validationError = validateSubjectName(value);
    if (validationError) {
      reportError(validationError);
      return null;
    }
    try {
      const { data, error } = await supabase
        .from('study_subjects')
        .insert({ user_id: owner, name: value.trim() })
        .select('id, user_id, name, created_at')
        .single();
      if (currentOwner.current !== owner) return null;
      if (error) {
        reportError(error.code === '23505' ? '같은 이름의 과목이 이미 있습니다.' : '과목을 추가하지 못했습니다.');
        return null;
      }
      const subject = data as StudySubject;
      setState(previous => ({
        owner,
        subjects: [...(previous.owner === owner ? previous.subjects : []), subject]
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
        loading: false,
        error: null,
      }));
      notifyStudySubjectsChanged();
      return subject;
    } catch {
      reportError('과목을 추가하지 못했습니다. 다시 시도해주세요.');
      return null;
    }
  }, [owner, reportError]);

  const renameSubject = useCallback(async (id: string, value: string): Promise<boolean> => {
    if (!owner || currentOwner.current !== owner) return false;
    const validationError = validateSubjectName(value);
    if (validationError) {
      reportError(validationError);
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('study_subjects')
        .update({ name: value.trim() })
        .eq('user_id', owner)
        .eq('id', id)
        .select('id')
        .single();
      if (currentOwner.current !== owner) return false;
      if (error || !data) {
        reportError(error?.code === '23505' ? '같은 이름의 과목이 이미 있습니다.' : '과목 이름을 변경하지 못했습니다.');
        return false;
      }
      notifyStudySubjectsChanged();
      return true;
    } catch {
      reportError('과목 이름을 변경하지 못했습니다. 다시 시도해주세요.');
      return false;
    }
  }, [owner, reportError]);

  // A previous account's subjects must never flash during the effect transition.
  const visible = state.owner === owner ? state : {
    subjects: [], loading: Boolean(owner), error: null,
  };
  return { ...visible, refresh, createSubject, renameSubject };
}
