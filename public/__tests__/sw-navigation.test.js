import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

function loadNavigationHelper() {
  const code = readFileSync(resolve(process.cwd(), 'public/sw-navigation.js'), 'utf8');
  const sandbox = {
    URL,
    module: { exports: {} },
    console,
    self: {
      location: {
        origin: 'https://fomopomo.test',
      },
    },
  };

  vm.runInNewContext(code, sandbox, {
    filename: 'sw-navigation.js',
  });

  return sandbox.module.exports;
}

function createClient(url) {
  const client = {
    url,
    focus: vi.fn().mockResolvedValue({ url, focused: true }),
    lastNavigatedClient: null,
    navigate: vi.fn().mockImplementation(async (targetUrl) => {
      const navigatedClient = {
        url: targetUrl,
        focus: vi.fn().mockResolvedValue({ url: targetUrl, focused: true }),
      };

      client.lastNavigatedClient = navigatedClient;
      return navigatedClient;
    }),
  };

  return client;
}

describe('sw-navigation', () => {
  it('focuses an existing exact target window', async () => {
    const { focusOrOpenNotificationTarget } = loadNavigationHelper();
    const targetClient = createClient('https://fomopomo.test/timer');
    const otherClient = createClient('https://fomopomo.test/profile');
    const clientsApi = {
      matchAll: vi.fn().mockResolvedValue([otherClient, targetClient]),
      openWindow: vi.fn(),
    };

    await focusOrOpenNotificationTarget({
      clientsApi,
      targetUrl: '/timer',
      origin: 'https://fomopomo.test',
    });

    expect(clientsApi.matchAll).toHaveBeenCalledWith({
      type: 'window',
      includeUncontrolled: true,
    });
    expect(targetClient.focus).toHaveBeenCalledTimes(1);
    expect(otherClient.navigate).not.toHaveBeenCalled();
    expect(clientsApi.openWindow).not.toHaveBeenCalled();
  });

  it('navigates and focuses an existing same-origin app window', async () => {
    const { focusOrOpenNotificationTarget } = loadNavigationHelper();
    const existingClient = createClient('https://fomopomo.test/profile');
    const clientsApi = {
      matchAll: vi.fn().mockResolvedValue([existingClient]),
      openWindow: vi.fn(),
    };

    await focusOrOpenNotificationTarget({
      clientsApi,
      targetUrl: '/timer',
      origin: 'https://fomopomo.test',
    });

    expect(existingClient.navigate).toHaveBeenCalledWith('https://fomopomo.test/timer');
    expect(existingClient.lastNavigatedClient.focus).toHaveBeenCalledTimes(1);
    expect(clientsApi.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window when no same-origin app window exists', async () => {
    const { focusOrOpenNotificationTarget } = loadNavigationHelper();
    const crossOriginClient = createClient('https://example.test/timer');
    const clientsApi = {
      matchAll: vi.fn().mockResolvedValue([crossOriginClient]),
      openWindow: vi.fn().mockResolvedValue({ url: 'https://fomopomo.test/timer' }),
    };

    await focusOrOpenNotificationTarget({
      clientsApi,
      targetUrl: '/timer',
      origin: 'https://fomopomo.test',
    });

    expect(crossOriginClient.focus).not.toHaveBeenCalled();
    expect(crossOriginClient.navigate).not.toHaveBeenCalled();
    expect(clientsApi.openWindow).toHaveBeenCalledWith('https://fomopomo.test/timer');
  });

  it('falls back to root for invalid notification URLs', async () => {
    const { focusOrOpenNotificationTarget } = loadNavigationHelper();
    const clientsApi = {
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue({ url: 'https://fomopomo.test/' }),
    };

    await focusOrOpenNotificationTarget({
      clientsApi,
      targetUrl: 'https://',
      origin: 'https://fomopomo.test',
    });

    expect(clientsApi.openWindow).toHaveBeenCalledWith('https://fomopomo.test/');
  });
});
