'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import toast from 'react-hot-toast';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { useSuggestedSubject } from '@/hooks/useSuggestedSubject';
import { notifyStudySubjectsChanged } from '@/lib/studySubjects';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatStudyTime } from './planUi';
import { usePlanRequestScope } from './usePlanRequestScope';
import { useEntrance, usePlayOnce } from '@/components/ui/usePlayOnce';

interface WeeklyPlan {
  id: string;
  title: string;
  subject_id: string | null;
  status: 'todo' | 'in_progress' | 'done';
  start_date: string;
  end_date: string;
  duration?: number;
}

type WeeklyPlanRow = {
  id: string;
  title: string;
  subject_id: string | null;
  status: WeeklyPlan['status'];
  start_date: string;
  end_date: string;
};

type SessionDurationRow = {
  task_id: string | null;
  duration: number | null;
};

interface WeeklyPlanProps {
  userId: string;
}

const getCurrentWeekRange = () => {
  const today = new Date();
  return {
    start: startOfWeek(today, { weekStartsOn: 1 }),
    end: endOfWeek(today, { weekStartsOn: 1 }),
  };
};

export default function WeeklyPlan({ userId }: WeeklyPlanProps) {
  return <ScopedWeeklyPlan key={userId} userId={userId} />;
}

function ScopedWeeklyPlan({ userId }: WeeklyPlanProps) {
  const scopeRef = usePlanRequestScope();
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const { subjects, createSubject } = useStudySubjects(userId);
  const { subjectId: newSubjectId, selectSubject, resetSubject, isAutomatic } =
    useSuggestedSubject(newPlanTitle, subjects);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedSubjectId, setEditedSubjectId] = useState<string | null>(null);
  // 방금 추가하거나 완료한 목표. 그 행에만 움직임을 한 번 붙인다(docs/design-system.md §8 새 항목).
  const [rowMotion, setRowMotion] = useState<{ type: 'add' | 'complete'; id: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // 한 번 돈 뒤 뗀다. 남겨 두면 탭을 다시 열거나 행이 옮겨질 때 다시 돈다.
  usePlayOnce(rowMotion, rootRef, (played) => setRowMotion((current) => (current === played ? null : current)));
  const formEntering = useEntrance(isAdding, formRef);
  const editorEntering = useEntrance(editingPlanId, editorRef);

  const fetchPlans = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    const request = ++scope.request;
    const isCurrent = () => scope.active && request === scope.request;
    if (!userId) {
      setPlans([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { start, end } = getCurrentWeekRange();
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('weekly_plans')
      .select('id, title, status, start_date, end_date, subject_id')
      .eq('user_id', userId)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .order('created_at', { ascending: true });

    if (!isCurrent()) return;
    if (error) {
      console.error('Error fetching weekly plans:', error);
      setLoading(false);
      return;
    }

    const planRows = (data ?? []) as WeeklyPlanRow[];
    const planIds = planRows.map((plan) => plan.id);

    let sessionRows: SessionDurationRow[] = [];
    if (planIds.length > 0) {
      // RLS로 보이는 타인 세션(그룹/친구 조회 허용분)이 합산되지 않도록
      // 본인 세션으로 한정한다.
      const { data: sessions, error: sessionsError } = await supabase
        .from('study_sessions')
        .select('task_id, duration')
        .eq('user_id', userId)
        .in('task_id', planIds);

      if (!isCurrent()) return;
      if (sessionsError) {
        console.error('Error fetching weekly study durations:', sessionsError);
      } else {
        sessionRows = (sessions ?? []) as SessionDurationRow[];
      }
    }

    const plansWithDuration = planRows.map((plan) => {
      const totalDuration = sessionRows.reduce((sum, row) => {
        if (row.task_id !== plan.id) return sum;
        return sum + (row.duration ?? 0);
      }, 0);

      return {
        ...plan,
        duration: totalDuration,
      };
    });

    setPlans(plansWithDuration);
    setLoading(false);
  }, [scopeRef, userId]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    const refresh = () => {
      if (scope.active) void fetchPlans();
    };
    const initialFetch = setTimeout(() => {
      refresh();
    }, 0);

    if (!userId) return () => clearTimeout(initialFetch);

    const planChannel = supabase
      .channel('weekly-plan-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_plans',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();

    const sessionChannel = supabase
      .channel('weekly-plan-session-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(initialFetch);
      supabase.removeChannel(planChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [fetchPlans, scopeRef, userId]);

  const addPlan = async (event: React.FormEvent) => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    event.preventDefault();
    if (!newPlanTitle.trim()) return;
    if (!userId) {
      alert('주간 목표를 추가하려면 로그인해주세요.');
      return;
    }

    const { start, end } = getCurrentWeekRange();
    const { data, error } = await supabase
      .from('weekly_plans')
      .insert({
        user_id: userId,
        title: newPlanTitle.trim(),
        subject_id: newSubjectId,
        start_date: format(start, 'yyyy-MM-dd'),
        end_date: format(end, 'yyyy-MM-dd'),
        status: 'todo',
      })
      .select('id, title, status, start_date, end_date, subject_id')
      .single();

    if (!scope.active) return;
    if (error) {
      console.error('Error adding plan:', error);
      toast.error('주간 목표를 추가하지 못했습니다. 다시 시도해주세요.');
      return;
    }

    const createdPlan = data as WeeklyPlanRow;
    setPlans((currentPlans) => [...currentPlans, { ...createdPlan, duration: 0 }]);
    setRowMotion({ type: 'add', id: createdPlan.id });
    if (createdPlan.subject_id) notifyStudySubjectsChanged();
    setNewPlanTitle('');
    resetSubject();
    setIsAdding(false);
  };

  const togglePlanStatus = async (plan: WeeklyPlan) => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    const nextStatus = plan.status === 'done' ? 'todo' : 'done';
    setPlans((currentPlans) =>
      currentPlans.map((currentPlan) =>
        currentPlan.id === plan.id
          ? { ...currentPlan, status: nextStatus }
          : currentPlan
      )
    );
    setRowMotion(nextStatus === 'done' ? { type: 'complete', id: plan.id } : null);

    const { error } = await supabase
      .from('weekly_plans')
      .update({ status: nextStatus })
      .eq('id', plan.id);

    if (!scope.active) return;
    if (error) {
      console.error('Error updating plan:', error);
      void fetchPlans();
    }
  };

  const startEditing = (plan: WeeklyPlan) => {
    setEditingPlanId(plan.id);
    setEditedTitle(plan.title);
    setEditedSubjectId(plan.subject_id ?? null);
  };

  const cancelEditing = () => {
    setEditingPlanId(null);
    setEditedTitle('');
    setEditedSubjectId(null);
  };

  const updatePlan = async () => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    if (!editingPlanId || !editedTitle.trim()) {
      cancelEditing();
      return;
    }

    const nextTitle = editedTitle.trim();
    const originalPlan = plans.find((plan) => plan.id === editingPlanId);
    if (originalPlan?.title === nextTitle && (originalPlan.subject_id ?? null) === editedSubjectId) {
      cancelEditing();
      return;
    }

    const planId = editingPlanId;
    const nextSubjectId = editedSubjectId;
    setPlans((currentPlans) =>
      currentPlans.map((plan) =>
        plan.id === planId ? { ...plan, title: nextTitle, subject_id: nextSubjectId } : plan
      )
    );
    cancelEditing();

    const { error } = await supabase
      .from('weekly_plans')
      .update({ title: nextTitle, subject_id: nextSubjectId })
      .eq('id', planId);

    if (!scope.active) return;
    if (error) {
      console.error('Error updating plan:', error);
      toast.error('주간 목표를 저장하지 못했습니다. 다시 시도해주세요.');
      void fetchPlans();
    } else if ((originalPlan?.subject_id ?? null) !== nextSubjectId) {
      notifyStudySubjectsChanged();
    }
  };

  const confirmDelete = async () => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    if (!deletingPlanId) return;

    const planId = deletingPlanId;
    const { error } = await supabase
      .from('weekly_plans')
      .delete()
      .eq('id', planId);

    if (!scope.active) return;
    if (error) {
      console.error('Error deleting plan:', error);
      return;
    }

    setPlans((currentPlans) =>
      currentPlans.filter((plan) => plan.id !== planId)
    );
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewPlanTitle('');
    resetSubject();
  };

  // 다른 곳(실시간 갱신 등)에서 지워지거나 완료가 풀렸으면 표시를 뗀다. 다시 완료돼도 움직이지 않는다.
  const motionPlan = rowMotion ? plans.find((plan) => plan.id === rowMotion.id) : undefined;
  if (rowMotion && (!motionPlan || (rowMotion.type === 'complete' && motionPlan.status !== 'done'))) {
    setRowMotion(null);
  }

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      void updatePlan();
    } else if (event.key === 'Escape') {
      cancelEditing();
    }
  };

  const { start, end } = getCurrentWeekRange();
  const periodLabel = `이번 주 · ${format(start, 'M월 d일')} – ${format(end, 'M월 d일')}`;

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3 md:min-h-10">
        <p className="m-0 min-w-0 truncate text-sm text-ink-muted">{periodLabel}</p>
        {!isAdding ? (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="ui-button-ghost ui-press min-h-11 shrink-0 gap-1.5 text-pomo md:min-h-10"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            주간 목표 추가
          </button>
        ) : null}
      </div>

      {isAdding ? (
        <form
          ref={formRef}
          onSubmit={addPlan}
          className={cn(
            'flex min-w-0 flex-col gap-3 rounded-panel bg-surface p-4 md:px-5 md:py-[18px] [&_.ui-input]:bg-white [&_[role=combobox]]:bg-white',
            formEntering && 'animate-fade-up'
          )}
        >
          <input
            type="text"
            aria-label="주간 목표"
            value={newPlanTitle}
            onChange={(event) => setNewPlanTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelAdding(); } }}
            placeholder="주간 목표를 입력하세요"
            className="ui-input min-h-[46px] w-full"
            autoFocus
          />
          <SubjectSelect subjects={subjects} value={newSubjectId} onChange={selectSubject} onCreate={createSubject} automatic={isAutomatic} onAutoSelect={resetSubject} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelAdding} className="ui-button-ghost min-h-[46px] px-4">
              취소
            </button>
            <button
              type="submit"
              disabled={!newPlanTitle.trim()}
              className="ui-button-primary ui-press min-h-[46px] px-5"
            >
              추가
            </button>
          </div>
        </form>
      ) : null}

      {/* 다시 불러오는 동안에도 목록을 그대로 둔다(행이 다시 붙지 않아 움직임이 되풀이되지 않는다). */}
      {loading && plans.length === 0 ? (
        <p className="m-0 py-2 text-sm text-ink-muted">불러오는 중...</p>
      ) : plans.length === 0 ? (
        <p className="m-0 py-2 text-sm text-ink-muted md:text-[15px]">아직 주간 목표가 없어요.</p>
      ) : (
        <ul aria-label="주간 목표" className="m-0 flex list-none flex-col gap-0.5 p-0">
          {plans.map((plan) => {
            const isDone = plan.status === 'done';
            const isEditing = editingPlanId === plan.id;
            return (
              <li
                key={plan.id}
                className={cn(
                  'group -mx-3 flex min-h-14 items-center gap-x-2.5 gap-y-1 rounded-tile px-3 py-2 transition-colors',
                  isEditing ? 'flex-wrap bg-surface' : 'hover:bg-hover',
                  rowMotion?.type === 'add' && rowMotion.id === plan.id && 'animate-fade-up'
                )}
              >
                <button
                  type="button"
                  onClick={() => void togglePlanStatus(plan)}
                  aria-pressed={isDone}
                  aria-label={`${plan.title} 완료`}
                  className={cn('-mx-2.5 flex size-11 shrink-0 items-center justify-center rounded-full md:-mx-1.5 md:size-9', isDone && 'ui-focus-ink')}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-colors',
                      isDone ? 'border-pomo bg-pomo text-white' : 'border-control text-transparent'
                    )}
                  >
                    <Check
                      className={cn('size-3.5', isDone && rowMotion?.type === 'complete' && rowMotion.id === plan.id && 'animate-pop-in')}
                      strokeWidth={3}
                    />
                  </span>
                </button>

                {isEditing ? (
                  <div
                    ref={editorRef}
                    className={cn(
                      'flex min-w-0 flex-1 basis-[min(100%,16rem)] flex-wrap items-center gap-2 [&_[role=combobox]]:bg-white',
                      editorEntering && 'animate-fade-up'
                    )}
                  >
                    <input
                      type="text"
                      aria-label="목표 제목"
                      value={editedTitle}
                      onChange={(event) => setEditedTitle(event.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="ui-input min-h-11 min-w-0 flex-[1_1_12rem] bg-white md:min-h-10"
                      autoFocus
                    />
                    <div className="min-w-0 flex-[1_1_10rem]">
                      <SubjectSelect subjects={subjects} value={editedSubjectId} onChange={setEditedSubjectId} onCreate={createSubject} compact />
                    </div>
                    <div className="ml-auto flex shrink-0 items-center">
                      <button
                        type="button"
                        aria-label="목표 저장"
                        onClick={() => void updatePlan()}
                        className="ui-icon-button size-11 text-pomo md:size-9"
                      >
                        <Check aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        aria-label="목표 수정 취소"
                        onClick={cancelEditing}
                        className="ui-icon-button size-11 text-ink-muted md:size-9"
                      >
                        <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
                    <span
                      title={plan.title}
                      className={cn(
                        'text-[15px] font-semibold break-words transition-colors max-md:line-clamp-2',
                        isDone ? 'text-ink-muted line-through' : 'text-ink'
                      )}
                    >
                      {plan.title}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-subtle">
                      <span className="min-w-0 truncate">
                        {subjects.find((subject) => subject.id === plan.subject_id)?.name ?? '미분류'}
                      </span>
                      {plan.duration ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0 whitespace-nowrap">{formatStudyTime(plan.duration)}</span>
                        </>
                      ) : null}
                    </span>
                  </div>
                )}

                {!isEditing ? (
                  // 데스크톱은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다.
                  <div className="flex shrink-0 items-center md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`${plan.title} 수정`}
                      onClick={() => startEditing(plan)}
                      className="ui-icon-button size-11 text-ink-muted md:size-8"
                    >
                      <Pencil aria-hidden="true" className="size-4" strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${plan.title} 삭제`}
                      onClick={() => setDeletingPlanId(plan.id)}
                      className="ui-icon-button size-11 text-ink-muted hover:text-pomo-deep md:size-8"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        isOpen={!!deletingPlanId}
        onClose={() => setDeletingPlanId(null)}
        onConfirm={confirmDelete}
        title="목표 삭제"
        message="이 주간 목표를 삭제할까요? 되돌릴 수 없어요."
        confirmText="삭제"
        cancelText="취소"
        confirmTone="danger"
      />
    </div>
  );
}
