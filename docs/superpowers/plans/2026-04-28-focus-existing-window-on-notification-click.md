# Focus Existing Window On Notification Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows notification clicks should reuse and focus an existing Fomopomo browser/PWA window before opening a new one.

**Architecture:** Move service-worker window selection into a tiny browser-compatible helper under `public/`, cover it with Vitest using `vm`, and call it from `public/sw.js` on `notificationclick`. The helper resolves notification URLs safely, prefers an exact existing window, then reuses any same-origin app window by navigating and focusing it, and only falls back to `clients.openWindow()` when no reusable window exists.

**Tech Stack:** Next.js 16 app, browser Service Worker API, plain JavaScript in `public/`, Vitest.

---

## File Structure

- Create: `public/sw-navigation.js`
  - Owns notification click window routing.
  - Must be plain JS that works in both service workers via `importScripts('/sw-navigation.js')` and tests via `module.exports`.
- Create: `public/__tests__/sw-navigation.test.js`
  - Loads the public helper with Node `vm`.
  - Tests exact-window focus, same-origin navigate/focus, new-window fallback, and invalid URL fallback.
- Modify: `public/sw.js`
  - Imports the helper.
  - Replaces direct `clients.openWindow(...)` with helper call.
- No package changes.
- No new dependencies.

## Behavioral Rules

1. If a Fomopomo window is already open at the notification target URL, focus that window.
2. If a Fomopomo window is open at a different same-origin URL, navigate that window to the notification target URL, then focus it.
3. If no same-origin Fomopomo window exists, open a new window.
4. If notification data has a bad or missing URL, use `/`.
5. Do not focus or navigate cross-origin windows.

---

### Task 1: Add Tested Service Worker Navigation Helper

**Files:**
- Create: `public/sw-navigation.js`
- Create: `public/__tests__/sw-navigation.test.js`

- [ ] **Step 1: Create the failing test file**

Create `public/__tests__/sw-navigation.test.js` with this complete content:

```js
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadNavigationHelper() {
  const code = readFileSync(new URL('../sw-navigation.js', import.meta.url), 'utf8');
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
  return {
    url,
    focus: vi.fn().mockResolvedValue({ url, focused: true }),
    navigate: vi.fn().mockImplementation(async (targetUrl) => ({
      url: targetUrl,
      focus: vi.fn().mockResolvedValue({ url: targetUrl, focused: true }),
    })),
  };
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run test:run -- public/__tests__/sw-navigation.test.js
```

Expected: FAIL because `public/sw-navigation.js` does not exist.

- [ ] **Step 3: Create the minimal navigation helper**

Create `public/sw-navigation.js` with this complete content:

```js
(function attachFomopomoSwNavigation(globalScope) {
  function resolveTargetUrl(rawUrl, origin) {
    try {
      return new URL(rawUrl || '/', origin).href;
    } catch (_error) {
      return new URL('/', origin).href;
    }
  }

  function isSameOriginClient(client, origin) {
    try {
      return new URL(client.url).origin === origin;
    } catch (_error) {
      return false;
    }
  }

  async function focusClient(client) {
    if (client && typeof client.focus === 'function') {
      return client.focus();
    }
    return client;
  }

  async function focusOrOpenNotificationTarget({
    clientsApi,
    targetUrl,
    origin,
  }) {
    const resolvedTargetUrl = resolveTargetUrl(targetUrl, origin);
    const windowClients = await clientsApi.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    const exactClient = windowClients.find(
      (client) => client.url === resolvedTargetUrl && isSameOriginClient(client, origin)
    );

    if (exactClient) {
      return focusClient(exactClient);
    }

    const sameOriginClient = windowClients.find((client) =>
      isSameOriginClient(client, origin)
    );

    if (sameOriginClient) {
      if (
        sameOriginClient.url !== resolvedTargetUrl &&
        typeof sameOriginClient.navigate === 'function'
      ) {
        const navigatedClient = await sameOriginClient.navigate(resolvedTargetUrl);
        return focusClient(navigatedClient || sameOriginClient);
      }

      return focusClient(sameOriginClient);
    }

    return clientsApi.openWindow(resolvedTargetUrl);
  }

  const api = {
    resolveTargetUrl,
    focusOrOpenNotificationTarget,
  };

  globalScope.FomopomoSwNavigation = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
npm run test:run -- public/__tests__/sw-navigation.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/sw-navigation.js public/__tests__/sw-navigation.test.js
git commit -m "Add reusable notification window routing helper

Notification clicks should focus an existing app window instead of
always opening a new one. This helper keeps the service worker logic
small and testable without adding a build step for public assets.

Constraint: Service worker assets under public must run without bundling
Rejected: Put all logic directly in public/sw.js | hard to unit test
Confidence: high
Scope-risk: narrow
Tested: npm run test:run -- public/__tests__/sw-navigation.test.js
Not-tested: Manual Windows toast click behavior"
```

