import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type OwnedGroup = { id: string; name: string };
type MemberRow = { group_id: string; user_id: string };
type ImageRow = { images?: string[] | null };

type MockClientOverrides = {
  ownedGroups?: OwnedGroup[];
  memberRows?: MemberRow[];
  feedbackRows?: ImageRow[];
  replyRows?: ImageRow[];
  profileDeleteError?: unknown;
  authGetUserError?: unknown;
};

function toBase64Url(value: string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeServiceRoleKey(ref: string) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({ ref }));
  return `${header}.${payload}.signature`;
}

function makeOpaqueServiceRoleKey() {
  return 'sb_secret_test_opaque_key';
}

function createMockClient(overrides: MockClientOverrides = {}) {
  const state = {
    deleteEqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
    deleteInCalls: [] as Array<{ table: string; column: string; values: unknown[] }>,
    profileDeleteCalls: [] as Array<{ table: string; column: string; value: unknown }>,
    deleteUserMock: vi.fn(async () => ({ error: null })),
    storageRemoveMock: vi.fn(async () => ({ error: null })),
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: overrides.authGetUserError ? null : { id: 'user-1' } },
        error: overrides.authGetUserError ?? null,
      })),
      admin: {
        deleteUser: state.deleteUserMock,
      },
    },
    from: vi.fn((table: string) => {
      let mode: 'select' | 'delete' = 'select';

      const query = {
        select: vi.fn(() => {
          mode = 'select';
          return query;
        }),
        delete: vi.fn(() => {
          mode = 'delete';
          return query;
        }),
        eq: vi.fn(async (column: string, value: unknown) => {
          if (mode === 'select') {
            if (table === 'groups') {
              return { data: overrides.ownedGroups ?? [], error: null };
            }
            if (table === 'feedbacks') {
              return { data: overrides.feedbackRows ?? [], error: null };
            }
            if (table === 'feedback_replies') {
              return { data: overrides.replyRows ?? [], error: null };
            }
            throw new Error(`Unexpected select().eq() for table ${table}`);
          }

          if (table === 'profiles') {
            state.profileDeleteCalls.push({ table, column, value });
            return { error: overrides.profileDeleteError ?? null };
          }

          state.deleteEqCalls.push({ table, column, value });
          return { error: null };
        }),
        in: vi.fn(async (column: string, values: unknown[]) => {
          if (mode === 'select' && table === 'group_members') {
            return { data: overrides.memberRows ?? [], error: null };
          }

          if (mode === 'delete') {
            state.deleteInCalls.push({ table, column, values });
            return { error: null };
          }

          throw new Error(`Unexpected ${mode}.in() for table ${table}`);
        }),
      };

      return query;
    }),
    storage: {
      from: vi.fn(() => ({
        remove: state.storageRemoveMock,
      })),
    },
  };

  return { client, state };
}

async function loadPostHandler(
  client: ReturnType<typeof createMockClient>['client'],
  envOverrides: {
    supabaseUrl?: string;
    serviceRoleKey?: string;
    projectRef?: string | undefined;
    allowedProjectRefs?: string | undefined;
  } = {}
) {
  vi.resetModules();
  const createClientMock = vi.fn(() => client);
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
  }));

  process.env.NEXT_PUBLIC_SUPABASE_URL =
    envOverrides.supabaseUrl ?? 'https://project123.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    envOverrides.serviceRoleKey ?? makeServiceRoleKey('project123');

  if (envOverrides.projectRef === undefined) {
    process.env.SUPABASE_PROJECT_REF = 'project123';
  } else if (envOverrides.projectRef === '') {
    delete process.env.SUPABASE_PROJECT_REF;
  } else {
    process.env.SUPABASE_PROJECT_REF = envOverrides.projectRef;
  }

  if (envOverrides.allowedProjectRefs === undefined) {
    process.env.SUPABASE_ALLOWED_PROJECT_REFS = 'project123';
  } else if (envOverrides.allowedProjectRefs === '') {
    delete process.env.SUPABASE_ALLOWED_PROJECT_REFS;
  } else {
    process.env.SUPABASE_ALLOWED_PROJECT_REFS = envOverrides.allowedProjectRefs;
  }

  const routeModule = await import('../route');
  return {
    POST: routeModule.POST,
    createClientMock,
  };
}

describe('account-delete route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 when the bearer token is missing', async () => {
    const { client } = createMockClient();
    const { POST, createClientMock } = await loadPostHandler(client);

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Missing auth token' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the user leads a group with other members', async () => {
    const { client } = createMockClient({
      ownedGroups: [{ id: 'group-1', name: 'Study Group' }],
      memberRows: [{ group_id: 'group-1', user_id: 'other-user' }],
    });
    const { POST } = await loadPostHandler(client);

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'leader',
      message: 'Group leaders must transfer ownership before deleting the account.',
      groups: [{ id: 'group-1', name: 'Study Group' }],
    });
  });

  it('returns 401 when auth.getUser rejects the bearer token', async () => {
    const { client } = createMockClient({
      authGetUserError: { message: 'invalid token' },
    });
    const { POST } = await loadPostHandler(client);

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid auth token' });
  });

  it('accepts opaque service role keys when the configured project ref matches the URL', async () => {
    const { client } = createMockClient();
    const { POST } = await loadPostHandler(client, {
      serviceRoleKey: makeOpaqueServiceRoleKey(),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('fails closed for opaque service role keys when the configured project ref mismatches the URL', async () => {
    const { client } = createMockClient();
    const { POST, createClientMock } = await loadPostHandler(client, {
      serviceRoleKey: makeOpaqueServiceRoleKey(),
      projectRef: 'other-project',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Supabase config mismatch',
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('fails closed for unknown non-JWT service role keys', async () => {
    const { client } = createMockClient();
    const { POST, createClientMock } = await loadPostHandler(client, {
      serviceRoleKey: 'not-a-jwt-or-secret',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Supabase config mismatch',
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns 200 and deletes the profile before deleting the auth user', async () => {
    const { client, state } = createMockClient();
    const { POST } = await loadPostHandler(client);

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(state.profileDeleteCalls).toEqual([
      { table: 'profiles', column: 'id', value: 'user-1' },
    ]);
    expect(state.deleteUserMock).toHaveBeenCalledWith('user-1');
    expect(
      state.deleteEqCalls.some(
        (call) => call.table === 'study_sessions' && call.column === 'user_id'
      )
    ).toBe(true);
  });

  it('returns 500 when cleanup fails during the profile delete step', async () => {
    const { client } = createMockClient({
      profileDeleteError: { message: 'profile delete failed' },
    });
    const { POST } = await loadPostHandler(client);

    const response = await POST(
      new NextRequest('http://localhost/api/account-delete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Account delete failed',
    });
  });
});
