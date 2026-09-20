'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDayStart } from '@/lib/dateUtils';
import { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } from '@/lib/studySubjects';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import SubjectManager from '@/components/subjects/SubjectManager';
import AppSelect from '@/components/ui/AppSelect';
import DatePicker from '@/components/ui/DatePicker';

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
export default function SubjectHistoryManager({ userId }: { userId: string | null }) {
  return userId ? <HistoryManager key={userId} userId={userId} /> : null;
}

function HistoryManager({ userId }: { userId: string }) {
  const { subjects, loading: subjectsLoading, error: subjectError, createSubject } = useStudySubjects(userId);
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

  return (
    <section aria-label="기존 기록 과목 정리" className="ui-panel-enter mt-4 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-rose-50 p-2.5 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300"><SlidersHorizontal size={18} aria-hidden="true" /></span>
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-white">기존 기록 과목 정리</h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">제목으로 기록을 찾고, 같은 과목으로 묶어보세요.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          할 일 검색
          <span className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} placeholder="예: 블록체인 복습" onChange={event => { setSearch(event.target.value); resetSelection(); }} className="ui-input h-10 w-full pl-9 pr-3 text-sm" disabled={saving} />
          </span>
        </label>
        <AppSelect label="현재 과목" value={subjectFilter} onValueChange={value => { setSubjectFilter(value); resetSelection(); }} disabled={saving}
          options={[{ value: 'all', label: '모든 과목' }, { value: 'unclassified', label: '미분류' }, ...subjects.map(subject => ({ value: subject.id, label: subject.name }))]} />
        <DatePicker label="시작 공부일" value={fromDate} max={toDate || undefined} disabled={saving} placeholder="처음부터" onChange={value => {
          if (value && toDate && value > toDate) return;
          setFromDate(value); resetSelection();
        }} />
        <DatePicker label="종료 공부일" value={toDate} min={fromDate || undefined} disabled={saving} placeholder="끝까지" onChange={value => {
          if (value && fromDate && value < fromDate) return;
          setToDate(value); resetSelection();
        }} />
      </div>

      {(loadError || actionError || subjectError) && <p role="alert" className="text-sm text-red-600">{loadError || actionError || subjectError}</p>}
      {loadError && <button type="button" onClick={() => setRevision(value => value + 1)} className="text-sm text-rose-600">기록 다시 불러오기</button>}
      {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

      <div className="flex flex-col gap-3 rounded-xl border border-rose-100/80 bg-rose-50/50 p-3 sm:flex-row sm:items-end dark:border-rose-900/30 dark:bg-rose-950/20">
        <div className="min-w-0 flex-1"><SubjectSelect subjects={subjects} value={targetSubject} onChange={setTargetSubject} onCreate={createSubject} disabled={saving || subjectsLoading} label="변경할 과목" /></div>
        <button type="button" onClick={() => void classify()} disabled={!selected.size || saving || loading || !!loadError} className="ui-button-primary ui-press h-10 shrink-0 px-4 text-sm font-semibold">
          {saving ? '변경 중…' : targetSubject ? `선택 ${selected.size}개 과목 적용` : `선택 ${selected.size}개 미분류로 변경`}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">공부 시간과 할 일 제목은 유지됩니다. 하루 경계는 오전 5시이며, 여러 날에 걸친 공부는 종료된 공부일에 하나로 표시하고 함께 변경합니다.</p>

      {loading ? <p role="status" className="text-sm text-gray-500">전체 기록을 불러오는 중…</p> : !loadError && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">검색 결과 {filtered.length}개 · 표시 {visible.length}개 · 선택 {selected.size}개</span>
            <div className="flex items-center gap-3">
              <button type="button" disabled={saving || !visible.length} onClick={() => setSelected(previous => new Set([...previous, ...visible.map(record => record.key)]))} className="ui-press font-medium text-rose-600 disabled:opacity-40 dark:text-rose-300">표시된 기록 선택</button>
              <button type="button" disabled={saving || !selected.size} onClick={() => setSelected(new Set())} className="ui-press disabled:opacity-40">선택 해제</button>
            </div>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/70">
            {visible.map(record => (
              <li key={record.key}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3.5 text-sm transition-colors ${selected.has(record.key) ? 'bg-rose-50/70 dark:bg-rose-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'}`}>
                  <input type="checkbox" checked={selected.has(record.key)} disabled={saving} aria-label={`${record.task || '작업 지정 없음'} 선택`} onChange={event => {
                    const checked = event.target.checked;
                    setSelected(previous => {
                      const next = new Set(previous);
                      if (checked) next.add(record.key); else next.delete(record.key);
                      return next;
                    });
                  }} className="h-4 w-4 shrink-0 accent-rose-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-gray-800 dark:text-gray-100">{record.task?.trim() || '작업 지정 없음'}</span>
                    <span className="mt-1 block text-xs text-gray-500">{format(getDayStart(new Date(record.created_at)), 'yyyy.MM.dd')} · {record.subjectIds.size > 1 ? '여러 과목' : record.subject_id ? subjectNames.get(record.subject_id) ?? '알 수 없는 과목' : '미분류'}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">{Math.floor(record.duration / 3600)}h {Math.floor(record.duration % 3600 / 60)}m</span>
                </label>
              </li>
            ))}
          </ul>
          {!filtered.length && <p className="py-4 text-center text-sm text-gray-500">조건에 맞는 기록이 없습니다.</p>}
          {visible.length < filtered.length && <button type="button" disabled={saving} onClick={() => setVisibleCount(value => value + DISPLAY_SIZE)} className="ui-button-secondary ui-press w-full py-2.5 text-sm">더 보기 ({filtered.length - visible.length}개 남음)</button>}
        </>
      )}
      <details className="group border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium">과목 관리<ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" /></summary>
        <div className="ui-panel-enter mt-4"><SubjectManager userId={userId} compact /></div>
      </details>
    </section>
  );
}
