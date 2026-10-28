import toast from 'react-hot-toast';
import { signOutWithPushCleanup } from '@/lib/pushSubscriptionLifecycle';
import { supabase } from '@/lib/supabase';
import { clearPendingSessionsForUser } from '@/components/timer/hooks/useStudySession';
import { getScopedStorageKey } from '@/lib/userScopedStorage';
import { SETTINGS_DRAFT_KEY } from './settingsDraft';

type ConflictPayload = {
  groups?: { name?: string | null }[];
  error?: string;
  message?: string;
};

type AccountActionOptions = {
  /**
   * Runs once the server confirmed the reset/delete, right before local state
   * is cleared and the page reloads or navigates away. Settings screens use it
   * to stop their own leave-time saves from writing the erased settings back.
   */
  beforeLeave?: () => void;
};

type Router = { replace: (href: string) => void };

export function clearAccountLocalStorage(userId?: string | null) {
  [
    'fomopomo_settings',
    'fomopomo_pomoTime',
    'fomopomo_initialPomoTime',
    'fomopomo_stopwatchTime',
    'fomopomo_selectedTask',
    'fomopomo_selectedTaskId',
    'fomopomo_full_state',
    'fomopomo_task_state',
    'fomopomo_notification_dismissed',
    'fomopomo_changelog_last_viewed',
    SETTINGS_DRAFT_KEY,
  ].forEach((key) => {
    localStorage.removeItem(key);
    // Authenticated state lives under user-scoped keys (`<base>::<uid>`).
    if (userId) {
      localStorage.removeItem(getScopedStorageKey(key, userId));
    }
  });
  // Drop the account's pending session drafts too, or outbox recovery would
  // re-insert study time the server-side reset/delete just erased.
  if (userId) {
    clearPendingSessionsForUser(userId);
  }
}

function getConflictMessage(
  payload: ConflictPayload | null | undefined,
  actionLabel: string
) {
  const groupNames = Array.isArray(payload?.groups)
    ? payload.groups
        .map((group) => group?.name)
        .filter((name: string | null | undefined): name is string =>
          typeof name === 'string' && name.length > 0
        )
    : [];

  if (groupNames.length > 0) {
    return `그룹장을 이양한 뒤에 ${actionLabel}할 수 있습니다.\n그룹: ${groupNames.join(', ')}`;
  }

  if (payload?.error === 'leader') {
    return `그룹장을 이양한 뒤에 ${actionLabel}할 수 있습니다.`;
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  return null;
}

export async function resetAccount({ beforeLeave }: AccountActionOptions = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) {
    toast.error('로그인 상태가 아닙니다.');
    return;
  }

  const toastId = toast.loading('계정 초기화 중...');

  try {
    if (!session?.access_token) {
      toast.error('로그인 정보가 유효하지 않습니다.', { id: toastId });
      return;
    }

    const response = await fetch('/api/account-reset', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as ConflictPayload;

    if (!response.ok) {
      if (response.status === 409) {
        const conflictMessage = getConflictMessage(payload, '초기화');
        if (conflictMessage) {
          toast.error(conflictMessage, { id: toastId, duration: 5000 });
          return;
        }
      }
      const errorMessage =
        (typeof payload?.message === 'string' && payload.message) ||
        (typeof payload?.error === 'string' && payload.error) ||
        '초기화 실패';
      toast.error(errorMessage, { id: toastId });
      return;
    }

    beforeLeave?.();
    clearAccountLocalStorage(session.user.id);

    toast.success('계정 초기화 완료', { id: toastId });
    window.location.reload();
  } catch (e) {
    console.error('계정 초기화 오류:', e);
    toast.error('초기화 실패', { id: toastId });
  }
}

export async function deleteAccount(router: Router, { beforeLeave }: AccountActionOptions = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) {
    toast.error('로그인 상태가 아닙니다.');
    return;
  }

  const toastId = toast.loading('계정 삭제 중...');

  try {
    if (!session?.access_token) {
      toast.error('로그인 정보가 유효하지 않습니다.', { id: toastId });
      return;
    }

    const response = await fetch('/api/account-delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as ConflictPayload;

    if (!response.ok) {
      if (response.status === 409) {
        const conflictMessage = getConflictMessage(payload, '탈퇴');
        if (conflictMessage) {
          toast.error(conflictMessage, { id: toastId, duration: 5000 });
          return;
        }
      }
      const errorMessage =
        (typeof payload?.message === 'string' && payload.message) ||
        (typeof payload?.error === 'string' && payload.error) ||
        '계정 삭제 실패';
      toast.error(errorMessage, { id: toastId });
      return;
    }

    beforeLeave?.();
    clearAccountLocalStorage(session.user.id);

    toast.success('계정이 삭제되었습니다. 이용해 주셔서 감사합니다.', { id: toastId, duration: 3000 });

    try {
      await signOutWithPushCleanup();
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
    router.replace('/');
  } catch (e) {
    console.error('계정 삭제 오류:', e);
    toast.error('계정 삭제에 실패했습니다. 다시 시도해주세요.', { id: toastId });
  }
}
