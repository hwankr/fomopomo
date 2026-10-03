import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type OwnedGroup = { id: string; name: string };
type StorageObject = {
  id: string;
  bucket_id: string;
  name: string;
  owner_id: string;
};
const ownedObject = (id: number, name: string, ownerId = 'user-1'): StorageObject => ({
  id: `52000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  bucket_id: 'feedback-uploads', name, owner_id: ownerId,
});

type MockClientOverrides = {
  blockedGroups?: OwnedGroup[];
  groupCleanupError?: unknown;
  authDeleteFailures?: number;
  authGetUserError?: unknown;
  inventoryErrorAtCall?: number;
  inventoryPages?: StorageObject[][];
  storageRemoveErrorAtCall?: number;
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
  let inventoryCallCount = 0;
  let storageRemoveCallCount = 0;
  let authDeleteCallCount = 0;
  const state = {
    profileExists: true,
    authUserExists: true,
    deleteEqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
    deleteInCalls: [] as Array<{ table: string; column: string; values: unknown[] }>,
    profileDeleteCalls: [] as Array<{ table: string; column: string; value: unknown }>,
    deleteUserMock: vi.fn(async () => {
      authDeleteCallCount += 1;
      state.operations.push('auth-delete');
      if (authDeleteCallCount <= (overrides.authDeleteFailures ?? 0)) {
        return { error: { message: 'temporary Auth failure' } };
      }
      // Auth commits the user deletion and its profile FK cascade together.
      state.authUserExists = false;
      state.profileExists = false;
      return { error: null };
    }),
    operations: [] as string[],
    inventoryCalls: [] as Array<Record<string, unknown>>,
    inventoryMock: vi.fn(async (args: Record<string, unknown>) => {
      inventoryCallCount += 1;
      state.inventoryCalls.push(args);
      state.operations.push('inventory');
      if (overrides.inventoryErrorAtCall === inventoryCallCount) {
        return { data: null, error: { message: 'list failed' } };
      }

      return {
        data: overrides.inventoryPages?.[inventoryCallCount - 1] ?? [],
        error: null,
      };
    }),
    storageRemoveMock: vi.fn(async (paths: string[]) => {
      storageRemoveCallCount += 1;
      state.operations.push('storage-remove');
      if (overrides.storageRemoveErrorAtCall === storageRemoveCallCount) {
        return { data: null, error: { message: 'remove failed' } };
      }

      return { data: paths, error: null };
    }),
  };

  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_account_storage_objects') return state.inventoryMock(args);
      if (name !== 'cleanup_account_groups') throw new Error(`Unexpected RPC ${name}`);
      return {
        data: overrides.groupCleanupError ? null : overrides.blockedGroups?.length
          ? { status: 'leader', groups: overrides.blockedGroups }
          : { status: 'ready' },
        error: overrides.groupCleanupError ?? null,
      };
    }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: overrides.authGetUserError || !state.authUserExists ? null : { id: 'user-1' } },
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
            throw new Error(`Unexpected select().eq() for table ${table}`);
          }

          if (table === 'profiles') {
            state.profileDeleteCalls.push({ table, column, value });
            state.profileExists = false;
            return { error: null };
          }

          state.operations.push('data-delete');
          state.deleteEqCalls.push({ table, column, value });
          return { error: null };
        }),
        in: vi.fn(async (column: string, values: unknown[]) => {
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
        list: vi.fn(() => { throw new Error('Storage list has no ownership information'); }),
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
      blockedGroups: [{ id: 'group-1', name: 'Study Group' }],
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

  it('returns 200, verifies Storage cleanup, and deletes pinned tasks before deleting the auth user', async () => {
    const { client, state } = createMockClient({
      inventoryPages: [[
        ownedObject(1, 'user-1/123e4567-e89b-42d3-a456-426614174000.png'),
        ownedObject(2, 'user-1/legacy-upload.png'),
      ]],
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(state.profileDeleteCalls).toEqual([]);
    expect(client.rpc).toHaveBeenCalledWith('cleanup_account_groups', { p_user_id: 'user-1' });
    expect(state.deleteInCalls).toEqual([]);
    expect(state.deleteUserMock).toHaveBeenCalledWith('user-1');
    expect(state.inventoryCalls).toEqual([
      { p_user_id: 'user-1', p_after_id: null, p_limit: 100 },
      { p_user_id: 'user-1', p_after_id: null, p_limit: 1 },
    ]);
    expect(state.operations.indexOf('storage-remove')).toBeLessThan(state.operations.lastIndexOf('inventory'));
    expect(state.operations.lastIndexOf('inventory')).toBeLessThan(state.operations.indexOf('data-delete'));
    expect(state.storageRemoveMock).toHaveBeenCalledWith([
      'user-1/123e4567-e89b-42d3-a456-426614174000.png',
      'user-1/legacy-upload.png',
    ]);
    expect(
      state.deleteEqCalls.some(
        (call) => call.table === 'study_sessions' && call.column === 'user_id'
      )
    ).toBe(true);
    expect(
      state.deleteEqCalls.some(
        (call) => call.table === 'pinned_tasks' && call.column === 'user_id'
      )
    ).toBe(true);
    expect(
      state.deleteEqCalls.some(
        (call) => call.table === 'feedback_images' && call.column === 'user_id'
      )
    ).toBe(true);
  });

  it('returns 500 and stops before database cleanup when storage listing fails', async () => {
    const { client, state } = createMockClient({
      inventoryErrorAtCall: 1,
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
      error: 'Feedback storage cleanup failed',
      retryable: true,
      storageCleanup: {
        counts: {
          eligible: 0,
          listed: 0,
          pages: 0,
          removeRequests: 0,
          removed: 0,
          skipped: 0,
        },
        ok: false,
        retryable: true,
        status: 'storage_list_failed',
      },
    });
    expect(state.deleteEqCalls).toEqual([]);
    expect(state.profileDeleteCalls).toEqual([]);
    expect(state.deleteUserMock).not.toHaveBeenCalled();
  });

  it('keeps the profile after an Auth deletion failure and allows a safe retry', async () => {
    const { client, state } = createMockClient({ authDeleteFailures: 1 });
    const { POST } = await loadPostHandler(client);
    const request = () => new NextRequest('http://localhost/api/account-delete', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect((await POST(request())).status).toBe(500);
    expect(state.authUserExists).toBe(true);
    expect(state.profileExists).toBe(true);
    expect(state.profileDeleteCalls).toEqual([]);

    expect((await POST(request())).status).toBe(200);
    expect(state.deleteUserMock).toHaveBeenCalledTimes(2);
    expect(state.authUserExists).toBe(false);
    expect(state.profileExists).toBe(false);
    expect(state.profileDeleteCalls).toEqual([]);
  });

  it('stops before storage and account deletion when atomic group cleanup fails', async () => {
    const { client, state } = createMockClient({
      groupCleanupError: { message: 'group delete failed' },
    });
    const { POST } = await loadPostHandler(client);
    const response = await POST(new NextRequest('http://localhost/api/account-delete', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
    }));

    expect(response.status).toBe(500);
    expect(state.deleteInCalls).toEqual([]);
    expect(state.deleteEqCalls).toEqual([]);
    expect(state.inventoryMock).not.toHaveBeenCalled();
    expect(state.deleteUserMock).not.toHaveBeenCalled();
    expect(state.profileExists).toBe(true);
  });
  it('blocks database cleanup for user-owned legacy files outside the namespace', async () => {
    const { client, state } = createMockClient({
      inventoryPages: [[ownedObject(1, 'legacy-outside-user-namespace.png')]],
    });
    const { POST } = await loadPostHandler(client);
    const response = await POST(new NextRequest('http://localhost/api/account-delete', {
      method: 'POST', headers: { authorization: 'Bearer valid-token' },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      retryable: false, storageCleanup: { status: 'storage_unverified_objects' },
    });
    expect(state.storageRemoveMock).not.toHaveBeenCalled();
    expect(state.deleteEqCalls).toEqual([]);
    expect(state.deleteUserMock).not.toHaveBeenCalled();
  });

  it('blocks database cleanup if Storage reports success but an owned object remains', async () => {
    const file = ownedObject(1, 'user-1/legacy.png');
    const { client, state } = createMockClient({ inventoryPages: [[file], [file]] });
    const { POST } = await loadPostHandler(client);
    const response = await POST(new NextRequest('http://localhost/api/account-delete', {
      method: 'POST', headers: { authorization: 'Bearer valid-token' },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      retryable: true, storageCleanup: { status: 'storage_objects_remaining' },
    });
    expect(state.storageRemoveMock).toHaveBeenCalledWith(['user-1/legacy.png']);
    expect(state.deleteEqCalls).toEqual([]);
    expect(state.deleteUserMock).not.toHaveBeenCalled();
  });

});
