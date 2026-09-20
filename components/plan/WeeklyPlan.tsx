'use client';

import { useCallback, useEffect, useState } from 'react';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import {
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import toast from 'react-hot-toast';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { notifyStudySubjectsChanged } from '@/lib/studySubjects';
import { usePersistedState } from '@/hooks/usePersistedState';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { usePlanRequestScope } from './usePlanRequestScope';

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

const formatDuration = (seconds: number) => {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

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
  const [newSubjectId, setNewSubjectId] = useState<string | null>(null);
  const { subjects, createSubject } = useStudySubjects(userId);
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = usePersistedState(
    'weekly_plan_expanded',
    true
  );
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedSubjectId, setEditedSubjectId] = useState<string | null>(null);

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
    if (createdPlan.subject_id) notifyStudySubjectsChanged();
    setNewPlanTitle('');
    setNewSubjectId(null);
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

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      void updatePlan();
    } else if (event.key === 'Escape') {
      cancelEditing();
    }
  };

  const { start, end } = getCurrentWeekRange();

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <div
        className="mb-6 flex cursor-pointer items-center justify-between lg:cursor-default"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarIcon className="h-5 w-5 text-indigo-500" />
            Weekly Goals
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {format(start, 'MMM d')} - {format(end, 'MMM d')}
          </p>
        </div>
        <div className="text-gray-400 lg:hidden">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
      </div>

      <div
        className={cn(
          'flex flex-1 flex-col transition-all duration-300',
          !isExpanded && 'hidden lg:flex'
        )}
      >
        <div className="custom-scrollbar min-h-[100px] max-h-[300px] flex-1 space-y-3 overflow-y-auto">
          {loading ? (
            <div className="py-6 text-center text-gray-400">불러오는 중...</div>
          ) : plans.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-6 text-gray-400">
              <p className="text-sm">아직 주간 목표가 없어요.</p>
              {!isAdding && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="mt-2 text-sm font-medium text-indigo-500 hover:text-indigo-600"
                >
                  + 목표 추가
                </button>
              )}
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className="group flex items-center gap-3 rounded-xl border border-transparent bg-indigo-50 p-3 transition-all hover:border-indigo-200 max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:gap-2 dark:bg-indigo-900/20 dark:hover:border-indigo-800"
              >
                <button
                  onClick={() => void togglePlanStatus(plan)}
                  className={cn(
                    'flex-shrink-0 transition-colors',
                    plan.status === 'done'
                      ? 'text-indigo-500'
                      : 'text-gray-400 hover:text-indigo-400'
                  )}
                >
                  {plan.status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                {editingPlanId === plan.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2 max-sm:order-last max-sm:col-span-full max-sm:justify-end">
                    <input
                      type="text"
                      aria-label="목표 제목"
                      value={editedTitle}
                      onChange={(event) => setEditedTitle(event.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 max-sm:basis-full dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      autoFocus
                    />
                    <div className="min-w-0 max-w-full max-sm:basis-full">
                      <SubjectSelect subjects={subjects} value={editedSubjectId} onChange={setEditedSubjectId} onCreate={createSubject} compact />
                    </div>
                    <button
                      aria-label="목표 저장"
                      onClick={() => void updatePlan()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-green-500 transition-colors hover:bg-green-50 dark:hover:bg-green-900/30"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-sm font-medium transition-all',
                      plan.status === 'done'
                        ? 'text-gray-400 line-through'
                        : 'text-gray-700 dark:text-gray-200'
                    )}
                  >
                    <span title={plan.title} className="block break-words max-sm:line-clamp-2">{plan.title}</span>
                    <span className="block truncate text-xs font-normal text-gray-500 dark:text-gray-400">
                      {subjects.find((subject) => subject.id === plan.subject_id)?.name ?? '미분류'}
                    </span>
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-3 max-sm:col-start-2 max-sm:justify-end max-sm:gap-2">
                  {plan.duration ? (
                    <span className="whitespace-nowrap rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-500 dark:bg-indigo-900/30">
                      {formatDuration(plan.duration)}
                    </span>
                  ) : null}

                  {editingPlanId !== plan.id && (
                    <button
                      aria-label={`${plan.title} 수정`}
                      onClick={() => startEditing(plan)}
                      className="p-1.5 text-gray-400 transition-all hover:text-indigo-500 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    onClick={() => setDeletingPlanId(plan.id)}
                    className="p-1.5 text-gray-400 transition-all hover:text-red-500 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
          {isAdding ? (
            <form onSubmit={addPlan} className="flex min-w-0 flex-col gap-3">
              <input
                type="text"
                value={newPlanTitle}
                onChange={(event) => setNewPlanTitle(event.target.value)}
                placeholder="주간 목표를 입력하세요"
                className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                autoFocus
              />
              <SubjectSelect subjects={subjects} value={newSubjectId} onChange={setNewSubjectId} onCreate={createSubject} />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!newPlanTitle.trim()}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-400 transition-all hover:border-indigo-200 hover:text-indigo-500 dark:border-gray-700 dark:hover:border-indigo-800 dark:hover:text-indigo-400"
            >
              <Plus className="h-4 w-4" />
              주간 목표 추가
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deletingPlanId}
        onClose={() => setDeletingPlanId(null)}
        onConfirm={confirmDelete}
        title="목표 삭제"
        message="이 주간 목표를 삭제할까요? 이 작업은 되돌릴 수 없습니다."
        confirmText="삭제"
        cancelText="취소"
        isDangerous={true}
      />
    </div>
  );
}
