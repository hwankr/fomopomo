'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function NotificationManager({ mode = 'floating' }: { mode?: 'floating' | 'inline' }) {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    const addLog = (msg: string) => {
        setDebugLog(prev => [msg, ...prev].slice(0, 10));
        console.log(msg);
    };

    const checkSubscription = async () => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
            
            if (subscription) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase.from('push_subscriptions').upsert({
                        user_id: user.id,
                        endpoint: subscription.endpoint,
                        keys: subscription.toJSON().keys,
                    }, { onConflict: 'endpoint' });
                }
            }
            
            addLog(subscription ? 'Subscription active' : 'No subscription found');
        } catch (e) {
            addLog(`Error checking subscription: ${e}`);
        }
    };

    const checkAdminRole = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                setIsAdmin(profile?.role === 'admin');
            }
        } catch (e) {
            console.error('Error checking admin role:', e);
        }
    };

    useEffect(() => {
        // Check dismissal state
        const isDismissed = localStorage.getItem('fomopomo_notification_dismissed') === 'true';
        if (!isDismissed) {
            setIsVisible(true);
        }

        // Check admin role
        checkAdminRole();

        const registerSwAndCheckPermission = async () => {
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
                    subscribeUser(false);
                }
            }
        };

        registerSwAndCheckPermission();
    }, []);

    const subscribeUser = async (showToast = true) => {
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
            
            // Unsubscribe existing to force refresh if needed
            const existingSub = await registration.pushManager.getSubscription();
            if (existingSub) {
                addLog('Unsubscribing existing...');
                await existingSub.unsubscribe();
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            addLog('Got push subscription');

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                addLog('No user found');
                return;
            }

            const { error } = await supabase.from('push_subscriptions').upsert({
                user_id: user.id,
                endpoint: subscription.endpoint,
                keys: subscription.toJSON().keys,
            }, { onConflict: 'endpoint' });

            if (error) {
                addLog(`DB Error: ${JSON.stringify(error)}`);
                throw error;
            }

            if (showToast) {
                toast.success('알림이 설정되었습니다!');
            }
            setPermission('granted');
            setIsSubscribed(true);
            addLog('Subscription saved to DB');
        } catch (error) {
            addLog(`Subscribe failed: ${error}`);
            toast.error('알림 설정에 실패했습니다.');
        }
    };

    const requestPermission = async () => {
        if (!('Notification' in window)) {
            toast.error('이 브라우저는 알림을 지원하지 않습니다.');
            return;
        }

        // 이미 거부된 상태라면 바로 안내
        if (permission === 'denied') {
            toast.error('알림이 차단되어 있습니다.\n브라우저 주소창 옆 자물쇠 버튼을 눌러\n알림 권한을 허용해주세요.', {
                duration: 5000,
            });
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
                body: '알림이 잘 작동합니다! 🎉',
                icon: '/icon-192x192.png'
            });
            addLog('Test notification sent');
        } catch (e) {
            addLog(`Test notification failed: ${e}`);
        }
    };

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('fomopomo_notification_dismissed', 'true');
    };

    // ✨ Floating Mode: 권한이 이미 있거나 사용자가 닫았으면 숨김
    if (mode === 'floating') {
        if (permission === 'granted' || !isVisible) return null;

        return (
            <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 animate-bounce">
                <button
                    onClick={requestPermission}
                    className="bg-rose-500 text-white px-4 py-2 rounded-full shadow-lg hover:opacity-90 transition-all text-sm font-medium flex items-center gap-2"
                >
                    <span>🔔</span>
                    <span>알림 켜기</span>
                </button>
                <button 
                    onClick={handleDismiss}
                    className="bg-white text-gray-400 hover:text-gray-600 rounded-full p-1 shadow-md w-6 h-6 flex items-center justify-center text-xs"
                    aria-label="닫기"
                >
                    ✕
                </button>
            </div>
        );
    }

    // ✨ Inline Mode: 설정 페이지용 UI
    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm font-medium">알림 권한 상태</span>
                <span className={`text-xs font-bold px-2 py-1 rounded ${
                    permission === 'granted' ? 'bg-green-100 text-green-600' : 
                    permission === 'denied' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}>
                    {permission === 'granted' ? '허용됨' : 
                     permission === 'denied' ? '거부됨' : '미설정'}
                </span>
            </div>

            {permission !== 'granted' && (
                 <button 
                    onClick={requestPermission}
                    className="w-full py-2 bg-rose-500 text-white rounded-lg text-sm font-bold hover:bg-rose-600 transition-colors"
                >
                    알림 권한 요청하기
                </button>
            )}

            {permission === 'granted' && (
                <button 
                    onClick={sendTestNotification}
                    className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-100 transition-colors"
                >
                    🔔 테스트 알림 발송
                </button>
            )}

            {/* 디버그 로그 토글 (관리자 전용) */}
            {isAdmin && (
                <div className="pt-2">
                    <button 
                        onClick={() => setIsOpen(!isOpen)} 
                        className="text-[10px] text-gray-400 underline hover:text-gray-600"
                    >
                        {isOpen ? '디버그 로그 숨기기' : '디버그 로그 보기'}
                    </button>
                    
                    {isOpen && (
                        <div className="mt-2 p-2 bg-gray-900 text-green-400 rounded text-[10px] font-mono h-32 overflow-y-auto">
                            {debugLog.map((log, i) => (
                                <div key={i} className="border-b border-gray-800 last:border-0 py-0.5">
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
