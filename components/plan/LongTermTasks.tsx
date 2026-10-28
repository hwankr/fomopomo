'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ConfirmModal from '@/components/ConfirmModal';
import toast from 'react-hot-toast';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { useSuggestedSubject } from '@/hooks/useSuggestedSubject';
import { notifyStudySubjectsChanged } from '@/lib/studySubjects';
import { supabase } from '@/lib/supabase';
import {
  fetchLongTermTaskDurations,
  getLongTermTaskChildren,
  getLongTermTaskProgress,
  getLongTermTaskRoots,
  toggleSubtaskCompletion,
  type LongTermSubtaskItem,
  type LongTermTaskItem,
  type LongTermTaskRow,
} from '@/lib/longTermTasks';
import { cn } from '@/lib/utils';
import { formatStudyTime, sortableTransition } from './planUi';
import { useEntrance, usePlayOnce } from '@/components/ui/usePlayOnce';

interface LongTermTasksProps {
  userId: string;
}

const TASK_SELECT = 'id, title, position, subject_id, parent_task_id';
const SUBTASK_SELECT = 'id, title, position, completed_at';

/**
 * 방금 한 동작과 그 대상. 그 항목에만 움직임을 한 번 붙인다(docs/design-system.md §8 새 항목, usePlayOnce).
 * task: 과제·과목 항목 추가, subtask: 세부 할 일 추가, toggle: 세부 할 일 완료(done)·완료 취소(진행 막대)
 */
type LongTermMotion =
  | { type: 'task' | 'subtask'; id: string }
  | { type: 'toggle'; id: string; done: boolean };

const normalizeTaskRows = (
  rows: LongTermTaskRow[] | null | undefined
): LongTermTaskItem[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subject_id: row.subject_id ?? null,
    parent_task_id: row.parent_task_id ?? null,
    position: row.position ?? 0,
    subtasks: (row.long_term_subtasks ?? [])
      .map((subtask) => ({ ...subtask, position: subtask.position ?? 0 }))
      .sort((a, b) => a.position - b.position),
  }));

export function computeReorderedSubtasks(
  subtasks: LongTermSubtaskItem[],
  activeId: string,
  overId: string
): LongTermSubtaskItem[] | null {
  if (activeId === overId) return null;

  const oldIndex = subtasks.findIndex((subtask) => subtask.id === activeId);
  const newIndex = subtasks.findIndex((subtask) => subtask.id === overId);
  if (oldIndex === -1 || newIndex === -1) return null;

  return arrayMove(subtasks, oldIndex, newIndex).map((subtask, index) => ({
    ...subtask,
    position: index,
  }));
}

export async function persistSubtaskPositions(
  subtasks: Array<Pick<LongTermSubtaskItem, 'id' | 'position'>>
): Promise<boolean> {
  try {
    const results = await Promise.all(
      subtasks.map((subtask) =>
        supabase
          .from('long_term_subtasks')
          .update({ position: subtask.position })
          .eq('id', subtask.id)
      )
    );

    const failed = results.find((result) => result.error);
    if (failed) {
      console.error('Error persisting subtask order:', failed.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error persisting subtask order:', error);
    return false;
  }
}

interface SortableSubtaskItemProps {
  subtask: LongTermSubtaskItem;
  /** 이 세부 할 일에서 방금 한 동작(없으면 null) */
  motion: 'add' | 'complete' | null;
  isTogglePending: boolean;
  toggleSubtask: (subtask: LongTermSubtaskItem) => void;
  updateSubtask: (subtaskId: string, title: string) => void;
  deleteSubtask: (subtaskId: string) => void;
}

function SortableSubtaskItem({
  subtask,
  motion,
  isTogglePending,
  toggleSubtask,
  updateSubtask,
  deleteSubtask,
}: SortableSubtaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(subtask.title);
  const editorRef = useRef<HTMLDivElement>(null);
  // 열릴 때만 한 번 떠오른다(열린 채로 행이 옮겨져도 다시 돌지 않는다).
  const editorEntering = useEntrance(isEditing, editorRef);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id, transition: sortableTransition() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCompleted = !!subtask.completed_at;

  const handleSave = () => {
    if (editedTitle.trim() && editedTitle.trim() !== subtask.title) {
      updateSubtask(subtask.id, editedTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedTitle(subtask.title);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSave();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative -mx-3 flex min-h-12 items-center gap-x-2 gap-y-1 rounded-tile px-3 py-1.5 transition-colors max-md:flex-wrap md:gap-x-2.5',
        isEditing ? 'flex-wrap bg-surface' : 'hover:bg-hover',
        isDragging && 'bg-white shadow-popover',
        motion === 'add' && 'animate-fade-up'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`${subtask.title} 순서 바꾸기`}
        // 모바일은 손가락으로 잡기 쉽게 44px 칸(아이콘은 그대로), 데스크톱은 행 왼쪽 여백에 띄운다.
        className="-ml-3 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-chip text-ink-faint hover:text-ink-muted active:cursor-grabbing md:absolute md:top-1/2 md:-left-4 md:ml-0 md:h-9 md:w-4 md:-translate-y-1/2 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </div>

      <button
        type="button"
        onClick={() => toggleSubtask(subtask)}
        disabled={isTogglePending}
        aria-pressed={isCompleted}
        aria-label={`${subtask.title} 완료`}
        className={cn('-mx-2 flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-wait md:-mx-1.5 md:size-9', isCompleted && 'ui-focus-ink')}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 items-center justify-center rounded-full border-[1.5px] transition-colors',
            isCompleted ? 'border-pomo bg-pomo text-white' : 'border-control text-transparent'
          )}
        >
          <Check className={cn('size-3', isCompleted && motion === 'complete' && 'animate-pop-in')} strokeWidth={3} />
        </span>
      </button>

      {isEditing ? (
        <div
          ref={editorRef}
          className={cn('flex min-w-0 flex-1 basis-[min(100%,14rem)] items-center gap-2', editorEntering && 'animate-fade-up')}
        >
          <input
            type="text"
            aria-label="세부 할 일 제목"
            value={editedTitle}
            onChange={(event) => setEditedTitle(event.target.value)}
            onKeyDown={handleKeyDown}
            className="ui-input min-h-11 min-w-0 flex-1 bg-white md:min-h-10"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            aria-label="세부 할 일 저장"
            className="ui-icon-button size-11 text-pomo md:size-9"
          >
            <Check aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="세부 할 일 수정 취소"
            className="ui-icon-button size-11 text-ink-muted md:size-9"
          >
            <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <span
          title={subtask.title}
          className={cn(
            'min-w-0 flex-1 text-[15px] font-medium break-words transition-colors max-md:line-clamp-2',
            isCompleted ? 'text-ink-muted line-through' : 'text-ink'
          )}
        >
          {subtask.title}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 max-md:-mr-3">
        <div className="flex items-center md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {!isEditing && (
            <button
              type="button"
              onClick={() => {
                // 실시간 갱신이나 실패 롤백으로 제목이 바뀌었을 수 있으므로
                // 편집을 열 때마다 현재 제목에서 초안을 다시 시작한다.
                setEditedTitle(subtask.title);
                setIsEditing(true);
              }}
              aria-label={`${subtask.title} 수정`}
              className="ui-icon-button size-11 text-ink-muted md:size-8"
            >
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </button>
          )}

          <button
            type="button"
            onClick={() => deleteSubtask(subtask.id)}
            aria-label={`${subtask.title} 삭제`}
            className="ui-icon-button size-11 text-ink-muted hover:text-pomo-deep md:size-8"
          >
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* 데스크톱은 행 오른쪽 끝, 모바일은 제목 아래 줄(제목 시작선에 맞춘다) */}
      {!isEditing && subtask.completed_at ? (
        <span
          className={cn(
            'text-xs whitespace-nowrap text-ink-subtle max-md:-mt-2 max-md:basis-full max-md:pb-1 max-md:pl-[76px]',
            motion === 'complete' && 'animate-fade-in'
          )}
        >
          {format(new Date(subtask.completed_at), 'M월 d일')} 완료
        </span>
      ) : null}
    </li>
  );
}

