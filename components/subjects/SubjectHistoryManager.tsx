'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDayStart } from '@/lib/dateUtils';
import { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } from '@/lib/studySubjects';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import SubjectManager from '@/components/subjects/SubjectManager';
import AppSelect from '@/components/ui/AppSelect';
import DatePicker from '@/components/ui/DatePicker';
import { formatStudyDuration } from '@/components/profile/studyDuration';
import { cn } from '@/lib/utils';

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
const normalizeSearchText = (value: string) => value.replace(/\s+/g, '').toLocaleLowerCase();
// "블록체인으로", "영어로": 마지막 글자에 받침(ㄹ 제외)이 있으면 '으로'
const withRo = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const final = code % 28;
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
};
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
  // 과목 없이 저장된 기록부터 보여 준다. '모든 과목'으로 바꾸면 이미 분류한 기록도 다시 고를 수 있다.
  const [subjectFilter, setSubjectFilter] = useState('unclassified');
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
        if (!cancelled) setLoadError('기록을 불러오지 못했어요. 다시 시도해 주세요.');
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

  const filtered = useMemo(() => {
    const query = normalizeSearchText(search);
    return records.filter(record => {
      const studyDate = format(getDayStart(new Date(record.created_at)), 'yyyy-MM-dd');
      return normalizeSearchText(record.task ?? '').includes(query)
        && (subjectFilter === 'all' || record.subjectIds.has(subjectFilter === 'unclassified' ? null : subjectFilter))
        && (!fromDate || studyDate >= fromDate)
        && (!toDate || studyDate <= toDate);
    });
  }, [records, search, subjectFilter, fromDate, toDate]);

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
      setNotice(targetSubject ? `${selectedRecords.length}개 기록의 과목을 정리했어요.` : `${selectedRecords.length}개 기록을 미분류로 바꿨어요.`);
      notifyStudySubjectsChanged();
    } catch {
      if (mountedRef.current) setActionError('과목을 바꾸지 못했어요. 선택한 기록을 확인하고 다시 시도해 주세요.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const targetName = targetSubject ? subjectNames.get(targetSubject) ?? '지정된 과목' : '미분류';
  // 고른 기록이 있으면 저장할 내용을, 없으면 마지막 저장 결과를 알려 준다.
  const status = selected.size ? `선택한 기록 ${selected.size}개를 ${withRo(targetName)} 바꿔요.` : notice ?? '';

  return (
    <section aria-label="기존 기록 과목 정리" className="ui-panel-enter flex max-w-[720px] flex-col gap-4">
      <p className="m-0 text-[13px] text-ink-muted md:text-sm">
        {subjectFilter === 'unclassified'
          ? '과목 없이 저장된 기록이에요. 과목을 골라 두면 통계에 함께 잡혀요.'
          : '기록을 골라 과목을 바꿀 수 있어요. 제목으로 찾아 한 번에 묶어 보세요.'}
      </p>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-ink-muted">
          할 일 검색
          <span className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint" />
            <input value={search} placeholder="예: 블록체인 복습" onChange={event => { setSearch(event.target.value); resetSelection(); }} className="ui-input w-full pl-10 font-normal" disabled={saving} />
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

      {(loadError || actionError || subjectError) && <p role="alert" className="m-0 text-sm text-pomo-deep">{loadError || actionError || subjectError}</p>}
      {loadError && <button type="button" onClick={() => setRevision(value => value + 1)} className="ui-button-ghost -ml-3 self-start text-pomo">기록 다시 불러오기</button>}

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1"><SubjectSelect subjects={subjects} value={targetSubject} onChange={setTargetSubject} onCreate={createSubject} disabled={saving || subjectsLoading} label="변경할 과목" /></div>
          <button type="button" onClick={() => void classify()} disabled={!selected.size || saving || loading || !!loadError} className="ui-button-primary ui-press shrink-0 self-start rounded-tile px-5 sm:self-auto">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
        <p role="status" className="m-0 min-h-5 text-[13px] text-ink-muted">{status}</p>
        <p className="m-0 text-xs text-ink-subtle">공부 시간과 할 일 제목은 그대로예요. 하루는 오전 5시에 바뀌고, 여러 날에 걸친 공부는 끝난 공부일에 하나로 묶여 함께 바뀌어요.</p>
      </div>

      {loading ? <p role="status" className="m-0 text-sm text-ink-muted">전체 기록을 불러오는 중이에요…</p> : !loadError && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-ink-muted">
            <span>검색 결과 {filtered.length}개 · 표시 {visible.length}개 · 선택 {selected.size}개</span>
            <div className="-mr-2 flex items-center">
              <button type="button" disabled={saving || !visible.length} onClick={() => setSelected(previous => new Set([...previous, ...visible.map(record => record.key)]))} className="ui-button-ghost ui-press min-h-9 rounded-chip px-2 text-[13px] text-pomo">표시된 기록 선택</button>
              <button type="button" disabled={saving || !selected.size} onClick={() => setSelected(new Set())} className="ui-button-ghost ui-press min-h-9 rounded-chip px-2 text-[13px] text-ink-muted">선택 해제</button>
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {visible.map(record => (
              <li key={record.key}>
                <label className={cn('-mx-3 flex min-h-14 cursor-pointer items-center gap-3 rounded-tile px-3 py-2 transition-colors', selected.has(record.key) ? 'bg-pomo-tint/50' : 'hover:bg-hover')}>
                  <input type="checkbox" checked={selected.has(record.key)} disabled={saving} aria-label={`${record.task || '작업 지정 없음'} 선택`} onChange={event => {
                    const checked = event.target.checked;
                    setSelected(previous => {
                      const next = new Set(previous);
                      if (checked) next.add(record.key); else next.delete(record.key);
                      return next;
                    });
                  }} className="size-4 shrink-0 accent-pomo" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{record.task?.trim() || '작업 지정 없음'}</span>
                    <span className="block text-xs text-ink-subtle md:text-[13px]">{format(getDayStart(new Date(record.created_at)), 'yyyy.MM.dd')} · {record.subjectIds.size > 1 ? '여러 과목' : record.subject_id ? subjectNames.get(record.subject_id) ?? '알 수 없는 과목' : '미분류'}</span>
                  </span>
                  <span className="shrink-0 text-[13px] whitespace-nowrap text-ink-muted">{formatStudyDuration(record.duration)}</span>
                </label>
              </li>
            ))}
          </ul>
          {!filtered.length && <p className="m-0 py-4 text-sm text-ink-muted">조건에 맞는 기록이 없어요.</p>}
          {visible.length < filtered.length && <button type="button" disabled={saving} onClick={() => setVisibleCount(value => value + DISPLAY_SIZE)} className="ui-button-secondary ui-press mt-1 w-full rounded-tile">더 보기 ({filtered.length - visible.length}개 남음)</button>}
        </div>
      )}
      <details className="group">
        <summary className="-mx-3 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-control px-3 font-semibold hover:bg-hover [&::-webkit-details-marker]:hidden">과목 관리<ChevronDown size={16} aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
        <div className="ui-panel-enter pt-3"><SubjectManager userId={userId} compact /></div>
      </details>
    </section>
  );
}
