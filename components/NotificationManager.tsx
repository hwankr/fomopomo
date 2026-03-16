'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export default function NotificationManager({
  mode = 'floating',
}: {
  mode?: 'floating' | 'inline';
}) {
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

  const addLog = useCallback((message: string) => {
    setDebugLog((previous) => [message, ...previous].slice(0, 10));
    console.log(message);
  }, []);

  const upsertSubscription = useCallback(
    async (subscription: PushSubscription) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        addLog('No user found');
        return;
      }

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
        },
        { onConflict: 'endpoint' }
      );

      if (error) {
        addLog(`DB Error: ${JSON.stringify(error)}`);
        throw error;
      }
    },
    [addLog]
  );

  const checkSubscription = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await upsertSubscription(subscription);
      }

      addLog(subscription ? 'Subscription active' : 'No subscription found');
    } catch (error) {
      addLog(`Error checking subscription: ${error}`);
    }
  }, [addLog, upsertSubscription]);

  const subscribeUser = useCallback(
    async (showToast = true) => {
      if (!('serviceWorker' in navigator)) return;

      if (!VAPID_PUBLIC_KEY) {
        addLog('Missing VAPID public key');
        if (showToast) {
          toast.error('VAPID 공개키가 설정되지 않았습니다.');
        }
        return;
      }

      try {
        addLog('Starting subscription...');
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription =
          await registration.pushManager.getSubscription();

        if (existingSubscription) {
          addLog('Unsubscribing existing...');
          await existingSubscription.unsubscribe();
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        addLog('Got push subscription');
        await upsertSubscription(subscription);
        setPermission('granted');

        if (showToast) {
          toast.success('알림이 설정되었습니다.');
        }

        addLog('Subscription saved to DB');
      } catch (error) {
        addLog(`Subscribe failed: ${error}`);
        toast.error('알림 설정에 실패했습니다.');
      }
    },
    [addLog, upsertSubscription]
  );

  useEffect(() => {
    const syncAdminRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        setIsAdmin(profile?.role === 'admin');
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    };

    void syncAdminRole();

    const registerServiceWorker = async () => {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js');
          addLog('Service Worker registered');
        } catch (error) {
          addLog(`SW registration failed: ${error}`);
        }
      }

      if (typeof window !== 'undefined' && 'Notification' in window) {
        const currentPermission = Notification.permission;
        setPermission(currentPermission);
        addLog(`Current permission: ${currentPermission}`);
        await checkSubscription();

        if (currentPermission === 'granted') {
          await subscribeUser(false);
        }
      }
    };

    void registerServiceWorker();
  }, [addLog, checkSubscription, subscribeUser]);

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
    } catch (error) {
      addLog(`Test notification failed: ${error}`);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('fomopomo_notification_dismissed', 'true');
  };

  if (mode === 'floating') {
    if (permission === 'granted' || !isVisible) return null;

    return (
      <div className="fixed bottom-20 right-4 z-50 flex animate-bounce items-center gap-2">
        <button
          onClick={requestPermission}
          className="flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:opacity-90"
        >
          <span>🔔</span>
          <span>알림 켜기</span>
        </button>
        <button
          onClick={handleDismiss}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white p-1 text-xs text-gray-400 shadow-md hover:text-gray-600"
          aria-label="닫기"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">알림 권한 상태</span>
        <span
          className={`rounded px-2 py-1 text-xs font-bold ${
            permission === 'granted'
              ? 'bg-green-100 text-green-600'
              : permission === 'denied'
                ? 'bg-red-100 text-red-600'
                : 'bg-gray-100 text-gray-600'
          }`}
        >
          {permission === 'granted'
            ? '허용됨'
            : permission === 'denied'
              ? '거부됨'
              : '미설정'}
        </span>
      </div>

      {permission !== 'granted' && (
        <button
          onClick={requestPermission}
          className="w-full rounded-lg bg-rose-500 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600"
        >
          알림 권한 요청하기
        </button>
      )}

      {permission === 'granted' && (
        <button
          onClick={sendTestNotification}
          className="w-full rounded-lg bg-blue-50 py-2 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-100"
        >
          테스트 알림 보내기
        </button>
      )}

      {isAdmin && (
        <div className="pt-2">
          <button
            onClick={() => setIsOpen((current) => !current)}
            className="text-[10px] text-gray-400 underline hover:text-gray-600"
          >
            {isOpen ? '디버그 로그 숨기기' : '디버그 로그 보기'}
          </button>

          {isOpen && (
            <div className="mt-2 h-32 overflow-y-auto rounded bg-gray-900 p-2 font-mono text-[10px] text-green-400">
              {debugLog.map((log, index) => (
                <div
                  key={index}
                  className="border-b border-gray-800 py-0.5 last:border-0"
                >
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
