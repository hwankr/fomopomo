import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    console.log('[self-notification API] Request received');
    try {
        const body = await request.json();
        console.log('[self-notification API] Body:', body);
        const { type, title, body: notificationBody } = body;

        // Get auth header
        const authHeader = request.headers.get('authorization');
        console.log('[self-notification API] Auth header present:', !!authHeader);
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');

        // Create Supabase client with user token
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            }
        );

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Call self-notification Edge Function
        console.log('[self-notification API] Calling Edge Function with user_id:', user.id);
        const { data, error } = await supabase.functions.invoke('self-notification', {
            body: {
                user_id: user.id,
                title,
                body: notificationBody,
                type,
                url: '/',
            },
        });

        console.log('[self-notification API] Edge Function response:', { data, error });

        if (error) {
            console.error('Edge Function error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