export default function LongTermTasks({ userId }: LongTermTasksProps) {
  const { subjects, createSubject } = useStudySubjects(userId);
  const [tasks, setTasks] = useState<LongTermTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const { subjectId: newSubjectId, selectSubject, resetSubject, isAutomatic } =
    useSuggestedSubject(newTaskTitle, subjects);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(
    null
  );
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedSubjectId, setEditedSubjectId] = useState<string | null>(null);
  const [addingSubtaskTaskId, setAddingSubtaskTaskId] = useState<string | null>(
    null
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubjectTaskId, setAddingSubjectTaskId] = useState<string | null>(null);
  const [newGroupSubjectId, setNewGroupSubjectId] = useState<string | null>(null);
  const [subjectGroupError, setSubjectGroupError] = useState<string | null>(null);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const pendingSubjectRef = useRef(false);
  const [collapsedSubjectIds, setCollapsedSubjectIds] = useState<Set<string>>(() => new Set());
  const [motion, setMotion] = useState<LongTermMotion | null>(null);
  // 사용자가 방금 펼친 과목 항목(그 내용만 떠오른다. 처음 그릴 때 펼쳐져 있는 항목은 그대로)
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const subtaskFormRef = useRef<HTMLFormElement>(null);
  const subjectFormRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // 방금 동작의 움직임(등장·팝·진행 막대 전환)은 한 번 돈 뒤 뗀다. 남겨 두면 행이 옮겨지거나 탭을 다시 열 때,
  // 또는 같은 과제의 다음 실시간 변경에서 다시 움직인다.
  usePlayOnce(motion, rootRef, (played) => setMotion((current) => (current === played ? null : current)));
  usePlayOnce(expandedSubjectId, rootRef, (played) => setExpandedSubjectId((current) => (current === played ? null : current)));
  const formEntering = useEntrance(isAdding, formRef);
  const subtaskFormEntering = useEntrance(addingSubtaskTaskId, subtaskFormRef);
  const subjectFormEntering = useEntrance(addingSubjectTaskId, subjectFormRef);
  const editorEntering = useEntrance(editingTaskId, editorRef);
  // 요청 세대 번호. 늦게 도착한 이전 refetch 응답이 더 새로운 상태를
  // 덮어쓰지 못하도록 fetchTasks가 응답 적용 전에 최신 세대인지 확인한다.
  // 로컬 변경(생성·이름 변경·삭제·토글·정렬)을 커밋하는 쪽도 커밋 시점에
  // 세대를 올려 이미 진행 중이던 refetch를 무효화한다.
  const fetchEpochRef = useRef(0);
  // 세부 할 일별 완료 토글 직렬화: ref는 같은 틱의 재진입을 막고
  // state는 진행 중인 항목의 버튼을 비활성화한다.
  const pendingSubtaskIdsRef = useRef<Set<string>>(new Set());
  const [pendingSubtaskIds, setPendingSubtaskIds] = useState<Set<string>>(
    () => new Set()
  );

  // Owner identity and component lifetime are independent of read ordering.
  // A new object also makes A -> B -> A a new scope for old callbacks.
  const [ownerScope, setOwnerScope] = useState(() => ({ userId }));
  const currentOwnerScopeRef = useRef(ownerScope);
  const lifecycleGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  if (ownerScope.userId !== userId) {
    const nextScope = { userId };
    setOwnerScope(nextScope);
    currentOwnerScopeRef.current = nextScope;
    lifecycleGenerationRef.current += 1;
    fetchEpochRef.current += 1;
    setTasks([]);
    setLoading(true);
    setNewTaskTitle('');
    resetSubject();
    setIsAdding(false);
    setDeletingTaskId(null);
    setDeletingSubtaskId(null);
    setEditingTaskId(null);
    setEditedTitle('');
    setEditedSubjectId(null);
    setAddingSubtaskTaskId(null);
    setNewSubtaskTitle('');
    setAddingSubjectTaskId(null);
    setNewGroupSubjectId(null);
    setSubjectGroupError(null);
    setIsAddingSubject(false);
    pendingSubjectRef.current = false;
    setCollapsedSubjectIds(new Set());
    setMotion(null);
    setExpandedSubjectId(null);
    pendingSubtaskIdsRef.current = new Set();
    setPendingSubtaskIds(new Set());
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
    };
  }, []);

  const isCurrentScope = useCallback((generation: number) =>
    mountedRef.current &&
    currentOwnerScopeRef.current === ownerScope &&
    lifecycleGenerationRef.current === generation,
  [ownerScope]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchTasks = useCallback(async (generation = lifecycleGenerationRef.current) => {
    // Reject old subscription/error callbacks before they can issue a query
    // or invalidate a current owner's in-flight read.
    if (!isCurrentScope(generation)) return;
    const epoch = ++fetchEpochRef.current;

    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [taskResult, durationResult] = await Promise.allSettled([
      supabase
        .from('long_term_tasks')
        .select(`${TASK_SELECT}, long_term_subtasks(${SUBTASK_SELECT})`)
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('position', { ascending: true }),
      fetchLongTermTaskDurations(),
    ]);

    // 더 새로운 fetch나 로컬 변경 커밋이 세대를 올렸다면 이 응답은 이미 낡았다.
    if (!isCurrentScope(generation) || epoch !== fetchEpochRef.current) return;

    if (taskResult.status === 'rejected' || taskResult.value.error) {
      console.error('Error fetching long term tasks:', taskResult.status === 'rejected'
        ? taskResult.reason : taskResult.value.error);
      setLoading(false);
      return;
    }

    if (durationResult.status === 'rejected') {
      console.error('Error fetching long term task durations:', durationResult.reason);
    }
    setTasks(normalizeTaskRows(taskResult.value.data as LongTermTaskRow[]).map((task) => ({
      ...task,
      durationSeconds: durationResult.status === 'fulfilled'
        ? durationResult.value.get(task.id) ?? 0
        : undefined,
    })));
    setLoading(false);
  }, [userId, isCurrentScope]);

  useEffect(() => {
    const generation = lifecycleGenerationRef.current;
    const initialFetch = setTimeout(() => {
      void fetchTasks(generation);
    }, 0);

    const taskChannel = supabase
      .channel('long-term-task-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'long_term_tasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchTasks(generation);
        }
      )
      .subscribe();

    // 타이머 쪽 완료나 tasks.status 동기화 트리거가 갱신한 세부 할 일도
    // 플랜 화면에 즉시 반영되도록 별도 채널로 구독한다.
    const subtaskChannel = supabase
      .channel('long-term-subtask-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'long_term_subtasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchTasks(generation);
        }
      )
      .subscribe();

    const sessionChannel = supabase
      .channel('long-term-task-session-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchTasks(generation);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(initialFetch);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(subtaskChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [fetchTasks, userId]);

  const addTask = async (event: React.FormEvent) => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (!userId) {
      alert('장기 과제를 추가하려면 로그인해주세요.');
      return;
    }

    const roots = getLongTermTaskRoots(tasks);
    const maxPosition =
      roots.length > 0 ? Math.max(...roots.map((task) => task.position)) : -1;

    const { data, error } = await supabase
      .from('long_term_tasks')
      .insert({
        user_id: userId,
        title: newTaskTitle.trim(),
        subject_id: newSubjectId,
        parent_task_id: null,
        position: maxPosition + 1,
      })
      .select(TASK_SELECT)
      .single();

    if (!isCurrentScope(generation)) return;

    if (error) {
      console.error('Error adding long term task:', error);
      toast.error('장기 과제를 추가하지 못했습니다. 다시 시도해주세요.');
      return;
    }

    const createdRow = data as Pick<
      LongTermTaskRow,
      'id' | 'title' | 'position' | 'subject_id' | 'parent_task_id'
    >;
    const createdTask = { ...createdRow, subject_id: createdRow.subject_id ?? null, parent_task_id: createdRow.parent_task_id ?? null, position: createdRow.position ?? 0 };
    if (createdTask.subject_id) notifyStudySubjectsChanged();
    // 진행 중인 이전 refetch가 방금 만든 과제를 지우지 못하게 세대를 올리고,
    // 실시간 refetch가 이미 반영했을 수 있으니 id 기준으로 업서트한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.some((task) => task.id === createdTask.id)
        ? currentTasks.map((task) =>
            task.id === createdTask.id ? { ...task, ...createdTask } : task
          )
        : [...currentTasks, { ...createdTask, subtasks: [], durationSeconds: 0 }]
    );
    setMotion({ type: 'task', id: createdTask.id });
    setLoading(false);
    setNewTaskTitle('');
    resetSubject();
    setIsAdding(false);
  };

  const addSubjectGroup = async (event: React.FormEvent, parentId: string) => {
    event.preventDefault();
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation) || pendingSubjectRef.current || !userId) return;
    const subject = subjects.find((item) => item.id === newGroupSubjectId);
    const parent = tasks.find((task) => task.id === parentId && !task.parent_task_id);
    if (!subject || !parent) {
      setSubjectGroupError('추가할 과목을 선택해주세요.');
      return;
    }
    const children = getLongTermTaskChildren(tasks, parentId);
    if (children.some((task) => task.subject_id === subject.id)) {
      setSubjectGroupError('이미 이 장기 과제에 추가된 과목입니다.');
      return;
    }
    pendingSubjectRef.current = true;
    setIsAddingSubject(true);
    setSubjectGroupError(null);
    try {
      const { data, error } = await supabase
        .from('long_term_tasks')
        .insert({
          user_id: userId,
          title: subject.name,
          subject_id: subject.id,
          parent_task_id: parentId,
          position: children.length ? Math.max(...children.map((task) => task.position)) + 1 : 0,
        })
        .select(TASK_SELECT)
        .single();
      if (!isCurrentScope(generation)) return;
      if (error) {
        setSubjectGroupError(error.code === '23505'
          ? '이미 이 장기 과제에 추가된 과목입니다.'
          : '과목을 추가하지 못했습니다. 다시 시도해주세요.');
        return;
      }
      const created = normalizeTaskRows([{ ...data, long_term_subtasks: [] } as LongTermTaskRow])[0];
      fetchEpochRef.current += 1;
      setTasks((current) => {
        // A parent can be removed by a concurrent realtime update while this write settles.
        if (!current.some((task) => task.id === parentId)) return current;
        return current.some((task) => task.id === created.id)
          ? current.map((task) => task.id === created.id ? { ...task, ...created, subtasks: task.subtasks } : task)
          : [...current, { ...created, durationSeconds: 0 }];
      });
      setMotion({ type: 'task', id: created.id });
      setLoading(false);
      setAddingSubjectTaskId(null);
      setNewGroupSubjectId(null);
      notifyStudySubjectsChanged();
    } catch (error) {
      if (!isCurrentScope(generation)) return;
      console.error('Error adding long term subject group:', error);
      setSubjectGroupError('과목을 추가하지 못했습니다. 다시 시도해주세요.');
    } finally {
      if (isCurrentScope(generation)) {
        pendingSubjectRef.current = false;
        setIsAddingSubject(false);
      }
    }
  };

  const startEditing = (task: LongTermTaskItem) => {
    setEditingTaskId(task.id);
    setEditedTitle(task.title);
    setEditedSubjectId(task.subject_id);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditedTitle('');
    setEditedSubjectId(null);
  };

  const updateTask = async () => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    if (!editingTaskId || !editedTitle.trim()) {
      cancelEditing();
      return;
    }

    const nextTitle = editedTitle.trim();
    const originalTask = tasks.find((task) => task.id === editingTaskId);
    if (originalTask?.parent_task_id) {
      if (!editedSubjectId) {
        toast.error('과목 항목에는 과목을 지정해주세요.');
        return;
      }
      if (getLongTermTaskChildren(tasks, originalTask.parent_task_id).some(
        (task) => task.id !== originalTask.id && task.subject_id === editedSubjectId
      )) {
        toast.error('이미 이 장기 과제에 추가된 과목입니다.');
        return;
      }
    }
    if (originalTask?.title === nextTitle && originalTask.subject_id === editedSubjectId) {
      cancelEditing();
      return;
    }

    const taskId = editingTaskId;
    const nextSubjectId = editedSubjectId;
    // 이름 변경 전에 시작된 refetch가 커밋한 제목을 덮어쓰지 못하게 한다.
    // 세대가 오르면 그 refetch는 로딩도 못 끝내므로 여기서 로딩을 해제한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, title: nextTitle, subject_id: nextSubjectId } : task
      )
    );
    setLoading(false);
    cancelEditing();

    const { error } = await supabase
      .from('long_term_tasks')
      .update({ title: nextTitle, subject_id: nextSubjectId })
      .eq('id', taskId);

    if (!isCurrentScope(generation)) return;

    if (error) {
      console.error('Error updating long term task:', error);
      toast.error(error.code === '23505'
        ? '이미 이 장기 과제에 추가된 과목입니다.'
        : '장기 과제를 저장하지 못했습니다. 다시 시도해주세요.');
      void fetchTasks(generation);
    } else if (originalTask?.subject_id !== nextSubjectId) {
      notifyStudySubjectsChanged();
    }
  };

  const confirmDeleteTask = async () => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    if (!deletingTaskId) return;

    const taskId = deletingTaskId;
    const { error } = await supabase
      .from('long_term_tasks')
      .delete()
      .eq('id', taskId);

    if (!isCurrentScope(generation)) return;

    if (error) {
      console.error('Error deleting long term task:', error);
      toast.error('장기 과제를 삭제하지 못했습니다. 다시 시도해주세요.');
      return;
    }

    // 삭제 전에 시작된 refetch가 지운 과제를 되살리지 못하게 한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId && task.parent_task_id !== taskId)
    );
    setLoading(false);
  };

  const addSubtask = async (event: React.FormEvent, taskId: string) => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    event.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    if (!userId) {
      alert('세부 할 일을 추가하려면 로그인해주세요.');
      return;
    }

    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task) return;

    const maxPosition =
      task.subtasks.length > 0
        ? Math.max(...task.subtasks.map((subtask) => subtask.position))
        : -1;

    const { data, error } = await supabase
      .from('long_term_subtasks')
      .insert({
        user_id: userId,
        long_term_task_id: taskId,
        title: newSubtaskTitle.trim(),
        position: maxPosition + 1,
      })
      .select(SUBTASK_SELECT)
      .single();

    if (!isCurrentScope(generation)) return;

    if (error) {
      console.error('Error adding long term subtask:', error);
      return;
    }

    const createdSubtask = data as LongTermSubtaskItem;
    // 과제 추가와 동일하게 세대를 올려 낡은 refetch를 무효화하고 업서트한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.map((currentTask) => {
        if (currentTask.id !== taskId) return currentTask;
        const exists = currentTask.subtasks.some(
          (subtask) => subtask.id === createdSubtask.id
        );
        return {
          ...currentTask,
          subtasks: exists
            ? currentTask.subtasks.map((subtask) =>
                subtask.id === createdSubtask.id
                  ? { ...subtask, ...createdSubtask }
                  : subtask
              )
            : [...currentTask.subtasks, createdSubtask],
        };
      })
    );
    setMotion({ type: 'subtask', id: createdSubtask.id });
    setLoading(false);
    setNewSubtaskTitle('');
    setAddingSubtaskTaskId(null);
  };

  const toggleSubtask = async (subtask: LongTermSubtaskItem) => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    const subtaskId = subtask.id;
    // 같은 세부 할 일의 토글은 직렬화한다. 진행 중이면 이후 클릭은 무시되고
    // (버튼도 비활성화됨) 완료 후의 새 렌더에서 다시 토글할 수 있다.
    if (pendingSubtaskIdsRef.current.has(subtaskId)) return;
    pendingSubtaskIdsRef.current.add(subtaskId);
    setPendingSubtaskIds(new Set(pendingSubtaskIdsRef.current));

    const previousCompletedAt = subtask.completed_at;
    const nextCompletedAt = previousCompletedAt
      ? null
      : new Date().toISOString();

    // 토글 전에 시작된 refetch가 낙관적 완료 상태를 덮어쓰지 못하게 한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.map((task) => ({
        ...task,
        subtasks: task.subtasks.map((currentSubtask) =>
          currentSubtask.id === subtaskId
            ? { ...currentSubtask, completed_at: nextCompletedAt }
            : currentSubtask
        ),
      }))
    );
    setMotion({ type: 'toggle', id: subtaskId, done: nextCompletedAt !== null });
    setLoading(false);

    try {
      // 헬퍼가 풀 갱신에 이어 오늘 구체화된 일일 작업도 함께 동기화한다.
      // 낙관적으로 그린 값과 저장되는 값이 어긋나지 않도록 목표 상태를
      // 그대로 넘긴다.
      await toggleSubtaskCompletion(
        userId,
        { id: subtaskId, completed_at: previousCompletedAt },
        nextCompletedAt
      );
    } catch (error) {
      if (!isCurrentScope(generation)) return;
      console.error('Error toggling subtask completion:', error);
      // 우리가 그린 낙관적 값이 아직 남아 있을 때만 되돌린다. 그 사이
      // refetch나 다른 갱신이 상태를 차지했다면 롤백이 그것을 덮으면 안 된다.
      setTasks((currentTasks) =>
        currentTasks.map((task) => ({
          ...task,
          subtasks: task.subtasks.map((currentSubtask) =>
            currentSubtask.id === subtaskId &&
            currentSubtask.completed_at === nextCompletedAt
              ? { ...currentSubtask, completed_at: previousCompletedAt }
              : currentSubtask
          ),
        }))
      );
      void fetchTasks(generation);
    } finally {
      if (isCurrentScope(generation)) {
        pendingSubtaskIdsRef.current.delete(subtaskId);
        setPendingSubtaskIds(new Set(pendingSubtaskIdsRef.current));
      }
    }
  };

  const updateSubtask = async (subtaskId: string, title: string) => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    // 이름 변경 전에 시작된 refetch가 커밋한 제목을 덮어쓰지 못하게 한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.map((task) => ({
        ...task,
        subtasks: task.subtasks.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, title } : subtask
        ),
      }))
    );
    setLoading(false);

    const { error } = await supabase
      .from('long_term_subtasks')
      .update({ title })
      .eq('id', subtaskId);

    if (!isCurrentScope(generation)) return;

    if (error) {
      console.error('Error updating long term subtask:', error);
      void fetchTasks(generation);
    }
  };

  const confirmDeleteSubtask = async () => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    if (!deletingSubtaskId) return;

    const subtaskId = deletingSubtaskId;
    const { error } = await supabase
      .from('long_term_subtasks')
      .delete()
      .eq('id', subtaskId);

    if (!isCurrentScope(generation)) return;

    if (error) {
      console.error('Error deleting long term subtask:', error);
      return;
    }

    // 삭제 전에 시작된 refetch가 지운 세부 할 일을 되살리지 못하게 한다.
    fetchEpochRef.current += 1;
    setTasks((currentTasks) =>
      currentTasks.map((task) => ({
        ...task,
        subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId),
      }))
    );
    setLoading(false);
  };

  const handleSubtaskDragEnd = async (taskId: string, event: DragEndEvent) => {
    const generation = lifecycleGenerationRef.current;
    if (!isCurrentScope(generation)) return;
    const { active, over } = event;

    if (!over) return;

    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task) return;

    const reorderedSubtasks = computeReorderedSubtasks(
      task.subtasks,
      String(active.id),
      String(over.id)
    );
    if (!reorderedSubtasks) return;

    // 드롭 전에 시작된 refetch가 커밋한 순서를 덮어쓰지 못하게 한다.
    fetchEpochRef.current += 1;
    // 행을 옮기면 붙어 있던 등장·팝 애니메이션이 다시 돌므로 함께 뗀다.
    setMotion(null);
    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === taskId
          ? { ...currentTask, subtasks: reorderedSubtasks }
          : currentTask
      )
    );
    setLoading(false);

    // 위치 쓰기가 하나라도 실패하면 일부만 반영됐을 수 있으므로 서버
    // 순서를 다시 읽어 낙관적 순서를 되돌린다.
    const persisted = await persistSubtaskPositions(reorderedSubtasks);

    if (!isCurrentScope(generation)) return;
    if (!persisted) {
      void fetchTasks(generation);
    }
  };

  // 다른 곳(실시간 갱신, 실패 롤백)에서 지워지거나 완료 상태가 바뀌었으면 표시를 뗀다.
  // 그 뒤에 같은 상태가 다시 와도 움직이지 않는다.
  const motionTargetStands = motion?.type === 'task'
    ? tasks.some((task) => task.id === motion.id)
    : tasks.some((task) => task.subtasks.some((subtask) => subtask.id === motion?.id
      && (motion.type !== 'toggle' || Boolean(subtask.completed_at) === motion.done)));
  if (motion && !motionTargetStands) setMotion(null);

  const toggleSubjectGroup = (taskId: string) => {
    const expanding = collapsedSubjectIds.has(taskId);
    setExpandedSubjectId(expanding ? taskId : null);
    setCollapsedSubjectIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      void updateTask();
    } else if (event.key === 'Escape') {
      cancelEditing();
    }
  };

  const renderTask = (task: LongTermTaskItem, nested = false): React.ReactNode => {
    const { totalCount, completedCount } = getLongTermTaskProgress(task, tasks);
    const children = nested ? [] : getLongTermTaskChildren(tasks, task.id);
    const isCollapsed = nested && collapsedSubjectIds.has(task.id);
    const progressPercent =
      totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    const subjectName = subjects.find((subject) => subject.id === task.subject_id)?.name;
    // 과목 항목은 제목이 과목 이름과 같으면 과목을 다시 적지 않는다.
    const showSubject = !nested || subjectName !== task.title;
    const isEditing = editingTaskId === task.id;
    // 사용자가 이 과제(과목 항목)의 세부 할 일을 방금 완료·취소했을 때 그 한 번만 진행 막대가 움직인다.
    // 전환이 끝나면 표시를 떼므로 뒤이은 실시간 갱신은 바로 바뀐다.
    const progressMoves = motion?.type === 'toggle'
      && [task, ...children].some((item) => item.subtasks.some((subtask) => subtask.id === motion.id));

    return (
      <div
        key={task.id}
        data-long-term-task={task.id}
        className={cn('flex min-w-0 flex-col gap-1', motion?.type === 'task' && motion.id === task.id && 'animate-fade-up')}
      >
        <div
          className={cn(
            'group -mx-3 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-tile px-3 py-2 transition-colors',
            isEditing ? 'bg-surface' : 'hover:bg-hover'
          )}
        >
          {isEditing ? (
            <div
              ref={editorRef}
              className={cn(
                'flex min-w-0 flex-1 basis-[min(100%,18rem)] flex-wrap items-center gap-2 [&_[role=combobox]]:bg-white',
                editorEntering && 'animate-fade-up'
              )}
            >
              <input
                type="text"
                aria-label="장기 과제 제목"
                value={editedTitle}
                onChange={(event) =>
                  setEditedTitle(event.target.value)
                }
                onKeyDown={handleEditKeyDown}
                className="ui-input min-h-11 min-w-0 flex-[1_1_12rem] bg-white md:min-h-10"
                autoFocus
              />
              <div className="min-w-0 flex-[1_1_10rem]">
                <SubjectSelect subjects={subjects} value={editedSubjectId} onChange={setEditedSubjectId} onCreate={createSubject} compact />
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => void updateTask()}
                  aria-label="장기 과제 저장"
                  className="ui-icon-button size-11 text-pomo md:size-9"
                >
                  <Check aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  aria-label="장기 과제 수정 취소"
                  className="ui-icon-button size-11 text-ink-muted md:size-9"
                >
                  <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {nested ? (
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={`long-term-details-${task.id}`}
                  aria-label={`${task.title} ${isCollapsed ? '펼치기' : '접기'}`}
                  onClick={() => toggleSubjectGroup(task.id)}
                  className="-ml-1 flex min-h-11 max-w-full items-center gap-1 rounded-chip text-left text-[15px] font-bold md:min-h-0 md:items-start"
                >
                  <ChevronDown aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0 text-ink-muted transition-transform motion-reduce:transition-none', isCollapsed && '-rotate-90')} />
                  <span title={task.title} className="min-w-0 break-words">{task.title}</span>
                </button>
              ) : (
                <span title={task.title} className="text-base font-bold break-words max-md:line-clamp-2 md:text-[17px]">{task.title}</span>
              )}
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-ink-subtle">
                {showSubject ? (
                  <>
                    <span className="min-w-0 truncate">{subjectName ?? '미분류'}</span>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
                <span className="whitespace-nowrap">
                  {task.durationSeconds === undefined
                    ? '누적 시간 조회 실패'
                    : `누적 ${formatStudyTime(task.durationSeconds)}`}
                </span>
              </span>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className={cn('flex items-center', !isEditing && 'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100')}>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => startEditing(task)}
                  aria-label={`${task.title} 수정`}
                  className="ui-icon-button size-11 text-ink-muted md:size-8"
                >
                  <Pencil aria-hidden="true" className="size-4" strokeWidth={1.8} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setDeletingTaskId(task.id)}
                aria-label={`${task.title} 삭제`}
                className="ui-icon-button size-11 text-ink-muted hover:text-pomo-deep md:size-8"
              >
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              </button>
            </div>
            {totalCount > 0 && (
              <span className="min-w-9 pl-1 text-right text-[13px] font-semibold text-ink-muted">
                {`${completedCount}/${totalCount}`}
              </span>
            )}
          </div>
        </div>

        {totalCount > 0 && (
          <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-track">
            {/* 너비 대신 transform으로 채운다(왼쪽 끝은 막대가 가린다). */}
            <div
              className={cn('h-full w-full rounded-full bg-pomo', progressMoves && 'transition-transform duration-(--duration-emphasized)')}
              style={{ transform: `translateX(${progressPercent - 100}%)` }}
            />
          </div>
        )}

        <div
          id={`long-term-details-${task.id}`}
          hidden={isCollapsed}
          className={cn('min-w-0', nested && expandedSubjectId === task.id && 'animate-fade-up')}
        >
          {task.subtasks.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) =>
                void handleSubtaskDragEnd(task.id, event)
              }
            >
              <SortableContext
                items={task.subtasks.map((subtask) => subtask.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul aria-label={`${task.title} 세부 할 일`} className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
                  {task.subtasks.map((subtask) => (
                    <SortableSubtaskItem
                      key={subtask.id}
                      subtask={subtask}
                      motion={motion?.id !== subtask.id ? null
                        : motion.type === 'subtask' ? 'add'
                          : motion.type === 'toggle' && motion.done ? 'complete' : null}
                      isTogglePending={pendingSubtaskIds.has(
                        subtask.id
                      )}
                      toggleSubtask={(currentSubtask) =>
                        void toggleSubtask(currentSubtask)
                      }
                      updateSubtask={(subtaskId, title) =>
                        void updateSubtask(subtaskId, title)
                      }
                      deleteSubtask={(subtaskId) =>
                        setDeletingSubtaskId(subtaskId)
                      }
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {children.length > 0 && (
            <div className="mt-3 flex flex-col gap-4 pl-4 md:pl-5" role="group" aria-label={`${task.title} 과목`}>
              {children.map((child) => renderTask(child, true))}
            </div>
          )}

          <div className="mt-1 flex min-w-0 flex-col items-start gap-2">
            {addingSubtaskTaskId === task.id ? (
              <form
                ref={subtaskFormRef}
                onSubmit={(event) => void addSubtask(event, task.id)}
                className={cn('flex w-full min-w-0 flex-wrap items-center gap-2', subtaskFormEntering && 'animate-fade-up')}
              >
                <input
                  type="text"
                  aria-label="세부 할 일"
                  value={newSubtaskTitle}
                  onChange={(event) =>
                    setNewSubtaskTitle(event.target.value)
                  }
                  onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setAddingSubtaskTaskId(null); } }}
                  placeholder="세부 할 일을 입력하세요"
                  className="ui-input min-h-11 min-w-0 flex-[1_1_14rem] md:min-h-10"
                  autoFocus
                />
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingSubtaskTaskId(null)}
                    className="ui-button-ghost min-h-11 px-3 text-sm md:min-h-10"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="ui-button-primary ui-press min-h-11 px-4 text-sm md:min-h-10"
                  >
                    추가
                  </button>
                </div>
              </form>
            ) : null}

            {!nested && addingSubjectTaskId === task.id ? (
              <form
                ref={subjectFormRef}
                onSubmit={(event) => void addSubjectGroup(event, task.id)}
                className={cn(
                  'flex w-full min-w-0 flex-col gap-2 rounded-panel bg-surface p-4 [&_.ui-input]:bg-white [&_[role=combobox]]:bg-white',
                  subjectFormEntering && 'animate-fade-up'
                )}
              >
                <SubjectSelect
                  subjects={subjects}
                  value={newGroupSubjectId}
                  onChange={(id) => { setNewGroupSubjectId(id); setSubjectGroupError(null); }}
                  onCreate={createSubject}
                  disabled={isAddingSubject}
                  label="추가할 과목"
                />
                {subjectGroupError && <p role="alert" className="m-0 text-[13px] text-pomo-deep">{subjectGroupError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={isAddingSubject}
                    onClick={() => { setAddingSubjectTaskId(null); setNewGroupSubjectId(null); setSubjectGroupError(null); }}
                    className="ui-button-ghost min-h-11 px-3 text-sm md:min-h-10">취소</button>
                  <button type="submit" disabled={!newGroupSubjectId || isAddingSubject}
                    className="ui-button-primary ui-press min-h-11 px-4 text-sm md:min-h-10">
                    {isAddingSubject ? '추가 중…' : '과목 추가'}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="-ml-3 flex flex-wrap items-center">
              {addingSubtaskTaskId !== task.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setAddingSubtaskTaskId(task.id);
                    setNewSubtaskTitle('');
                  }}
                  className="ui-button-ghost min-h-11 gap-1.5 rounded-chip px-3 text-[13px] text-ink-muted hover:text-ink md:min-h-9"
                >
                  <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
                  세부 할 일 추가
                </button>
              ) : null}
              {!nested && addingSubjectTaskId !== task.id ? (
                <button type="button"
                  disabled={isAddingSubject}
                  onClick={() => { setAddingSubjectTaskId(task.id); setNewGroupSubjectId(null); setSubjectGroupError(null); }}
                  className="ui-button-ghost min-h-11 gap-1.5 rounded-chip px-3 text-[13px] text-ink-muted hover:text-ink md:min-h-9">
                  <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.2} />과목 추가
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-h-11 items-start justify-between gap-3 md:min-h-10">
        <p className="m-0 min-w-0 pt-2 text-sm text-ink-muted">
          이름만 등록하고 타이머에서 바로 공부하세요. 필요하면 과목과 세부 할 일을 추가할 수 있어요.
        </p>
        {!isAdding ? (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="ui-button-ghost ui-press min-h-11 shrink-0 gap-1.5 text-pomo md:min-h-10"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            장기 과제 추가
          </button>
        ) : null}
      </div>

      {isAdding ? (
        <form
          ref={formRef}
          onSubmit={addTask}
          className={cn(
            'flex min-w-0 flex-col gap-3 rounded-panel bg-surface p-4 md:px-5 md:py-[18px] [&_.ui-input]:bg-white [&_[role=combobox]]:bg-white',
            formEntering && 'animate-fade-up'
          )}
        >
          <input
            type="text"
            aria-label="장기 과제"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="장기 과제를 입력하세요 (예: 빅데이터분석기사)"
            className="ui-input min-h-[46px] w-full"
            autoFocus
          />
          <SubjectSelect subjects={subjects} value={newSubjectId} onChange={selectSubject} onCreate={createSubject} automatic={isAutomatic} onAutoSelect={resetSubject} />
          <p className="m-0 text-[13px] text-ink-subtle">과목은 선택 사항이에요. 직접 공부하거나 세부 할 일을 할 때 이 과목으로 기록돼요.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewTaskTitle('');
                resetSubject();
              }}
              className="ui-button-ghost min-h-[46px] px-4"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="ui-button-primary ui-press min-h-[46px] px-5"
            >
              추가
            </button>
          </div>
        </form>
      ) : null}

      {/* 다시 불러오는 동안에도 목록을 그대로 둔다(행이 다시 붙지 않아 움직임이 되풀이되지 않는다). */}
      {loading && tasks.length === 0 ? (
        <p className="m-0 py-2 text-sm text-ink-muted">불러오는 중...</p>
      ) : tasks.length === 0 ? (
        <p className="m-0 py-2 text-sm text-ink-muted md:text-[15px]">아직 장기 과제가 없어요.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-7">
          {getLongTermTaskRoots(tasks).map((task) => renderTask(task))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deletingTaskId}
        onClose={() => setDeletingTaskId(null)}
        onConfirm={confirmDeleteTask}
        title={tasks.find((task) => task.id === deletingTaskId)?.parent_task_id ? '과목 항목 삭제' : '장기 과제 삭제'}
        message={(() => {
          const deletingTask = tasks.find((task) => task.id === deletingTaskId);
          if (!deletingTask) return '';
          const childCount = getLongTermTaskChildren(tasks, deletingTask.id).length;
          const { totalCount } = getLongTermTaskProgress(deletingTask, tasks);
          const contained = [childCount ? `과목 ${childCount}개` : '', totalCount ? `세부 할 일 ${totalCount}개` : ''].filter(Boolean).join('와 ');
          return `이 ${deletingTask.parent_task_id ? '과목 항목을' : '장기 과제를'} 삭제할까요? ${contained ? `포함된 ${contained}도 함께 삭제됩니다. ` : ''}이미 만들어진 일일 작업과 공부 기록은 남습니다.`;
        })()}
        confirmText="삭제"
        cancelText="취소"
        confirmTone="danger"
      />

      <ConfirmModal
        isOpen={!!deletingSubtaskId}
        onClose={() => setDeletingSubtaskId(null)}
        onConfirm={confirmDeleteSubtask}
        title="세부 할 일 삭제"
        message="이 세부 할 일을 삭제할까요? 이미 만들어진 일일 작업과 공부 기록은 남습니다."
        confirmText="삭제"
        cancelText="취소"
        confirmTone="danger"
      />
    </div>
  );
}