---

### Task 2: Wire Notification Clicks To The Helper

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Update the service worker import and click handler**

Modify `public/sw.js` so the top of the file imports the helper:

```js
importScripts('/sw-navigation.js');
```

Replace the current `notificationclick` listener:

```js
self.addEventListener('notificationclick', function (event) {
  console.log('Notification click received.');
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
```

with this complete listener:

```js
self.addEventListener('notificationclick', function (event) {
  console.log('Notification click received.');
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url;

  event.waitUntil(
    self.FomopomoSwNavigation.focusOrOpenNotificationTarget({
      clientsApi: clients,
      targetUrl,
      origin: self.location.origin,
    })
  );
});
```

- [ ] **Step 2: Run the focused helper test again**

Run:

```bash
npm run test:run -- public/__tests__/sw-navigation.test.js
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS. If lint reports `no-undef` for service worker globals in `public/sw.js`, add this comment as the first line of `public/sw.js` before `importScripts`:

```js
/* global self, clients, importScripts */
```

Then rerun:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "Reuse open app window from notification clicks

Windows toast clicks now ask the service worker to focus or navigate an
existing same-origin Fomopomo window before falling back to opening a
new window.

Constraint: Existing notifications store the target in notification.data.url
Rejected: Always focus the first window without navigation | can leave users on the wrong route
Confidence: high
Scope-risk: narrow
Tested: npm run test:run -- public/__tests__/sw-navigation.test.js; npm run lint
Not-tested: Manual Windows toast click behavior"
```

---

### Task 3: Verify In Browser And On Windows Toast Click

**Files:**
- No source file changes expected.

- [ ] **Step 1: Build the app**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 2: Start the app**

Run:

```bash
npm run start
```

Expected: app serves successfully on the configured Next.js port.

- [ ] **Step 3: Reset the registered service worker**

In the browser DevTools Application tab:

```text
Application -> Service workers -> Unregister existing /sw.js -> reload page
```

Expected: `/sw.js` is registered again and imports `/sw-navigation.js`.

- [ ] **Step 4: Manual check with one existing window**

1. Open Fomopomo in one browser/PWA window.
2. Grant notification permission if needed.
3. Start a short timer preset.
4. Wait for the Windows notification.
5. Click the Windows notification.

Expected: the already-open Fomopomo window is focused. A second Fomopomo window is not created.

- [ ] **Step 5: Manual check with existing window on a different app route**

1. Keep one Fomopomo window open on `/profile` or another same-origin route.
2. Trigger a timer-complete notification whose `data.url` is the timer page URL.
3. Click the Windows notification.

Expected: the existing Fomopomo window is navigated to the notification target URL and focused. A second Fomopomo window is not created.

- [ ] **Step 6: Manual check with no existing window**

1. Close all Fomopomo windows.
2. Trigger or leave a visible notification.
3. Click the Windows notification.

Expected: a new Fomopomo window opens at the notification target URL.

- [ ] **Step 7: Final verification**

Run:

```bash
npm run test:run -- public/__tests__/sw-navigation.test.js
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 8: Commit manual verification notes if any source changes were needed**

If Task 3 required code changes, commit them:

```bash
git add public/sw.js public/sw-navigation.js public/__tests__/sw-navigation.test.js
git commit -m "Stabilize notification click window reuse

Manual Windows notification testing confirmed the service worker reuses
an existing app window and only opens a new one when no same-origin app
window exists.

Constraint: Browser service worker updates require unregister/reload during local verification
Confidence: high
Scope-risk: narrow
Tested: npm run test:run -- public/__tests__/sw-navigation.test.js; npm run lint; npm run build; manual Windows notification click
Not-tested: Installed PWA behavior across multiple browser profiles"
```

If Task 3 did not require source changes, do not create an empty commit.

---

## Self-Review

**Spec coverage:** The plan covers the reported Windows notification click behavior by replacing unconditional `clients.openWindow(...)` with existing-window reuse.

**Placeholder scan:** No task uses TBD, TODO, "implement later", or unspecified test instructions.

**Type consistency:** The helper API is consistently named `focusOrOpenNotificationTarget` in tests and `public/sw.js`.

**Remaining risks:** Windows/browser behavior around `WindowClient.navigate()` can vary in installed PWA mode, so manual Windows verification is required after automated tests pass.
