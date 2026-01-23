// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push';

console.log('Hello from Push Notification Function!');

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const vapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@fomopomo.com',
};

webpush.setVapidDetails(
    vapidKeys.subject,
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    if (WEBHOOK_SECRET) {
        const headerSecret =
            req.headers.get('x-webhook-secret') ||
            req.headers.get('x-fomopomo-webhook-secret') ||
            req.headers.get('authorization');

        const token = headerSecret?.startsWith('Bearer ')
            ? headerSecret.slice('Bearer '.length).trim()
            : headerSecret?.trim();

        if (!token || token !== WEBHOOK_SECRET) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    try {
        const payload = await req.json();

        const { record, old_record } = payload;

        // Check triggers
        // 1. Profiles UPDATE: status changed to 'studying'
        let isStudyStart = false;
        if (record.status === 'studying') {
            // If it's an update, check if status actually changed
            if (!old_record || old_record.status !== 'studying') {
                isStudyStart = true;
            }
        }

        // 2. Fallback: If triggered by study_sessions INSERT (legacy support or if user prefers)
        // Check if record has user_id (study_sessions) but no status (profiles has status)
        if (!isStudyStart && record.user_id && !record.status) {
            return new Response('Not a study start event', { status: 200 });
        }

        if (!isStudyStart) {
            return new Response('Status not changed to studying', { status: 200 });
        }

        const userId = record.id; // profiles.id is the user_id

        // 1. Find friends (Source of Truth: friendships table)
        const { data: friends, error: friendsError } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', userId);

        if (friendsError) {
            await supabase.from('debug_logs').insert({ message: 'Error fetching friends', details: friendsError });
            return new Response('Error fetching friends', { status: 500 });
        }

        if (!friends || friends.length === 0) {
            return new Response('No friends found', { status: 200 });
        }

        const friendIds = friends.map((f) => f.friend_id);

        // 2. Get Push Subscriptions for friends
        const { data: subscriptions, error: subsError } = await supabase
            .from('push_subscriptions')
            .select('endpoint, keys, id')
            .in('user_id', friendIds);

        if (subsError) {
            await supabase.from('debug_logs').insert({ message: 'Error fetching subscriptions', details: subsError });
            return new Response('Error fetching subscriptions', { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return new Response('No subscriptions found', { status: 200 });
        }

        // 3. Get User Profile for name (record itself is profile, so use it)
        const displayName = record.nickname || record.email?.split('@')[0] || '친구';
        const taskName = record.current_task ? `"${record.current_task}" ` : '';

        // 4. Send notifications
        const notificationPayload = JSON.stringify({
            title: 'fomopomo',
            body: `${displayName}님이 ${taskName}공부를 시작했습니다! 🔥`,
            url: '/',
        });

        const promises = subscriptions.map((sub) =>
            webpush.sendNotification(sub, notificationPayload)
                .catch((err) => {
                    supabase.from('debug_logs').insert({ message: 'Error sending notification', details: { subId: sub.id, error: err } });
                    console.error('Error sending notification to', sub.id, err);
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Delete invalid subscription
                        supabase.from('push_subscriptions').delete().eq('id', sub.id).then();
                    }
                })
        );

        await Promise.all(promises);

        return new Response(`Notified ${subscriptions.length} devices`, {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error(e);
        await supabase.from('debug_logs').insert({ message: 'Unhandled error', details: { error: e.message } });
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

