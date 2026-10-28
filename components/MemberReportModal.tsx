'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDayStart, getDayEnd } from '@/lib/dateUtils';
import { X } from 'lucide-react';
import ModalDialog from '@/components/ui/ModalDialog';
import { formatHourMinute, formatHoursText } from '@/components/groups/groupUtils';

interface MemberReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    userName: string;
}

type TaskData = {
    name: string;
    duration: number;
};

export default function MemberReportModal({ isOpen, onClose, userId, userName }: MemberReportModalProps) {
    const titleId = useId();
    const tasksTitleId = useId();
    const [loading, setLoading] = useState(true);
    const [totalFocusTime, setTotalFocusTime] = useState(0);
    const [tasks, setTasks] = useState<TaskData[]>([]);

    const fetchReportData = useCallback(async () => {
        console.log('Fetching report data for:', userId);
        setLoading(true);

        try {
            // Get today's start and end time (based on 5 AM reset)
            const start = getDayStart().toISOString();
            const end = getDayEnd().toISOString();

            const { data: sessions, error } = await supabase
                .from('study_sessions')
                .select('duration, task')
                .eq('user_id', userId)
                .gte('created_at', start)
                .lte('created_at', end);

            if (error) {
                console.error('Error fetching sessions:', error);
                throw error;
            }

            console.log('Sessions found:', sessions?.length);

            if (sessions) {
                const total = sessions.reduce((acc, curr) => acc + curr.duration, 0);
                setTotalFocusTime(total);

                const taskMap: Record<string, number> = {};
                sessions.forEach(session => {
                    const taskName = session.task?.trim() || '작업 이름 없음';
                    taskMap[taskName] = (taskMap[taskName] || 0) + session.duration;
                });

                const sortedTasks = Object.entries(taskMap)
                    .map(([name, duration]) => ({ name, duration }))
                    .sort((a, b) => b.duration - a.duration);

                setTasks(sortedTasks);
            }
        } catch (e) {
            console.error('Failed to load report:', e);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (isOpen && userId) {
            const load = async () => {
                await fetchReportData();
            };
            void load();
        }
    }, [fetchReportData, isOpen, userId]);

    return (
        <ModalDialog
            open={isOpen}
            onClose={onClose}
            aria-labelledby={titleId}
            overlayClassName="animate-fade-in"
            className="animate-scale-in"
        >
            <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
            <div className="flex items-start justify-between gap-3">
                <h2 id={titleId} className="ui-dialog-title min-w-0 pt-1.5 break-words">
                    {userName}님의 리포트
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="ui-icon-button -mt-0.5 -mr-2 text-ink-muted"
                    aria-label="리포트 닫기"
                >
                    <X aria-hidden="true" size={20} strokeWidth={1.8} />
                </button>
            </div>

            {loading ? (
                <p role="status" className="m-0 py-8 text-center text-sm text-ink-muted">
                    불러오는 중이에요…
                </p>
            ) : (
                <>
                    <div className="flex flex-col gap-0.5">
                        <span className="font-display text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-pomo">
                            {formatHoursText(totalFocusTime)}
                        </span>
                        <span className="text-[13px] text-ink-muted">오늘 집중 시간</span>
                    </div>

                    <section aria-labelledby={tasksTitleId} className="flex flex-col gap-1">
                        <h3 id={tasksTitleId} className="m-0 text-[13px] font-semibold text-ink-muted">
                            작업별 시간
                        </h3>
                        {tasks.length > 0 ? (
                            <ul className="m-0 flex list-none flex-col p-0">
                                {tasks.map((task) => (
                                    <li key={task.name} className="flex min-h-11 items-center justify-between gap-3">
                                        <span className="min-w-0 truncate" title={task.name}>{task.name}</span>
                                        <span className="shrink-0 font-semibold">{formatHourMinute(task.duration)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="m-0 py-2 text-sm text-ink-muted">오늘 기록된 작업이 없어요.</p>
                        )}
                    </section>
                </>
            )}
        </ModalDialog>
    );
}
