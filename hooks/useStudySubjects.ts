'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  notifyStudySubjectsChanged,
  readDeleteStudySubjectResponse,
  STUDY_SUBJECTS_CHANGED_EVENT,
  validateSubjectName,
  type DeleteStudySubjectResult,
  type StudySubject,
} from '@/lib/studySubjects';
import { getCurrentUserId } from '@/lib/userScopedStorage';

export function useStudySubjects(userId?: string | null) {
  const owner = userId ?? null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const generation = useRef(0);
  // Mount lifetime, separate from the read `generation`: a mutation that settles after
  // unmount must not touch this hook's state (see accountChanged for what it still does).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
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

  // Late responses (create, rename, delete):
  // - Account changed: fail and touch neither state nor the change event.
  //   A mounted hook sees this as `currentOwner`. Managers are keyed by user, so a switch
  //   usually unmounts this hook with `currentOwner` frozen; then a known, different
  //   signed-in user in the persisted session means the same thing.
  // - Same account, hook unmounted (e.g. the history page's subject panel was collapsed
  //   right after confirming): skip local state, but still announce a confirmed change.
  //   The server already has it, so the same account's other screens (record cleanup's
  //   target select, records, statistics, timer task lists) must reload.
  const accountChanged = useCallback(() => {
    if (currentOwner.current !== owner) return true;
    if (mounted.current) return false;
    const signedInAs = getCurrentUserId();
    return signedInAs !== null && signedInAs !== owner;
  }, [owner]);

  const reportError = useCallback((message: string) => {
    if (!mounted.current || currentOwner.current !== owner) return;
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
      if (accountChanged()) return null;
      if (error) {
        reportError(error.code === '23505' ? '같은 이름의 과목이 이미 있습니다.' : '과목을 추가하지 못했습니다.');
        return null;
      }
      const subject = data as StudySubject;
      if (mounted.current) {
        setState(previous => ({
          owner,
          subjects: [...(previous.owner === owner ? previous.subjects : []), subject]
            .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
          loading: false,
          error: null,
        }));
      }
      notifyStudySubjectsChanged();
      return subject;
    } catch {
      reportError('과목을 추가하지 못했습니다. 다시 시도해주세요.');
      return null;
    }
  }, [owner, reportError, accountChanged]);

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
      if (accountChanged()) return false;
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
  }, [owner, reportError, accountChanged]);

  // Referencing rows block a direct DELETE, so deletion goes through the RPC, which
  // unassigns them (study time is kept). Failures stay out of the shared load `error`
  // (that one carries a "reload" button); the caller shows its own message once.
  // A late response follows `accountChanged` above (`failed` when the account changed).
  const deleteSubject = useCallback(async (id: string): Promise<DeleteStudySubjectResult> => {
    if (!owner || currentOwner.current !== owner) return { status: 'failed' };
    try {
      const { data, error } = await supabase.rpc('delete_study_subject', { p_subject_id: id });
      if (accountChanged() || error) return { status: 'failed' };
      const result = readDeleteStudySubjectResponse(data);
      if (result.status === 'deleted') {
        if (mounted.current) {
          setState(previous => previous.owner === owner
            ? { ...previous, subjects: previous.subjects.filter(subject => subject.id !== id) }
            : previous);
        }
        // History, statistics and timer task lists reload their (now unassigned) references.
        notifyStudySubjectsChanged();
      }
      return result;
    } catch {
      return { status: 'failed' };
    }
  }, [owner, accountChanged]);

  // A previous account's subjects must never flash during the effect transition.
  const visible = state.owner === owner ? state : {
    subjects: [], loading: Boolean(owner), error: null,
  };
  return { ...visible, refresh, createSubject, renameSubject, deleteSubject };
}
