// Only same-window messages from the configured local editor reach the extension.
window.addEventListener('message', event => {
  const m = event.data;
  if (event.source !== window || event.origin !== location.origin || m?.type !== 'aina-critter-request' || typeof m.nonce !== 'string' || m.nonce.length > 100) return;
  if (!['tabs', 'execute'].includes(m.operation)) return;
  chrome.runtime.sendMessage({ operation: m.operation, tabId: m.tabId, input: m.input }, result => {
    const failed = chrome.runtime.lastError;
    window.postMessage({ type: 'aina-critter-response', nonce: m.nonce, result: failed ? { ok: false, code: 'disconnected' } : result }, location.origin);
  });
});
