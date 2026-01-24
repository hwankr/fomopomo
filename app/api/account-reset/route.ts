import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

type ImageRow = {
  images?: string[] | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageBucket = 'feedback-uploads';
const publicMarker = `/storage/v1/object/public/${storageBucket}/`;

const base64UrlToUtf8 = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  return Buffer.from(padded, 'base64').toString('utf-8');
};

const getProjectRefFromUrl = (url: string) => {
  try {
    const host = new URL(url).host;
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
};

const getProjectRefFromServiceKey = (token: string) => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(base64UrlToUtf8(parts[1]));
    return typeof payload?.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
};

const getAccessToken = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
};

const extractStoragePaths = (rows: ImageRow[]) => {
  const paths = rows
    .flatMap((row) => (Array.isArray(row.images) ? row.images : []))
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .map((url) => {
      const index = url.indexOf(publicMarker);
      if (index === -1) return null;
      return url.slice(index + publicMarker.length);
    })
    .filter((path): path is string => !!path);

  return Array.from(new Set(paths));
};

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server not configured' },
      { status: 500 }
    );
  }

  const urlProjectRef = getProjectRefFromUrl(supabaseUrl);
  const keyProjectRef = getProjectRefFromServiceKey(serviceRoleKey);
  if (!urlProjectRef || !keyProjectRef || urlProjectRef !== keyProjectRef) {
    console.error('Supabase project ref mismatch', {
      urlProjectRef,
      keyProjectRef,
    });
    return NextResponse.json(
      { error: 'Supabase config mismatch' },
      { status: 500 }
    );
  }

  const expectedProjectRef = process.env.SUPABASE_PROJECT_REF;
  if (expectedProjectRef && expectedProjectRef !== urlProjectRef) {
    console.error('Supabase project ref does not match expected', {
      urlProjectRef,
      expectedProjectRef,
    });
    return NextResponse.json(
      { error: 'Supabase project ref mismatch' },
      { status: 500 }
    );
  }

  const allowedProjectRefs = process.env.SUPABASE_ALLOWED_PROJECT_REFS;
  if (allowedProjectRefs) {
    const allowed = allowedProjectRefs
      .split(',')
      .map((ref) => ref.trim())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(urlProjectRef)) {
      console.error('Supabase project ref not allowed', {
        urlProjectRef,
        allowed,
      });
      return NextResponse.json(
        { error: 'Supabase project ref not allowed' },
        { status: 500 }
      );
    }
  }

  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: userError } =
    await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  const { data: ownedGroups, error: ownedGroupsError } = await supabaseAdmin
    .from('groups')
    .select('id, name')
    .eq('leader_id', user.id);

  if (ownedGroupsError) {
    console.error('Failed to check owned groups:', ownedGroupsError);
    return NextResponse.json(
      { error: 'Failed to check groups' },
      { status: 500 }
    );
  }

  if (ownedGroups && ownedGroups.length > 0) {
    const ownedGroupIds = ownedGroups.map((group) => group.id);
    const { data: memberRows, error: memberRowsError } = await supabaseAdmin
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', ownedGroupIds);

    if (memberRowsError) {
      console.error('Failed to check group members:', memberRowsError);
      return NextResponse.json(
        { error: 'Failed to check group members' },
        { status: 500 }
      );
    }

    const groupsWithOtherMembers = new Set<string>();
    (memberRows ?? []).forEach((row) => {
      if (row.user_id !== user.id) {
        groupsWithOtherMembers.add(row.group_id);
      }
    });

    const blockedGroups = ownedGroups.filter((group) =>
      groupsWithOtherMembers.has(group.id)
    );
    const soloGroups = ownedGroups.filter(
      (group) => !groupsWithOtherMembers.has(group.id)
    );

    if (blockedGroups.length > 0) {
      return NextResponse.json(
        { error: 'leader', groups: blockedGroups },
        { status: 409 }
      );
    }

    if (soloGroups.length > 0) {
      const soloGroupIds = soloGroups.map((group) => group.id);
      const { error: deleteMembersError } = await supabaseAdmin
        .from('group_members')
        .delete()
        .in('group_id', soloGroupIds);
      if (deleteMembersError) {
        console.error('Failed to delete solo group members:', deleteMembersError);
        return NextResponse.json(
          { error: 'Failed to delete solo group members' },
          { status: 500 }
        );
      }

      const { error: deleteGroupsError } = await supabaseAdmin
        .from('groups')
        .delete()
        .in('id', soloGroupIds);
      if (deleteGroupsError) {
        console.error('Failed to delete solo groups:', deleteGroupsError);
        return NextResponse.json(
          { error: 'Failed to delete solo groups' },
          { status: 500 }
        );
      }
    }
  }

  const { data: feedbackRows, error: feedbackImagesError } = await supabaseAdmin
    .from('feedbacks')
    .select('images')
    .eq('user_id', user.id);

  if (feedbackImagesError) {
    console.error('Failed to fetch feedback images:', feedbackImagesError);
    return NextResponse.json(
      { error: 'Failed to fetch feedback images' },
      { status: 500 }
    );
  }

  const { data: replyRows, error: replyImagesError } = await supabaseAdmin
    .from('feedback_replies')
    .select('images')
    .eq('user_id', user.id);

  if (replyImagesError) {
    console.error('Failed to fetch reply images:', replyImagesError);
    return NextResponse.json(
      { error: 'Failed to fetch reply images' },
      { status: 500 }
    );
  }

  const imagePaths = extractStoragePaths([
    ...(feedbackRows ?? []),
    ...(replyRows ?? []),
  ]);

  if (imagePaths.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < imagePaths.length; i += chunkSize) {
      const chunk = imagePaths.slice(i, i + chunkSize);
      const { error: removeError } = await supabaseAdmin.storage
        .from(storageBucket)
        .remove(chunk);
      if (removeError) {
        console.error('Failed to delete feedback images:', removeError);
        return NextResponse.json(
          { error: 'Failed to delete feedback images' },
          { status: 500 }
        );
      }
    }
  }

  try {
    const deleteByUserId = async (table: string, column = 'user_id') => {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(column, user.id);
      if (error) throw error;
    };

    await deleteByUserId('feedback_likes');
    await deleteByUserId('feedback_replies');
    await deleteByUserId('feedbacks');

    await deleteByUserId('friendships');
    await deleteByUserId('friendships', 'friend_id');
    await deleteByUserId('friend_requests', 'sender_id');
    await deleteByUserId('friend_requests', 'receiver_id');

    await deleteByUserId('group_members');
    await deleteByUserId('study_sessions');

    await deleteByUserId('tasks');
    await deleteByUserId('weekly_plans');
    await deleteByUserId('monthly_plans');

    await deleteByUserId('user_settings');
    await deleteByUserId('timer_states');
    await deleteByUserId('push_subscriptions');

    const { error: profileResetError } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'offline',
        current_task: null,
        last_active_at: new Date().toISOString(),
        study_start_time: null,
        total_stopwatch_time: 0,
        timer_type: 'stopwatch',
        timer_mode: 'focus',
        timer_duration: 0,
        is_task_public: true,
      })
      .eq('id', user.id);

    if (profileResetError) throw profileResetError;
  } catch (error) {
    console.error('Account reset failed:', error);
    return NextResponse.json(
      { error: 'Account reset failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
