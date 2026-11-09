'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { isArchivedSubject, subjectNameKey, validateSubjectName, type StudySubject } from '@/lib/studySubjects';
import { cn } from '@/lib/utils';
import { useEntrance, usePlayOnce } from '@/components/ui/usePlayOnce';
import ConfirmModal from '@/components/ConfirmModal';

type SubjectManagerProps = {
  userId: string | null;
  legacyTasks?: string[];
  onLegacyImported?: (names: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  /** 작은 패널(공부 기록의 과목 관리)용. 화면 너비와 관계없이 모바일 크기로 그린다. */
  compact?: boolean;
  /** 설정 화면처럼 바깥에서 섹션 제목을 그리면 false */
  showHeading?: boolean;
  /** 로그아웃 상태 안내에 로그인 버튼을 붙인다. */
  onLogin?: () => void;
};

const DELETE_FAILED = '과목을 삭제하지 못했어요. 다시 시도해주세요.';
const ARCHIVE_FAILED = '과목을 보관하지 못했어요. 다시 시도해주세요.';
const RESTORE_FAILED = '과목을 다시 사용하지 못했어요. 다시 시도해주세요.';
const SAVE_FAILED = '과목을 저장하지 못했어요. 다시 시도해주세요.';

// 보관한 과목 칸은 최근에 보관한 순, 같은 시각이면 이름순.
const archivedTime = (subject: StudySubject) => {
  const time = Date.parse(subject.archived_at ?? '');
  return Number.isNaN(time) ? 0 : time;
};
const byRecentlyArchived = (a: StudySubject, b: StudySubject) => archivedTime(b) - archivedTime(a) || a.name.localeCompare(b.name, 'ko');

// 장기 과제의 과목 항목(과목 그룹)이 쓰는 과목은 서버가 지우지 않는다. 장기 과제 이름은 앞의 둘까지만 보인다.
function subjectInUseMessage(projects: string[]) {
  const names = projects.map((project) => project.trim()).filter(Boolean);
  const action = '계획 화면에서 과목 항목을 먼저 삭제해주세요.';
  if (!names.length) return `장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. ${action}`;
  const shown = names.slice(0, 2).map((name) => `‘${name}’`).join(', ');
  const rest = names.length - 2;
  return `${shown}${rest > 0 ? ` 외 ${rest}개` : ''} 장기 과제의 과목 항목으로 쓰고 있어 삭제할 수 없어요. ${action}`;
}

type SubjectAction = 'rename' | 'archive' | 'restore' | 'delete';
/**
 * 보관·다시 사용·삭제가 끝난 뒤 포커스를 둘 곳: 사용 중 목록(active)이나 보관한 과목 칸(archived)에서 그 과목 줄의 버튼.
 * 줄이 없으면 사용 중 목록, 보관한 과목 칸이면 그 칸의 요약(칸이 사라졌으면 사용 중 목록).
 */
type FocusRequest = { list: 'active' | 'archived'; subjectId: string | null; control: SubjectAction };

export default function SubjectManager(props: SubjectManagerProps) {
  if (!props.userId) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="m-0 text-sm text-ink-muted">로그인하면 과목을 만들고 모든 공부 화면에서 함께 사용할 수 있어요.</p>
        {Boolean(props.legacyTasks?.length) && <p className="m-0 text-[13px] text-ink-subtle">이 기기에 저장된 이전 작업 목록은 그대로 보관돼요.</p>}
        {props.onLogin && <button type="button" onClick={props.onLogin} className="ui-button-secondary mt-1 min-h-11 rounded-control px-4">로그인</button>}
      </div>
    );
  }
  return <OwnedSubjectManager key={props.userId} {...props} userId={props.userId} />;
}

