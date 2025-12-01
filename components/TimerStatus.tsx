'use client';

import { useEffect, useState } from 'react';

interface TimerState {
    activeTab: 'timer' | 'stopwatch';
    timer: {
        mode: 'focus' | 'shortBreak' | 'longBreak';
        targetTime: number | null;
        timeLeft: number;
        isRunning: boolean;
    };
    stopwatch: {
        startTime: number | null;
        elapsed: number;
        isRunning: boolean;
    };
    lastUpdated: number;
}

export default function TimerStatus() {
    const [status, setStatus] = useState<{
        text: string;
        type: 'focus' | 'break' | 'stopwatch';
        isRunning: boolean;
    } | null>(null);

    useEffect(() => {
        const checkStatus = () => {
            const savedState = localStorage.getItem('pomofomo_full_state');
            if (!savedState) {
                setStatus(null);
                return;
            }

            try {
                const state: TimerState = JSON.parse(savedState);
                const now = Date.now();

                // 24시간 지난 상태는 무시
                if (now - state.lastUpdated > 24 * 60 * 60 * 1000) {
                    setStatus(null);
                    return;
                }

                if (state.activeTab === 'timer') {
                    if (state.timer.isRunning && state.timer.targetTime) {
                        const diff = Math.ceil((state.timer.targetTime - now) / 1000);
                        const timeLeft = diff > 0 ? diff : 0;
                        const minutes = Math.floor(timeLeft / 60);
                        const seconds = timeLeft % 60;
                        const text = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                        setStatus({
                            text,
                            type: state.timer.mode === 'focus' ? 'focus' : 'break',
                            isRunning: true,
                        });
                    } else {
                        // 멈춰있는 경우
                        const timeLeft = state.timer.timeLeft;
                        const minutes = Math.floor(timeLeft / 60);
                        const seconds = timeLeft % 60;
                        const text = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                        setStatus({
                            text,
                            type: state.timer.mode === 'focus' ? 'focus' : 'break',
                            isRunning: false,
                        });
                    }
                } else {
                    // Stopwatch
                    if (state.stopwatch.isRunning && state.stopwatch.startTime) {
                        const elapsed = Math.floor((now - state.stopwatch.startTime) / 1000);
                        const h = Math.floor(elapsed / 3600);
                        const m = Math.floor((elapsed % 3600) / 60);
                        const s = elapsed % 60;
                        const text = h > 0
                            ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
                            : `${m}:${s.toString().padStart(2, '0')}`;

                        setStatus({
                            text,
                            type: 'stopwatch',
                            isRunning: true,
                        });
                    } else {
                        const elapsed = state.stopwatch.elapsed;
                        const h = Math.floor(elapsed / 3600);
                        const m = Math.floor((elapsed % 3600) / 60);
                        const s = elapsed % 60;
                        const text = h > 0
                            ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
                            : `${m}:${s.toString().padStart(2, '0')}`;

                        setStatus({
                            text,
                            type: 'stopwatch',
                            isRunning: false,
                        });
                    }
                }
            } catch (e) {
                console.error('Error parsing timer state:', e);
                setStatus(null);
            }
        };

        // 초기 실행
        checkStatus();

        // 1초마다 갱신
        const interval = setInterval(checkStatus, 1000);
        return () => clearInterval(interval);
    }, []);

    if (!status) return null;

    const getStyles = () => {
        if (status.type === 'focus') {
            return 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800';
        }
        if (status.type === 'break') {
            return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
        }
        return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800';
    };

    const getIcon = () => {
        if (status.type === 'focus') return '🔥';
        if (status.type === 'break') return '☕';
        return '⏱️';
    };

    return (
        <div className={`
      flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold border
      transition-all duration-300 animate-in fade-in slide-in-from-top-2
      ${getStyles()}
      ${!status.isRunning && 'opacity-60 grayscale'}
    `}>
            <span>{getIcon()}</span>
            <span className="tabular-nums tracking-wide">{status.text}</span>
            {!status.isRunning && <span className="text-xs ml-1 opacity-75">(Paused)</span>}
        </div>
    );
}
