import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// Helper to generate UUID
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Helper to split an interval at midnight boundaries
// Returns an array of intervals, each within a single day
const splitIntervalAtMidnight = (interval: { start: number; end: number }): { start: number; end: number }[] => {
  const result: { start: number; end: number }[] = [];
  let currentStart = interval.start;
  const finalEnd = interval.end;

  while (currentStart < finalEnd) {
    // Get the start of the next day (midnight)
    const startDate = new Date(currentStart);
    const nextMidnight = new Date(startDate);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);

    // If the interval ends before next midnight, use the actual end
    const currentEnd = nextMidnight.getTime() <= finalEnd ? nextMidnight.getTime() : finalEnd;

    // Only add if there's meaningful duration (at least 1 second)
    if (currentEnd - currentStart >= 1000) {
      result.push({ start: currentStart, end: currentEnd });
    }

    currentStart = currentEnd;
  }

  return result;
};

interface UseStudySessionProps {
  isLoggedIn: boolean;
  onRecordSaved: () => void;
  selectedTaskId: string | null;
  selectedTaskTitle: string;
}

export const useStudySession = ({
  isLoggedIn,
  onRecordSaved,
  selectedTaskId,
  selectedTaskTitle,
}: UseStudySessionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [intervals, setIntervals] = useState<{ start: number; end: number }[]>([]);
  const currentIntervalStartRef = useRef<number | null>(null);

  // Ref-based lock to prevent duplicate saves (sync check, unlike useState)
  const isSavingRef = useRef(false);

  // Update status (online/offline/studying)
  const updateStatus = useCallback(async (status: 'studying' | 'paused' | 'online' | 'offline', task?: string, startTime?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const taskTitle = task !== undefined ? task : selectedTaskTitle;

      // Check privacy setting
      const { data } = await supabase.from('profiles').select('is_task_public').eq('id', user.id).single();
      const isPublic = data?.is_task_public ?? true;

      await supabase.from('profiles').update({
        status,
        current_task: isPublic ? taskTitle : null,
        last_active_at: new Date().toISOString(),
        study_start_time: startTime || null,
      }).eq('id', user.id);
    } catch (e) {
      console.error('Failed to update status', e);
    }
  }, [selectedTaskTitle]);

  const saveRecord = useCallback(
    async (recordMode: string, duration: number, taskText = '', forcedEndTime?: number) => {
      // Prevent duplicate saves using ref (synchronous check)
      if (isSavingRef.current) {
        console.log('[saveRecord] Already saving, ignoring duplicate request');
        return;
      }

      if (duration < 10) {
        toast.error('10초 미만은 저장되지 않습니다.');
        return;
      }

      if (!isLoggedIn) {
        toast.error('로그인이 필요한 기능입니다.');
        return;
      }

      // Set ref immediately (synchronous) to block rapid duplicate calls
      isSavingRef.current = true;

      const formatDurationForToast = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes === 0) return `${seconds}초`;
        if (seconds === 0) return `${minutes}분`;
        return `${minutes}분 ${seconds}초`;
      };

      const groupId = generateUUID();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        isSavingRef.current = false;
        return;
      }

      setIsSaving(true);
      const toastId = toast.loading('기록 저장 중...', {
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
          fontSize: '14px',
        },
      });

      try {
        const now = Date.now();
        const endTimeToUse = forcedEndTime || now; // Use forced time if provided

        let currentSessionIntervals = [...intervals];

        if (currentIntervalStartRef.current) {
          currentSessionIntervals.push({ start: currentIntervalStartRef.current, end: endTimeToUse });
        }

        currentSessionIntervals = currentSessionIntervals.filter(i => i.start > 0 && i.end > 0);

        if (currentSessionIntervals.length === 0) {
          if (duration > 0 && duration < 24 * 60 * 60) {
            currentSessionIntervals.push({ start: endTimeToUse - duration * 1000, end: endTimeToUse });
          }
        }

        const rowsToInsert = currentSessionIntervals
          // First, split each interval at midnight boundaries
          .flatMap(interval => splitIntervalAtMidnight(interval))
          // Then, convert each split interval to a row
          .map(interval => ({
            mode: recordMode,
            duration: Math.round((interval.end - interval.start) / 1000),
            user_id: user.id,
            task: taskText.trim() || null,
            task_id: selectedTaskId,
            created_at: new Date(interval.end).toISOString(),
            group_id: groupId,
          }))
          .filter(row => row.duration > 0 && row.duration < 24 * 60 * 60);

        if (rowsToInsert.length === 0) {
          rowsToInsert.push({
            mode: recordMode,
            duration,
            user_id: user.id,
            task: taskText.trim() || null,
            task_id: selectedTaskId,
            created_at: new Date(endTimeToUse).toISOString(),
            group_id: groupId,
          });
        }

        const { error } = await supabase.from('study_sessions').insert(rowsToInsert);
        if (error) throw error;

        // Calculate actual saved duration from rowsToInsert
        const actualSavedDuration = rowsToInsert.reduce((sum, row) => sum + row.duration, 0);
        toast.success(`${formatDurationForToast(actualSavedDuration)} 기록 저장 완료!`, { id: toastId });
        onRecordSaved();
      } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`저장 실패: ${errorMessage}`, { id: toastId, duration: 5000 });
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
        setIntervals([]);
        currentIntervalStartRef.current = null;
      }
    },
    [onRecordSaved, intervals, selectedTaskId, isLoggedIn]
  );

  // Set online on mount / offline on unmount
  useEffect(() => {
    const setOnline = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({
          status: 'online',
          last_active_at: new Date().toISOString(),
        }).eq('id', user.id);
      }
    };
    setOnline();

    const handleUnload = () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectId = supabaseUrl.split('//')[1]?.split('.')[0];
      const currentSessionString = projectId
        ? localStorage.getItem(`sb-${projectId}-auth-token`)
        : null;

      if (currentSessionString) {
        try {
          const session = JSON.parse(currentSessionString);
          if (session?.access_token && session?.user?.id) {
            const blob = new Blob([JSON.stringify({
              status: 'offline',
              user_id: session.user.id,
              access_token: session.access_token
            })], { type: 'application/json' });

            navigator.sendBeacon('/api/status', blob);
          }
        } catch (e) {
          console.error('Error parsing session for beacon', e);
        }
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    }
  }, []);


  return {
    isSaving,
    intervals,
    setIntervals,
    currentIntervalStartRef,
    updateStatus,
    saveRecord,
    checkActiveSession: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data } = await supabase
          .from('profiles')
          .select('status, study_start_time')
          .eq('id', user.id)
          .single();
        
        return data;
      } catch (e) {
        console.error('Failed to check active session', e);
        return null;
      }
    },
  };
};