function OwnedSubjectManager({ userId, legacyTasks = [], onLegacyImported, onBusyChange, compact = false, showHeading = true }: SubjectManagerProps & { userId: string }) {
  const { subjects, loading, error, refresh, createSubject, renameSubject, deleteSubject, archiveSubject, restoreSubject } = useStudySubjects(userId);
  // 사용 중 목록에는 보관하지 않은 과목만, 보관한 과목은 아래 접힌 칸에 둔다.
  const activeSubjects = subjects.filter((subject) => !isArchivedSubject(subject));
  const archivedSubjects = subjects.filter((subject) => isArchivedSubject(subject)).sort(byRecentlyArchived);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // 방금 추가한 과목 줄만 나타난다(다음 동작에서 비운다).
  const [addedId, setAddedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedLegacy, setSelectedLegacy] = useState<Set<string>>(() => new Set());
  const [legacyDrafts, setLegacyDrafts] = useState<Map<string, string>>(() => new Map());
  // 확인 창에서 지우려는 과목
  const [deleteTarget, setDeleteTarget] = useState<StudySubject | null>(null);
  const scopeRef = useRef<{ active: boolean; pending: boolean }>({ active: false, pending: false });
  const listRef = useRef<HTMLUListElement>(null);
  const archivedListRef = useRef<HTMLUListElement>(null);
  const archivedSummaryRef = useRef<HTMLElement>(null);
  const focusRequest = useRef<FocusRequest | null>(null);
  // 방금 추가한 줄의 등장과 이름 편집기의 나타남은 한 번 돈 뒤 뗀다(docs §8). 남겨 두면 다시 읽어 순서가 바뀔 때
  // (화면은 한국어 순서로 넣고 서버는 코드 순서로 돌려준다) 옮겨진 줄에서 다시 돈다.
  usePlayOnce(addedId, listRef, (played) => setAddedId((current) => (current === played ? null : current)));
  const editEntering = useEntrance(editingId, listRef);
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
    // 목록이 보이는 동안의 다시 불러오기(예: 확인 창이 열린 사이 다른 화면의 변경)는 막지 않는다. 서버가 기준이다.
    if (!scope.active || scope.pending || (loading && subjects.length === 0)) return null;
    scope.pending = true;
    setBusy(true);
    busyCallback.current?.(true);
    setLocalError(null);
    setMessage(null);
    setAddedId(null);
    return scope;
  };
  const finish = (scope: { active: boolean; pending: boolean }) => {
    if (!scope.active) return;
    scope.pending = false;
    setBusy(false);
    busyCallback.current?.(false);
  };

  // 누른 버튼은 바쁜 동안 비활성이라 포커스가 머물 수 없고(확인 창이 돌려준 포커스도 같다), 보관·다시 사용·삭제한 줄은
  // 그 버튼과 함께 목록에서 사라진다. 그대로 두면 포커스가 body로 빠지므로, 끝난 뒤 이웃 줄(실패면 같은 줄)의 버튼이나
  // 목록·보관한 과목 칸의 요약으로 옮긴다. 다시 불러오기 동안 비활성인 버튼(삭제)으로는 옮기지 않고 그 줄의 다른 버튼을 고른다.
  // 글자 입력칸으로는 옮기지 않는다(모바일 키보드가 뜬다). 그동안 사용자가 다른 곳에 포커스를 뒀으면 빼앗지 않는다.
  useLayoutEffect(() => {
    const request = focusRequest.current;
    if (!request || busy) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected || active.closest('[inert]') !== null
      || (active instanceof HTMLButtonElement && active.disabled);
    if (!lost) { focusRequest.current = null; return; }
    const list = listRef.current;
    // 마지막 과목을 지워 목록을 다시 불러오는 동안은 목록 대신 안내 문구가 있다. 목록이 다시 그려지면 옮긴다.
    if (!list) return;
    focusRequest.current = null;
    const rows = request.list === 'archived' ? archivedListRef.current : list;
    const row = rows ? Array.from(rows.querySelectorAll<HTMLElement>('[data-subject-id]')).find((item) => item.dataset.subjectId === request.subjectId) : undefined;
    const controls = row ? Array.from(row.querySelectorAll<HTMLButtonElement>('button[data-subject-action]')).filter((button) => !button.disabled) : [];
    const fallback = request.list === 'archived' ? archivedSummaryRef.current ?? list : list;
    (controls.find((button) => button.dataset.subjectAction === request.control) ?? controls[0] ?? fallback).focus();
  });

  // 보관과 다시 사용은 되돌릴 수 있어 확인 창 없이 바로 한다. 과목 ID·이름과 그 과목을 가리키는 기록은 바뀌지 않는다.
  const archive = async (subject: StudySubject) => {
    const scope = begin();
    if (!scope) return;
    // 보관한 줄 대신 포커스를 받을 줄: 사용 중 목록의 다음 줄, 마지막 줄이었으면 이전 줄
    const index = activeSubjects.findIndex((item) => item.id === subject.id);
    const neighbor = index < 0 ? null : activeSubjects[index + 1] ?? activeSubjects[index - 1] ?? null;
    try {
      const archived = await archiveSubject(subject.id);
      if (!scope.active) return;
      if (archived) {
        focusRequest.current = { list: 'active', subjectId: neighbor?.id ?? null, control: 'archive' };
        setMessage(`‘${subject.name}’ 과목을 보관했어요. 기록과 통계에는 그대로 남아요.`);
        return;
      }
      focusRequest.current = { list: 'active', subjectId: subject.id, control: 'archive' };
      setLocalError(ARCHIVE_FAILED);
    } catch {
      if (!scope.active) return;
      focusRequest.current = { list: 'active', subjectId: subject.id, control: 'archive' };
      setLocalError(ARCHIVE_FAILED);
    } finally { finish(scope); }
  };
  const restore = async (subject: StudySubject) => {
    const scope = begin();
    if (!scope) return;
    try {
      const restored = await restoreSubject(subject.id);
      if (!scope.active) return;
      if (restored) {
        // 사용 중 목록으로 돌아간 줄은 방금 추가한 줄처럼 한 번 나타나고, 포커스도 그 줄로 간다.
        setAddedId(subject.id);
        focusRequest.current = { list: 'active', subjectId: subject.id, control: 'archive' };
        setMessage(`‘${subject.name}’ 과목을 다시 사용해요.`);
        return;
      }
      focusRequest.current = { list: 'archived', subjectId: subject.id, control: 'restore' };
      setLocalError(RESTORE_FAILED);
    } catch {
      if (!scope.active) return;
      focusRequest.current = { list: 'archived', subjectId: subject.id, control: 'restore' };
      setLocalError(RESTORE_FAILED);
    } finally { finish(scope); }
  };
  // 삭제는 보관한 과목 칸에서만 한다.
  const removeSubject = async (subject: StudySubject) => {
    const scope = begin();
    if (!scope) return;
    // 지운 줄 대신 포커스를 받을 줄: 보관한 과목 칸의 다음 줄, 마지막 줄이었으면 이전 줄
    const index = archivedSubjects.findIndex((item) => item.id === subject.id);
    const neighbor = index < 0 ? null : archivedSubjects[index + 1] ?? archivedSubjects[index - 1] ?? null;
    try {
      const result = await deleteSubject(subject.id);
      if (!scope.active) return;
      if (result.status === 'deleted') {
        // 삭제 버튼은 곧바로 시작되는 다시 불러오기 동안 비활성이라 이웃 줄의 다시 사용 버튼으로 옮긴다.
        focusRequest.current = { list: 'archived', subjectId: neighbor?.id ?? null, control: 'restore' };
        setMessage(`‘${subject.name}’ 과목을 삭제했어요. 공부 기록은 미분류로 남아요.`);
        return;
      }
      focusRequest.current = { list: 'archived', subjectId: subject.id, control: 'delete' };
      setLocalError(result.status === 'in_use_by_subject_group' ? subjectInUseMessage(result.projects) : DELETE_FAILED);
    } catch {
      if (!scope.active) return;
      focusRequest.current = { list: 'archived', subjectId: subject.id, control: 'delete' };
      setLocalError(DELETE_FAILED);
    } finally { finish(scope); }
  };
  const saveName = async () => {
    const renaming = editingId;
    const name = renaming ? editName : draft;
    const validation = validateSubjectName(name);
    if (validation) { setLocalError(validation); return; }
    const key = subjectNameKey(name);
    const same = subjects.filter((subject) => subject.id !== renaming && subjectNameKey(subject.name) === key);
    if (same.some((subject) => !isArchivedSubject(subject))) {
      setLocalError('이미 있는 과목이에요.');
      return;
    }
    // 보관한 과목과 같은 이름: 다른 과목의 이름으로는 바꾸지 않고, 추가는 새로 만들지 않고 그 과목을 다시 사용한다(기록이 이어진다).
    const archived = same[0] ?? null;
    if (archived && renaming) {
      setLocalError('보관한 과목에 같은 이름이 있어요.');
      return;
    }
    const scope = begin();
    if (!scope) return;
    try {
      if (archived) {
        // 이름으로 고른 다시 사용이라 저장된 이름을 함께 보낸다. 그사이 다른 기기에서 이름이 바뀌었으면 바꾸지 않는다(실패, 목록은 다시 읽힌다).
        const restored = await restoreSubject(archived.id, archived.name);
        if (!scope.active) return;
        if (!restored) { setLocalError(SAVE_FAILED); return; }
        setAddedId(archived.id);
        setDraft('');
        setMessage(`보관한 ‘${archived.name}’ 과목을 다시 사용해요. 이전 기록과 이어져요.`);
        return;
      }
      const saved = renaming ? await renameSubject(renaming, name.trim()) : await createSubject(name.trim());
      if (!scope.active) return;
      if (!saved) { setLocalError(SAVE_FAILED); return; }
      if (saved !== true) setAddedId(saved.id);
      setDraft('');
      setEditingId(null);
      setMessage(renaming ? '과목 이름을 바꿨어요. 기록은 그대로예요.' : `${name.trim()} 과목을 추가했어요.`);
    } catch {
      if (scope.active) setLocalError(SAVE_FAILED);
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
    const known = new Map(subjects.map((subject) => [subjectNameKey(subject.name), subject]));
    const imported: string[] = [];
    try {
      for (const original of names) {
        const name = (legacyDrafts.get(original) ?? original).trim();
        const existing = known.get(subjectNameKey(name));
        if (!existing) {
          const created = await createSubject(name);
          if (!scope.active) return;
          if (!created) continue;
          known.set(subjectNameKey(created.name), created);
        } else if (isArchivedSubject(existing)) {
          // 보관한 과목과 같은 이름이면 새로 만들지 않고 그 과목을 다시 사용한다(저장된 이름이 그대로일 때만). 실패한 항목은 남는다.
          const restored = await restoreSubject(existing.id, existing.name);
          if (!scope.active) return;
          if (!restored) continue;
          known.set(subjectNameKey(existing.name), { ...existing, archived_at: null });
        }
        imported.push(original);
      }
      if (!scope.active) return;
      if (imported.length) {
        onLegacyImported?.(imported);
        setSelectedLegacy((current) => new Set([...current].filter((name) => !imported.includes(name))));
        setMessage(`${imported.length}개 항목을 과목으로 가져왔어요.`);
      }
      if (imported.length < names.length) setLocalError('일부 항목을 가져오지 못했어요. 남은 항목은 보관되며 다시 시도할 수 있어요.');
    } catch {
      if (scope.active) {
        if (imported.length) onLegacyImported?.(imported);
        setLocalError('일부 항목을 가져오지 못했어요. 남은 항목은 보관되며 다시 시도할 수 있어요.');
      }
    } finally { finish(scope); }
  };

  // 설정 화면(md 이상)은 보드의 데스크톱 크기, compact는 늘 모바일 크기.
  const wide = !compact;
  const rowControl = cn('min-h-[42px]', wide && 'md:min-h-11');
  // 사용 중 목록과 보관한 과목 칸의 줄은 높이·간격·말줄임이 같다.
  const rowClass = cn('-mx-2.5 flex min-h-[52px] min-w-0 items-center gap-2 rounded-control px-2.5 py-0.5', wide && 'md:-mx-3 md:min-h-[60px] md:gap-3 md:rounded-tile md:px-3 md:py-1');
  const iconButton = "ui-icon-button text-ink-muted before:absolute before:-inset-0.5 before:content-['']";
  // 삭제는 다시 불러오는 동안에도 막는다(지금 규칙). 보관·다시 사용은 되돌릴 수 있고 서버가 기준이라 바쁠 때와 이름 편집 중에만 막는다.
  const toggleDisabled = busy || Boolean(editingId);

  return (
    <div className={cn('flex flex-col gap-2.5', wide && 'md:gap-3')}>
      {showHeading && <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold">과목 관리</h3>
        <p className="m-0 text-[13px] text-ink-muted">할 일, 타이머, 공부 기록에서 같은 과목을 사용해요. 이름을 바꾸거나 보관해도 기록은 유지돼요.</p>
      </div>}
      {loading && subjects.length === 0 ? <p role="status" className="m-0 text-sm text-ink-muted">과목을 불러오는 중…</p> : (
        <ul ref={listRef} tabIndex={-1} className="m-0 flex list-none flex-col gap-0.5 p-0 outline-none">
          {/* 이름을 고치기 시작하면 줄 내용이 편집기로 살짝 바뀐다. */}
          {activeSubjects.map((subject) => <li key={subject.id} data-subject-id={subject.id} className={cn(rowClass, editingId === subject.id ? editEntering && 'animate-fade-in' : subject.id === addedId && 'animate-fade-up')}>
            {editingId === subject.id ? <>
              <input aria-label="과목 이름 수정" value={editName} maxLength={80} disabled={busy} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveName(); } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditingId(null); } }} className={cn('ui-input flex-1 px-3 font-semibold', rowControl, wide && 'md:px-3.5')} autoFocus />
              <button type="button" aria-label="과목 이름 저장" disabled={busy} onClick={() => { void saveName(); }} className={cn('ui-button-primary ui-press shrink-0 px-3.5', rowControl, wide && 'md:px-4')}>저장</button>
              <button type="button" aria-label="과목 이름 수정 취소" disabled={busy} onClick={() => setEditingId(null)} className={cn('ui-button-ghost shrink-0 px-2.5', rowControl, wide && 'md:px-3')}>취소</button>
            </> : <>
              <span className="min-w-0 flex-1 truncate font-semibold">{subject.name}</span>
              <button type="button" data-subject-action="rename" aria-label={`${subject.name} 이름 변경`} disabled={busy} onClick={() => { setEditingId(subject.id); setEditName(subject.name); setLocalError(null); setMessage(null); setAddedId(null); }} className={iconButton}><Pencil aria-hidden="true" size={17} strokeWidth={2} /></button>
              <button type="button" data-subject-action="archive" aria-label={`${subject.name} 보관`} disabled={toggleDisabled} onClick={() => { void archive(subject); }} className={iconButton}><Archive aria-hidden="true" size={17} strokeWidth={2} /></button>
            </>}
          </li>)}
          {!activeSubjects.length && <li className="py-1 text-sm text-ink-muted">{archivedSubjects.length ? '사용 중인 과목이 없어요. 새 과목을 추가하거나 보관한 과목을 다시 사용해보세요.' : '아직 과목이 없어요. 자주 공부하는 과목을 추가해보세요.'}</li>}
        </ul>
      )}
      {/* 결과 줄: 모바일은 추가 줄 아래에 늘 자리를 잡아 두고(보드의 18px), 데스크톱은 추가 버튼 오른쪽에 붙는다.
          데스크톱의 입력칸은 360px을 지키고 긴 결과 문구(예: 과목 삭제 거부 안내)는 그 오른쪽에서 줄을 바꾼다. */}
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2.5', wide && 'md:flex-nowrap md:gap-2')}>
        <input aria-label="새 과목 이름" placeholder="예: 데이터베이스" value={draft} maxLength={80} disabled={busy || Boolean(editingId)} onChange={(event) => { setDraft(event.target.value); setMessage(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveName(); } }} className={cn('ui-input flex-1', wide && 'md:min-h-12 md:max-w-[360px] md:shrink-0 md:basis-[360px] md:rounded-tile md:px-4')} />
        <button type="button" disabled={busy || loading || Boolean(editingId) || !draft.trim()} onClick={() => { void saveName(); }} className={cn('ui-button-primary ui-press shrink-0 px-3.5', wide && 'md:min-h-12 md:rounded-tile md:px-[18px]')}>추가</button>
        {(wide || message || localError) && (
          <div className={cn('min-h-[18px] min-w-0 basis-full text-xs', wide && 'md:min-h-0 md:basis-auto md:text-[13px]')}>
            <p role="status" className="m-0 text-ink-muted">{message ? <span key={message} className="animate-fade-in">{message}</span> : null}</p>
            {localError && <p role="alert" className="m-0 text-pomo-deep">{localError}</p>}
          </div>
        )}
      </div>
      {/* 이름 있는 그룹(group/archived): 공부 기록의 과목 관리 패널은 바깥의 열린 details.group 안에 있어 그냥 group-open이면 늘 돌아간다. */}
      {archivedSubjects.length > 0 && <details className="group/archived">
        <summary ref={archivedSummaryRef} className="-mx-2.5 flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold hover:bg-hover [&::-webkit-details-marker]:hidden">보관한 과목 ({archivedSubjects.length})<ChevronDown aria-hidden="true" className="size-4 text-ink-muted transition-transform group-open/archived:rotate-180" /></summary>
        <div className="ui-panel-enter mt-2 flex flex-col gap-2">
          <p className="m-0 text-[13px] text-ink-muted">보관한 과목은 과목 선택 칸에 나오지 않아요. 공부 기록과 통계에는 이름이 그대로 남아요.</p>
          <ul ref={archivedListRef} aria-label="보관한 과목" className="m-0 flex list-none flex-col gap-0.5 p-0">
            {archivedSubjects.map((subject) => <li key={subject.id} data-subject-id={subject.id} className={rowClass}>
              {/* 보관 상태가 드러나게 이름을 한 단계 흐리게 한다. */}
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-muted">{subject.name}</span>
              <button type="button" data-subject-action="restore" aria-label={`${subject.name} 다시 사용`} disabled={toggleDisabled} onClick={() => { void restore(subject); }} className={iconButton}><ArchiveRestore aria-hidden="true" size={17} strokeWidth={2} /></button>
              <button type="button" data-subject-action="delete" aria-label={`${subject.name} 삭제`} disabled={busy || loading || Boolean(editingId)} onClick={() => setDeleteTarget(subject)} className={cn(iconButton, 'enabled:hover:text-pomo-deep')}><Trash2 aria-hidden="true" size={17} strokeWidth={2} /></button>
            </li>)}
          </ul>
        </div>
      </details>}
      {error && <div className="flex items-center gap-2 text-[13px] text-pomo-deep"><p role="alert" className="m-0">{error}</p><button type="button" disabled={busy} onClick={() => { void refresh(); }} className="font-semibold underline underline-offset-2">다시 불러오기</button></div>}
      {legacyTasks.length > 0 && <details className="group">
        <summary className="-mx-2.5 flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold hover:bg-hover [&::-webkit-details-marker]:hidden">이전 작업 목록 가져오기 ({legacyTasks.length})<ChevronDown aria-hidden="true" className="size-4 text-ink-muted transition-transform group-open:rotate-180" /></summary>
        <div className="ui-panel-enter mt-2 flex flex-col gap-3">
          <p className="m-0 text-[13px] text-ink-muted">과목으로 사용할 항목만 선택해주세요. 기존 공부 기록은 바뀌지 않아요.</p>
          {importableNames.map((original, index) => {
            const value = legacyDrafts.get(original) ?? original;
            const match = subjects.find((subject) => subjectNameKey(subject.name) === subjectNameKey(value));
            return <div key={original} className="flex items-start gap-3">
              <input type="checkbox" aria-label={`이전 항목 ${index + 1} 선택`} checked={selectedLegacy.has(original)} disabled={busy} onChange={(event) => setSelectedLegacy((current) => { const next = new Set(current); if (event.target.checked) next.add(original); else next.delete(original); return next; })} className="mt-3.5 size-4 shrink-0 accent-pomo" />
              <div className="min-w-0 flex-1"><input aria-label={`이전 항목 ${index + 1} 과목 이름`} value={value} disabled={busy} onChange={(event) => setLegacyDrafts((current) => new Map(current).set(original, event.target.value))} placeholder="과목 이름을 입력해주세요" className="ui-input w-full" />{match && <p className="m-0 mt-1 text-xs text-ink-subtle">{isArchivedSubject(match) ? '보관한 과목을 다시 사용해요.' : '이미 있는 과목으로 연결돼요.'}</p>}</div>
            </div>;
          })}
          {malformedCount > 0 && <p className="m-0 text-[13px] text-ink-muted">이름을 읽을 수 없는 항목 {malformedCount}개는 원래 설정에 보관돼요.</p>}
          <button type="button" disabled={busy || loading || selectedLegacy.size === 0} onClick={() => { void importSelected(); }} className="ui-button-secondary ui-press self-start rounded-control px-4 text-sm">{busy ? '가져오는 중…' : '선택 항목 가져오기'}</button>
        </div>
      </details>}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) void removeSubject(deleteTarget); }}
        title="과목을 삭제할까요?"
        message={`‘${deleteTarget?.name ?? ''}’ 과목을 삭제하면 되돌릴 수 없어요. 이 과목으로 공부한 시간은 그대로 남고, 이 과목이 지정된 공부 기록과 할 일·목표·장기 과제는 미분류로 바뀌어요.`}
        confirmText="삭제"
        confirmTone="danger"
      />
    </div>
  );
}
