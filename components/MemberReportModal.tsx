'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDayStart, getDayEnd } from '@/lib/dateUtils';
import { X } from 'lucide-react';

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
    const [loading, setLoading] = useState(true);
    const [totalFocusTime, setTotalFocusTime] = useState(0);
    const [tasks, setTasks] = useState<TaskData[]>([]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    useEffect(() => {
        if (isOpen && userId) {
            fetchReportData();
        }
    }, [isOpen, userId]);

    const fetchReportData = async () => {
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
                    const taskName = session.task?.trim() || 'No Task';
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
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col transition-colors duration-300"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-slate-700">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                        {userName}님의 리포트
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">오늘 집중 시간</div>
                                <div className="text-4xl font-mono font-bold text-rose-500 dark:text-rose-400">
                                    {formatDuration(totalFocusTime)}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">태스크별 상세</h3>
                                {tasks.length > 0 ? (
                                    <div className="space-y-2">
                                        {tasks.map((task) => (
                                            <div key={task.name} className="flex justify-between items-center text-sm p-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                                <span className="text-gray-700 dark:text-gray-200 truncate max-w-[70%]">{task.name}</span>
                                                <span className="font-mono text-gray-500 dark:text-gray-400">{formatDuration(task.duration)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-400 text-sm py-4 bg-gray-50 dark:bg-slate-700/30 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
                                        오늘 기록된 태스크가 없습니다
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
