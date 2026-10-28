'use client';

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  startPushSubscriptionLifecycle,
  syncCurrentPushSubscription,
} from '@/lib/pushSubscriptionLifecycle';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const subscribeToHydration = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
}

export default function NotificationManager({
  mode = 'floating',
}: {
  mode?: 'floating' | 'inline';
}) {
  const isHydrated = useHydrated();
  const pathname = usePathname();
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return localStorage.getItem('fomopomo_notification_dismissed') !== 'true';
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [testStatus, setTestStatus] = useState('');

  const addLog = useCallback((message: string) => {
    setDebugLog((previous) => [message, ...previous].slice(0, 10));
    console.log(message);
  }, []);

  const subscribeUser = useCallback(
    async (showToast = true) => {
      if (!('serviceWorker' in navigator)) return;

      try {
        const result = await syncCurrentPushSubscription(addLog);

        if (result.status === 'cancelled' || result.status === 'unsupported') {
          return;
        }

        if (
          result.status === 'persisted_existing' ||
          result.status === 'rotated' ||
          result.status === 'subscribed_new'
        ) {
          setPermission('granted');

          if (showToast && result.status !== 'persisted_existing') {
            toast.success('알림이 설정되었습니다.');
          }

          return;
        }

        if (result.status === 'persist_failed') {
          if (showToast) {
            toast.error(
              'Notification permission is enabled, but saving the subscription failed. It will retry automatically.'
            );
          }
          return;
        }

        if (!showToast) {
          return;
        }

        if (result.status === 'cleanup_failed') {
          toast.error(
            'Could not rotate notifications because the old subscription could not be cleaned up.'
          );
          return;
        }

        if (result.status === 'missing_vapid_key') {
          toast.error('VAPID public key is not configured.');
          return;
        }

        if (result.status === 'invalid_vapid_key') {
          toast.error('VAPID public key is invalid.');
          return;
        }

        if (result.status === 'missing_user') {
          toast.error('You need to sign in before enabling notifications.');
          return;
        }

        if (result.status === 'unsubscribe_failed') {
          toast.error('Could not replace the existing notification subscription.');
          return;
        }

        toast.error('알림 설정에 실패했습니다.');
      } catch {
        addLog('Push subscription sync failed');
        if (showToast) {
          toast.error('알림 설정에 실패했습니다.');
        }
      }
    },
    [addLog]
  );

  useEffect(() => {
    const stopLifecycle = startPushSubscriptionLifecycle(addLog);
    const updatePermission = () => {
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
    };
    const initialPermission = setTimeout(updatePermission, 0);
    window.addEventListener('focus', updatePermission);

    return () => {
      clearTimeout(initialPermission);
      window.removeEventListener('focus', updatePermission);
      stopLifecycle();
    };
  }, [addLog]);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let pendingCheck: ReturnType<typeof setTimeout> | undefined;

    const checkAdminRole = async (userId: string, requestGeneration: number) => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        if (!disposed && generation === requestGeneration) {
          setIsAdmin(!error && profile?.role === 'admin');
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    };

    const scheduleAdminCheck = (userId: string | null) => {
      const requestGeneration = ++generation;
      clearTimeout(pendingCheck);
      setIsAdmin(false);
      setIsOpen(false);
      // Supabase auth callbacks run under the auth lock. Defer the profile
      // request until the callback has returned, and reject stale responses.
      if (userId) {
        pendingCheck = setTimeout(() => {
          void checkAdminRole(userId, requestGeneration);
        }, 0);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        scheduleAdminCheck(session?.user?.id ?? null);
      }
    );
    const initialGeneration = generation;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!disposed && generation === initialGeneration) {
        scheduleAdminCheck(user?.id ?? null);
      }
    }).catch((error) => {
      console.error('Error checking admin role:', error);
    });

    return () => {
      disposed = true;
      generation += 1;
      clearTimeout(pendingCheck);
      subscription.unsubscribe();
    };
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }

    if (permission === 'denied') {
      toast.error(
        '알림이 차단되어 있습니다.\n브라우저 주소창 옆 설정에서 알림 권한을 허용해주세요.',
        { duration: 5000 }
      );
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    addLog(`Permission result: ${result}`);

    if (result === 'granted') {
      await subscribeUser();
    } else if (result === 'denied') {
      toast.error('알림 권한이 거부되었습니다.\n설정에서 직접 허용해야 합니다.');
    }
  };

  const sendTestNotification = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('테스트 알림', {
        body: '알림이 정상적으로 동작합니다.',
        icon: '/icon-192x192.png',
      });
      addLog('Test notification sent');
      setTestStatus('테스트 알림을 보냈어요.');
    } catch {
      addLog('Test notification failed');
      setTestStatus('테스트 알림을 보내지 못했어요.');
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('fomopomo_notification_dismissed', 'true');
  };

  if (mode === 'floating') {
    // 설정 화면에는 같은 내용의 '알림 설정' 섹션이 있다.
    if (!isHydrated || permission === 'granted' || !isVisible || pathname === '/settings') return null;

    return (
      <aside
        className="mx-auto my-6 w-[calc(100%_-_2rem)] max-w-2xl rounded-cta bg-surface px-5 py-4 text-ink"
        aria-label="타이머 종료 알림 안내"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-[15px] font-bold">타이머 종료 알림</h2>
            <p className="m-0 text-sm text-ink-muted">
              화면을 보고 있지 않아도 종료 시간을 알려드려요.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="ui-button-ghost -mt-1 -mr-2 min-h-9 shrink-0 px-2.5 text-sm text-ink-muted"
            aria-label="타이머 종료 알림 안내 닫기"
          >
            닫기
          </button>
        </div>
        <button
          type="button"
          onClick={requestPermission}
          className="ui-button-primary ui-press mt-3 min-h-10 px-4 text-sm"
        >
          알림 켜기
        </button>
      </aside>
    );
  }

  // 설정 화면의 '알림 설정' 내용. 섹션 제목은 바깥에서 그린다.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-14 items-center justify-between gap-3 py-0.5 md:min-h-16 md:gap-4 md:py-1">
        <div className="flex min-w-0 flex-col gap-px md:gap-0.5">
          <span className="font-semibold">타이머 종료 알림</span>
          <span className="text-xs text-ink-muted md:text-[13px]">
            <span className="md:hidden">화면을</span>
            <span className="hidden md:inline">탭을</span> 보고 있지 않아도 끝나면 알려줘요.
          </span>
        </div>
        <span
          className={cn(
            'inline-flex h-[30px] shrink-0 items-center rounded-[9px] px-2.5 text-xs font-bold md:h-8 md:rounded-chip md:px-3 md:text-[13px]',
            permission === 'granted'
              ? 'bg-rest-tint text-rest-deep'
              : permission === 'denied'
                ? 'bg-pomo-tint text-pomo-deep'
                : 'bg-surface text-ink-muted'
          )}
        >
          <span className="sr-only">알림 권한 </span>
          <span>
            {permission === 'granted'
              ? '허용됨'
              : permission === 'denied'
                ? '거부됨'
                : '미설정'}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        {permission !== 'granted' && (
          <button
            type="button"
            onClick={requestPermission}
            className="ui-button-primary ui-press min-h-12 rounded-tile px-5"
          >
            알림 권한 요청하기
          </button>
        )}

        {permission === 'granted' && (
          <button
            type="button"
            onClick={sendTestNotification}
            className="ui-button-secondary ui-press min-h-12 rounded-tile px-5"
          >
            테스트 알림 보내기
          </button>
        )}

        <span role="status" className="min-h-[18px] text-xs text-ink-muted md:min-h-0 md:text-[13px]">
          {testStatus}
        </span>
      </div>

      {isAdmin && (
        <div>
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="text-xs text-ink-subtle underline underline-offset-2 hover:text-ink"
          >
            {isOpen ? '디버그 로그 숨기기' : '디버그 로그 보기'}
          </button>

          {isOpen && (
            <div className="mt-2 h-32 overflow-y-auto rounded-control bg-surface p-3 font-mono text-[11px] text-ink-muted">
              {debugLog.map((log, index) => (
                <div key={index} className="py-0.5">
                  &gt; {log}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
