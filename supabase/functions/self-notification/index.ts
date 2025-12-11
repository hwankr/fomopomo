// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push';

console.log('Hello from Self Notification Function!');

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

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

interface NotificationRequest {
    user_id: string;
    title: string;
    body: string;
    type: 'timer_complete' | 'break_complete';
    url?: string;
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    try {
        const payload: NotificationRequest = await req.json();
        const { user_id, title, body, type, url } = payload;

        await supabase.from('debug_logs').insert({
            message: 'Self notification request received',
            details: { user_id, type }
        });

        if (!user_id) {
            return new Response(JSON.stringify({ error: 'user_id is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Get push subscriptions for the user
        const { data: subscriptions, error: subsError } = await supabase
            .from('push_subscriptions')
            .select('endpoint, keys, id')
            .eq('user_id', user_id);

        if (subsError) {
            await supabase.from('debug_logs').insert({
                message: 'Error fetching self subscriptions',
                details: subsError
            });
            return new Response(JSON.stringify({ error: 'Error fetching subscriptions' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!subscriptions || subscriptions.length === 0) {
            await supabase.from('debug_logs').insert({
                message: 'No subscriptions found for self notification',
                details: { user_id }
            });
            return new Response(JSON.stringify({ message: 'No subscriptions found' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Prepare notification payload
        const notificationPayload = JSON.stringify({
            title: title || 'fomopomo',
            body: body || '타이머가 완료되었습니다!',
            url: url || '/',
            type: type,
        });

        // Send to all user's devices
        const promises = subscriptions.map((sub) =>
            webpush.sendNotification(sub, notificationPayload)
                .then(() => supabase.from('debug_logs').insert({
                    message: 'Self notification sent',
                    details: { subId: sub.id, type }
                }))
                .catch((err) => {
                    supabase.from('debug_logs').insert({
                        message: 'Error sending self notification',
                        details: { subId: sub.id, error: err.message }
                    });
                    console.error('Error sending notification to', sub.id, err);
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        supabase.from('push_subscriptions').delete().eq('id', sub.id).then();
                    }
                })
        );

        await Promise.all(promises);

        return new Response(JSON.stringify({
            success: true,
            message: `Notified ${subscriptions.length} device(s)`
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (e) {
        console.error(e);
        await supabase.from('debug_logs').insert({
            message: 'Self notification unhandled error',
            details: { error: e.message }
        });
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
