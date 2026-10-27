const Sources = require('./public/sources');
const Core = require('./public/core');

async function loadPublicSource(url, fetcher = fetch) {
  return Core.importData(await Sources.load(url, async route => {
    let response;
    try { response = await fetcher('https://critterdb.com' + route, { redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error('Could not reach CritterDB. Import a JSON file or try again.'); }
    if (!response.ok) throw new Error('This link is private or unavailable. Import its JSON file, or use Send to Aina from your signed-in CritterDB tab.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) throw new Error('Source exceeds the 20 MB import limit.');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('This link is private or unavailable. Import its JSON file, or use Send to Aina from your signed-in CritterDB tab.'); }
  })).data;
}
module.exports = { loadPublicSource };
