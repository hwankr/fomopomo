(function attachFomopomoSwNavigation(globalScope) {
  function resolveTargetUrl(rawUrl, origin) {
    try {
      return new URL(rawUrl || '/', origin).href;
    } catch {
      return new URL('/', origin).href;
    }
  }

  function isSameOriginClient(client, origin) {
    try {
      return new URL(client.url).origin === origin;
    } catch {
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
