importScripts('page-operation.js');
const defaultOrigin = 'http://127.0.0.1:4317';
const critterURL = value => { try { const u = new URL(value); return u.protocol === 'https:' && ['critterdb.com', 'www.critterdb.com'].includes(u.hostname) && !u.port; } catch { return false; } };
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    const settings = await chrome.storage.local.get('ainaOrigin');
    let origin; try { origin = new URL(sender.url).origin; } catch { return { ok: false, code: 'permission_denied' }; }
    if (!sender.tab || sender.frameId !== 0 || origin !== (settings.ainaOrigin || defaultOrigin)) return { ok: false, code: 'permission_denied' };
    if (message?.operation === 'tabs') {
      const tabs = await chrome.tabs.query({ url: ['https://critterdb.com/*', 'https://www.critterdb.com/*'] });
      return { ok: true, version: chrome.runtime.getManifest().version, tabs: tabs.filter(t => critterURL(t.url)).map(t => ({ id: t.id, title: t.title || 'CritterDB', url: t.url, lastAccessed: t.lastAccessed || 0 })).sort((a, b) => b.lastAccessed - a.lastAccessed) };
    }
    if (message?.operation !== 'execute' || !Number.isInteger(message.tabId) || !['probe', 'read', 'source', 'save'].includes(message.input?.operation)) return { ok: false, code: 'unsupported' };
    const tab = await chrome.tabs.get(message.tabId);
    if (!critterURL(tab.url)) return { ok: false, code: 'disconnected' };
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: critterOperation, args: [message.input] });
    return result[0]?.result || { ok: false, code: 'disconnected' };
  })().then(respond, () => respond({ ok: false, code: 'disconnected' }));
  return true;
});
