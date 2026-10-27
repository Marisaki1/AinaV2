chrome.storage.local.get('ainaOrigin').then(s => { if (s.ainaOrigin) document.querySelector('#origin').value = s.ainaOrigin; });
document.querySelector('#save').onclick = async () => {
  try {
    const url = new URL(document.querySelector('#origin').value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
    await chrome.storage.local.set({ ainaOrigin: url.origin });
    document.querySelector('#status').textContent = 'Saved. Refresh Aina, then connect your existing CritterDB tab.';
  } catch { document.querySelector('#status').textContent = 'Use the local Aina address, for example http://127.0.0.1:4317.'; }
};
