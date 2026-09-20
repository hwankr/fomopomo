'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getDayStart } from '@/lib/dateUtils';
import { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } from '@/lib/studySubjects';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import SubjectSelect from '@/components/subjects/SubjectSelect';

type HistoryRow = {
  id: number;
  task: string | null;
  duration: number;
  created_at: string;
  subject_id: string | null;
  session_batch_id: string | null;
  group_id: string | null;
};

type LogicalRecord = HistoryRow & { key: string; subjectIds: Set<string | null> };

const PAGE_SIZE = 500;
const DISPLAY_SIZE = 30;
const inputClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100';

export default function SubjectHistoryManager({ userId }: { userId: string | null }) {
  return userId ? <HistoryManager key={userId} userId={userId} /> : null;
}

function HistoryManager({ userId }: { userId: string }) {
  const { subjects, loading: subjectsLoading, error: subjectError, createSubject, renameSubject } = useStudySubjects(userId);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(DISPLAY_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetSubject, setTargetSubject] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(STUDY_SUBJECTS_CHANGED_EVENT, refresh);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(STUDY_SUBJECTS_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const allRows: HistoryRow[] = [];
        for (let from = 0; ; ) {
          const { data, error } = await supabase.from('study_sessions')
            .select('id, task, duration, created_at, subject_id, session_batch_id, group_id')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
          if (cancelled) return;
          if (error) throw error;
          const page = (data ?? []) as HistoryRow[];
          if (!page.length) break;
          allRows.push(...page);
          from += page.length;
        }
        setRows(allRows);
      } catch {
        if (!cancelled) setLoadError('기록을 불러오지 못했습니다. 다시 시도해주세요.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId, revision]);

  const records = useMemo(() => {
    const grouped = new Map<string, LogicalRecord>();
    for (const row of rows) {
      const batchId = row.session_batch_id ?? row.group_id;
      const key = batchId ? `batch:${batchId}` : `row:${row.id}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.duration += row.duration;
        existing.subjectIds.add(row.subject_id ?? null);
      } else {
        grouped.set(key, { ...row, key, subjectIds: new Set([row.subject_id ?? null]) });
      }
    }
    return [...grouped.values()];
  }, [rows]);

  const filtered = useMemo(() => records.filter(record => {
    const studyDate = format(getDayStart(new Date(record.created_at)), 'yyyy-MM-dd');
    return (record.task ?? '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      && (subjectFilter === 'all' || record.subjectIds.has(subjectFilter === 'unclassified' ? null : subjectFilter))
      && (!fromDate || studyDate >= fromDate)
      && (!toDate || studyDate <= toDate);
  }), [records, search, subjectFilter, fromDate, toDate]);

  const visible = filtered.slice(0, visibleCount);
  const subjectNames = new Map(subjects.map(subject => [subject.id, subject.name]));
  const resetSelection = () => {
    setSelected(new Set());
    setVisibleCount(DISPLAY_SIZE);
    setNotice(null);
  };

  const classify = async () => {
    const selectedRecords = filtered.filter(record => selected.has(record.key));
    if (!selectedRecords.length || saving) return;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc('classify_study_sessions', {
        p_session_ids: selectedRecords.map(record => record.id),
        p_subject_id: targetSubject,
      });
      if (!mountedRef.current) return;
      if (error || !data) throw error ?? new Error('No records updated');
      setSelected(new Set());
      setNotice(`${selectedRecords.length}개 기록의 과목을 ${targetSubject ? '변경했습니다' : '해제했습니다'}.`);
      notifyStudySubjectsChanged();
    } catch {
      if (mountedRef.current) setActionError('과목을 변경하지 못했습니다. 선택한 기록을 확인하고 다시 시도해주세요.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const saveName = async () => {
    if (!renamingId || !renameDraft.trim() || renaming) return;
    setRenaming(true);
    const success = await renameSubject(renamingId, renameDraft);
    if (!mountedRef.current) return;
    setRenaming(false);
    if (success) setRenamingId(null);
  };

  return (
    <section aria-label="기존 기록 과목 정리" className="mt-5 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-slate-600">
      <div>
        <h4 className="text-sm font-bold text-gray-800 dark:text-white">기존 기록 과목 정리</h4>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">제목을 검색해 여러 기록을 한 과목으로 묶으세요. 공부 시간은 그대로 유지됩니다.</p>
      </div>

      <details className="text-sm text-gray-700 dark:text-gray-200">
        <summary className="cursor-pointer font-medium">과목 이름 관리</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {subjects.map(subject => renamingId === subject.id ? (
            <form key={subject.id} className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void saveName(); }}>
              <input aria-label="새 과목 이름" autoFocus value={renameDraft} onChange={event => setRenameDraft(event.target.value)} maxLength={80} className={inputClass} disabled={renaming} />
              <button type="submit" disabled={renaming || !renameDraft.trim()} className="text-rose-600 disabled:opacity-50">저장</button>
              <button type="button" disabled={renaming} onClick={() => setRenamingId(null)}>취소</button>
            </form>
          ) : (
            <button key={subject.id} type="button" onClick={() => { setRenamingId(subject.id); setRenameDraft(subject.name); }} className="rounded-lg border border-gray-200 px-3 py-2 text-xs dark:border-slate-600">
              {subject.name} · 이름 변경
            </button>
          ))}
          {!subjects.length && <p className="text-xs text-gray-500">아래 과목 선택에서 새 과목을 만들 수 있습니다.</p>}
        </div>
      </details>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-gray-500">
          할 일 검색
          <input value={search} placeholder="예: 블록체인" onChange={event => { setSearch(event.target.value); resetSelection(); }} className={inputClass} disabled={saving} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          현재 과목
          <select value={subjectFilter} onChange={event => { setSubjectFilter(event.target.value); resetSelection(); }} className={inputClass} disabled={saving}>
            <option value="all">모든 과목</option>
            <option value="unclassified">미분류</option>
            {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">시작 공부일
          <input type="date" value={fromDate} max={toDate || undefined} onChange={event => { setFromDate(event.target.value); resetSelection(); }} className={inputClass} disabled={saving} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">종료 공부일
          <input type="date" value={toDate} min={fromDate || undefined} onChange={event => { setToDate(event.target.value); resetSelection(); }} className={inputClass} disabled={saving} />
        </label>
      </div>

      {(loadError || actionError || subjectError) && <p role="alert" className="text-sm text-red-600">{loadError || actionError || subjectError}</p>}
      {loadError && <button type="button" onClick={() => setRevision(value => value + 1)} className="text-sm text-rose-600">기록 다시 불러오기</button>}
      {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-800/70">
        <SubjectSelect subjects={subjects} value={targetSubject} onChange={setTargetSubject} onCreate={createSubject} disabled={saving || subjectsLoading} label="변경할 과목" />
        <button type="button" onClick={() => void classify()} disabled={!selected.size || saving || loading || !!loadError} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? '변경 중…' : targetSubject ? `선택 ${selected.size}개 과목 적용` : `선택 ${selected.size}개 미분류로 변경`}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">하루 경계는 오전 5시입니다. 나뉘어 저장된 한 번의 공부는 1개 기록으로 표시하고 함께 변경합니다. 날짜는 공부가 끝난 공부일 기준입니다.</p>

      {loading ? <p role="status" className="text-sm text-gray-500">전체 기록을 불러오는 중…</p> : !loadError && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>검색 결과 {filtered.length}개 · 표시 {visible.length}개 · 선택 {selected.size}개</span>
            <button type="button" disabled={saving || !visible.length} onClick={() => setSelected(previous => new Set([...previous, ...visible.map(record => record.key)]))} className="text-rose-600 disabled:opacity-40">표시된 기록 선택</button>
            <button type="button" disabled={saving || !selected.size} onClick={() => setSelected(new Set())} className="disabled:opacity-40">선택 해제</button>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {visible.map(record => (
              <li key={record.key}>
                <label className="flex cursor-pointer items-center gap-3 py-3 text-sm">
                  <input type="checkbox" checked={selected.has(record.key)} disabled={saving} aria-label={`${record.task || '작업 지정 없음'} 선택`} onChange={event => {
                    const checked = event.target.checked;
                    setSelected(previous => {
                      const next = new Set(previous);
                      if (checked) next.add(record.key); else next.delete(record.key);
                      return next;
                    });
                  }} className="accent-rose-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-gray-800 dark:text-gray-100">{record.task?.trim() || '작업 지정 없음'}</span>
                    <span className="mt-1 block text-xs text-gray-500">{format(getDayStart(new Date(record.created_at)), 'yyyy.MM.dd')} · {record.subjectIds.size > 1 ? '여러 과목' : record.subject_id ? subjectNames.get(record.subject_id) ?? '알 수 없는 과목' : '미분류'}</span>
                  </span>
                  <span className="whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-300">{Math.floor(record.duration / 3600)}h {Math.floor(record.duration % 3600 / 60)}m</span>
                </label>
              </li>
            ))}
          </ul>
          {!filtered.length && <p className="py-4 text-center text-sm text-gray-500">조건에 맞는 기록이 없습니다.</p>}
          {visible.length < filtered.length && <button type="button" disabled={saving} onClick={() => setVisibleCount(value => value + DISPLAY_SIZE)} className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 dark:border-slate-600 dark:text-gray-300">더 보기 ({filtered.length - visible.length}개 남음)</button>}
        </>
      )}
    </section>
  );
}
