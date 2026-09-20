'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, Pencil, Plus, X } from 'lucide-react';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { validateSubjectName } from '@/lib/studySubjects';

type SubjectManagerProps = {
  userId: string | null;
  legacyTasks?: string[];
  onLegacyImported?: (names: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  compact?: boolean;
};

const nameKey = (name: string) => name.trim().toLocaleLowerCase();
const inputClass = 'ui-input min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

export default function SubjectManager(props: SubjectManagerProps) {
  if (!props.userId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <p>로그인하면 과목을 만들고 모든 공부 화면에서 함께 사용할 수 있어요.</p>
        {Boolean(props.legacyTasks?.length) && <p className="mt-2 text-xs">이 기기에 저장된 이전 작업 목록은 그대로 보관됩니다.</p>}
      </div>
    );
  }
  return <OwnedSubjectManager key={props.userId} {...props} userId={props.userId} />;
}

function OwnedSubjectManager({ userId, legacyTasks = [], onLegacyImported, onBusyChange, compact = false }: SubjectManagerProps & { userId: string }) {
  const { subjects, loading, error, refresh, createSubject, renameSubject } = useStudySubjects(userId);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedLegacy, setSelectedLegacy] = useState<Set<string>>(() => new Set());
  const [legacyDrafts, setLegacyDrafts] = useState<Map<string, string>>(() => new Map());
  const scopeRef = useRef<{ active: boolean; pending: boolean }>({ active: false, pending: false });
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;

  useLayoutEffect(() => {
    const scope = { active: true, pending: false };
    scopeRef.current = scope;
    return () => {
      scope.active = false;
      if (scope.pending) busyCallback.current?.(false);
    };
  }, []);

  const begin = () => {
    const scope = scopeRef.current;
    if (!scope.active || scope.pending || loading) return null;
    scope.pending = true;
    setBusy(true);
    busyCallback.current?.(true);
    setLocalError(null);
    setMessage(null);
    return scope;
  };
  const finish = (scope: { active: boolean; pending: boolean }) => {
    if (!scope.active) return;
    scope.pending = false;
    setBusy(false);
    busyCallback.current?.(false);
  };
  const saveName = async () => {
    const name = editingId ? editName : draft;
    const validation = validateSubjectName(name);
    if (validation) { setLocalError(validation); return; }
    if (subjects.some((subject) => subject.id !== editingId && nameKey(subject.name) === nameKey(name))) {
      setLocalError('같은 이름의 과목이 이미 있습니다.');
      return;
    }
    const scope = begin();
    if (!scope) return;
    try {
      const saved = editingId ? await renameSubject(editingId, name.trim()) : await createSubject(name.trim());
      if (!scope.active) return;
      if (!saved) { setLocalError('과목을 저장하지 못했습니다. 다시 시도해주세요.'); return; }
      setDraft('');
      setEditingId(null);
      setMessage('과목을 저장했습니다.');
    } catch {
      if (scope.active) setLocalError('과목을 저장하지 못했습니다. 다시 시도해주세요.');
    } finally { finish(scope); }
  };

  // Use exact original strings as archive identities. Blank strings and unusual
  // values stay in settings until the user explicitly imports a valid draft.
  const importableNames = [...new Set(legacyTasks.filter((name) => typeof name === 'string'))];
  const malformedCount = legacyTasks.length - legacyTasks.filter((name) => typeof name === 'string').length;
  const importSelected = async () => {
    const names = importableNames.filter((name) => selectedLegacy.has(name));
    if (!names.length) return;
    const invalid = names.find((name) => validateSubjectName(legacyDrafts.get(name) ?? name));
    if (invalid !== undefined) { setLocalError('선택한 항목의 이름을 1~80자로 입력해주세요.'); return; }
    const scope = begin();
    if (!scope) return;
    const knownNames = new Set(subjects.map((subject) => nameKey(subject.name)));
    const imported: string[] = [];
    try {
      for (const original of names) {
        const name = (legacyDrafts.get(original) ?? original).trim();
        if (!knownNames.has(nameKey(name))) {
          const created = await createSubject(name);
          if (!scope.active) return;
          if (!created) continue;
          knownNames.add(nameKey(created.name));
        }
        imported.push(original);
      }
      if (!scope.active) return;
      if (imported.length) {
        onLegacyImported?.(imported);
        setSelectedLegacy((current) => new Set([...current].filter((name) => !imported.includes(name))));
        setMessage(`${imported.length}개 항목을 과목으로 가져왔습니다.`);
      }
      if (imported.length < names.length) setLocalError('일부 항목을 가져오지 못했습니다. 남은 항목은 보관되며 다시 시도할 수 있어요.');
    } catch {
      if (scope.active) {
        if (imported.length) onLegacyImported?.(imported);
        setLocalError('일부 항목을 가져오지 못했습니다. 남은 항목은 보관되며 다시 시도할 수 있어요.');
      }
    } finally { finish(scope); }
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"><BookOpen className="h-4 w-4 text-rose-500" />과목 관리</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">할 일, 타이머, 공부 기록에서 같은 과목을 사용해요. 이름을 바꿔도 기록은 유지됩니다.</p>
      </div>
      {loading && subjects.length === 0 ? <p role="status" className="text-sm text-slate-500">과목을 불러오는 중…</p> : (
        <ul className="space-y-2">
          {subjects.map((subject) => <li key={subject.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
            {editingId === subject.id ? <>
              <input aria-label="과목 이름 수정" value={editName} maxLength={80} disabled={busy} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveName(); } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditingId(null); } }} className={`${inputClass} flex-1`} autoFocus />
              <button type="button" aria-label="과목 이름 저장" disabled={busy} onClick={() => { void saveName(); }} className="ui-press rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-slate-700"><Check className="h-4 w-4" /></button>
              <button type="button" aria-label="과목 이름 수정 취소" disabled={busy} onClick={() => setEditingId(null)} className="ui-press rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button>
            </> : <>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{subject.name}</span>
              <button type="button" aria-label={`${subject.name} 이름 변경`} disabled={busy} onClick={() => { setEditingId(subject.id); setEditName(subject.name); setLocalError(null); }} className="ui-press rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-500 dark:hover:bg-slate-700"><Pencil className="h-4 w-4" /></button>
            </>}
          </li>)}
          {!subjects.length && <li className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">아직 과목이 없어요. 자주 공부하는 과목을 추가해보세요.</li>}
        </ul>
      )}
      <div className="flex min-w-0 gap-2">
        <input aria-label="새 과목 이름" placeholder="예: 데이터베이스" value={draft} maxLength={80} disabled={busy || Boolean(editingId)} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveName(); } }} className={`${inputClass} flex-1`} />
        <button type="button" disabled={busy || loading || Boolean(editingId) || !draft.trim()} onClick={() => { void saveName(); }} className="ui-button-primary ui-press flex shrink-0 items-center gap-1 rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />추가</button>
      </div>
      {error && <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300"><p role="alert">{error}</p><button type="button" disabled={busy} onClick={() => { void refresh(); }} className="underline">다시 불러오기</button></div>}
      {legacyTasks.length > 0 && <details className="group rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">이전 작업 목록 가져오기 ({legacyTasks.length})<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="ui-panel-enter mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">과목으로 사용할 항목만 선택해주세요. 기존 공부 기록은 바뀌지 않아요.</p>
          {importableNames.map((original, index) => {
            const value = legacyDrafts.get(original) ?? original;
            const exists = subjects.some((subject) => nameKey(subject.name) === nameKey(value));
            return <div key={original} className="flex items-start gap-2">
              <input type="checkbox" aria-label={`이전 항목 ${index + 1} 선택`} checked={selectedLegacy.has(original)} disabled={busy} onChange={(event) => setSelectedLegacy((current) => { const next = new Set(current); if (event.target.checked) next.add(original); else next.delete(original); return next; })} className="mt-3 h-4 w-4 shrink-0 accent-rose-500" />
              <div className="min-w-0 flex-1"><input aria-label={`이전 항목 ${index + 1} 과목 이름`} value={value} disabled={busy} onChange={(event) => setLegacyDrafts((current) => new Map(current).set(original, event.target.value))} placeholder="과목 이름을 입력해주세요" className={`${inputClass} w-full`} />{exists && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">이미 있는 과목으로 연결됩니다.</p>}</div>
            </div>;
          })}
          {malformedCount > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">이름을 읽을 수 없는 항목 {malformedCount}개는 원래 설정에 보관됩니다.</p>}
          <button type="button" disabled={busy || loading || selectedLegacy.size === 0} onClick={() => { void importSelected(); }} className="ui-button-secondary ui-press rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950">{busy ? '가져오는 중…' : '선택 항목 가져오기'}</button>
        </div>
      </details>}
      {localError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{localError}</p>}
      {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
    </div>
  );
}
