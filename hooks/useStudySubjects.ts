'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  isArchivedSubject,
  notifyStudySubjectsChanged,
  readDeleteStudySubjectResponse,
  STUDY_SUBJECTS_CHANGED_EVENT,
  subjectNameKey,
  validateSubjectName,
  type DeleteStudySubjectResult,
  type StudySubject,
} from '@/lib/studySubjects';
import { getCurrentUserId } from '@/lib/userScopedStorage';

const SUBJECT_COLUMNS = 'id, user_id, name, created_at, archived_at';
// Read while the app is deployed before the database has `archived_at`: every subject is in use.
const SUBJECT_COLUMNS_BEFORE_ARCHIVE = 'id, user_id, name, created_at';
// PostgreSQL undefined_column: a selected column does not exist yet.
const MISSING_COLUMN = '42703';

type KnownSubjects = { owner: string | null; subjects: StudySubject[] };
// One account's list never serves another.
const subjectsOf = (known: KnownSubjects, owner: string | null) => (known.owner === owner ? known.subjects : []);

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
  // The list decisions read (createSubject's same-name check). Every change to the list writes
  // it here and the same array to `state.subjects`, but this one at once, before the call that
  // made the change settles: a call made right after another, before React renders, must see
  // it. A render never writes it (it would put back an older snapshot). Late responses leave it
  // alone by the same rules as the state (`generation`, `accountChanged`, `mounted`).
  const known = useRef<KnownSubjects>({ owner, subjects: [] });

  // A confirmed change to this account's list while mounted (callers check `accountChanged` first).
  const changeSubjects = useCallback((
    change: (subjects: StudySubject[]) => StudySubject[],
    status?: { loading: boolean; error: string | null },
  ) => {
    if (!mounted.current || known.current.owner !== owner) return;
    const subjects = change(known.current.subjects);
    known.current = { owner, subjects };
    setState(previous => ({ ...previous, owner, subjects, ...status }));
  }, [owner]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const isCurrent = () => currentOwner.current === owner && generation.current === request;
    if (!owner) {
      known.current = { owner, subjects: [] };
      setState({ owner, subjects: [], loading: false, error: null });
      return;
    }
    const kept = subjectsOf(known.current, owner);
    known.current = { owner, subjects: kept };
    setState({ owner, subjects: kept, loading: true, error: null });
    try {
      // Archived subjects stay in the list: records, statistics and plans still look up their names.
      const subjects: StudySubject[] = [];
      let columns: string = SUBJECT_COLUMNS;
      // Respect server row caps: a short page does not necessarily mean the end.
      for (let offset = 0; ; ) {
        const { data, error } = await supabase
          .from('study_subjects')
          .select(columns)
          .eq('user_id', owner)
          .order('name')
          .order('id')
          .range(offset, offset + 999);
        if (!isCurrent()) return;
        // Deployed before the archive column exists: read the same page without it, so the
        // whole list does not turn into a load error (every subject is then in use).
        if (error?.code === MISSING_COLUMN && columns === SUBJECT_COLUMNS) {
          columns = SUBJECT_COLUMNS_BEFORE_ARCHIVE;
          continue;
        }
        if (error) throw error;
        // The column list changes at run time, so the client cannot infer the row type.
        const page = (data ?? []) as unknown as StudySubject[];
        if (page.length === 0) break;
        subjects.push(...page);
        offset += page.length;
      }
      if (isCurrent()) {
        known.current = { owner, subjects };
        setState({ owner, subjects, loading: false, error: null });
      }
    } catch {
      if (isCurrent()) {
        setState({
          owner,
          subjects: subjectsOf(known.current, owner),
          loading: false,
          error: '과목을 불러오지 못했습니다. 다시 시도해주세요.',
        });
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
    setState({ owner, subjects: subjectsOf(known.current, owner), loading: false, error: message });
  }, [owner]);

  // Archive and restore only set `archived_at` (owner RLS, like a rename): the subject's ID,
  // name and every reference stay. Failures (including 0 rows) stay out of the shared load
  // `error`, like deletion; the caller shows its own message once. Late responses follow
  // `accountChanged` above. With `expectedName`, only a row that still has that exact name
  // changes (0 rows otherwise).
  const setArchived = useCallback(async (id: string, archived: boolean, expectedName?: string): Promise<boolean> => {
    if (!owner || currentOwner.current !== owner) return false;
    const requested = archived ? new Date().toISOString() : null;
    try {
      let request = supabase
        .from('study_subjects')
        .update({ archived_at: requested })
        .eq('user_id', owner)
        .eq('id', id);
      if (expectedName !== undefined) request = request.eq('name', expectedName);
      const { data, error } = await request.select('id, archived_at').single();
      if (accountChanged()) return false;
      if (error || !data) {
        // 0 rows: another screen or device probably deleted (or renamed) it. Reload to match.
        if (error?.code === 'PGRST116' && mounted.current) void refresh();
        return false;
      }
      const saved = (data as { archived_at?: unknown }).archived_at;
      const archivedAt = typeof saved === 'string' || saved === null ? saved : requested;
      changeSubjects(subjects => subjects.map(subject => subject.id === id ? { ...subject, archived_at: archivedAt } : subject));
      // Selectors, record cleanup and statistics of this account reload (also in other tabs).
      notifyStudySubjectsChanged();
      return true;
    } catch {
      return false;
    }
  }, [owner, accountChanged, refresh, changeSubjects]);

  const archiveSubject = useCallback((id: string) => setArchived(id, true), [setArchived]);
  // The restore button passes only the ID. A restore chosen by name (adding or importing an
  // archived subject's name) passes the stored name it matched, so a row renamed elsewhere
  // since this list was read stays as it is (false, and the list reloads).
  const restoreSubject = useCallback(
    (id: string, expectedName?: string) => setArchived(id, false, expectedName),
    [setArchived],
  );

  const createSubject = useCallback(async (value: string): Promise<StudySubject | null> => {
    if (!owner || currentOwner.current !== owner) return null;
    const validationError = validateSubjectName(value);
    if (validationError) {
      reportError(validationError);
      return null;
    }
    // The unique name index also covers archived subjects. Using an archived subject's name
    // again restores that subject instead, so its earlier records continue. The request also
    // requires the name this list has: another tab or device may have renamed that row since,
    // and then nothing changes (null, and the list reloads).
    const key = subjectNameKey(value);
    const archived = subjectsOf(known.current, owner).find(subject => isArchivedSubject(subject) && subjectNameKey(subject.name) === key);
    if (archived) return await restoreSubject(archived.id, archived.name) ? { ...archived, archived_at: null } : null;
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
      changeSubjects(
        subjects => [...subjects, subject].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
        { loading: false, error: null },
      );
      notifyStudySubjectsChanged();
      return subject;
    } catch {
      reportError('과목을 추가하지 못했습니다. 다시 시도해주세요.');
      return null;
    }
  }, [owner, reportError, accountChanged, restoreSubject, changeSubjects]);

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
      // The new name counts at once (the reload the event starts brings the server's order).
      const name = value.trim();
      changeSubjects(subjects => subjects.map(subject => subject.id === id ? { ...subject, name } : subject));
      notifyStudySubjectsChanged();
      return true;
    } catch {
      reportError('과목 이름을 변경하지 못했습니다. 다시 시도해주세요.');
      return false;
    }
  }, [owner, reportError, accountChanged, changeSubjects]);

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
        changeSubjects(subjects => subjects.filter(subject => subject.id !== id));
        // History, statistics and timer task lists reload their (now unassigned) references.
        notifyStudySubjectsChanged();
      }
      return result;
    } catch {
      return { status: 'failed' };
    }
  }, [owner, accountChanged, changeSubjects]);

  // A previous account's subjects must never flash during the effect transition.
  const visible = state.owner === owner ? state : {
    subjects: [], loading: Boolean(owner), error: null,
  };
  return { ...visible, refresh, createSubject, renameSubject, deleteSubject, archiveSubject, restoreSubject };
}
