const { test } = require('node:test');
const assert = require('node:assert/strict');
const Sources = require('../src/critter/public/sources');
const { loadPublicSource } = require('../src/critter/sources');
const { creature } = require('./critter-fixture');
const ID = '111111111111111111111111';

test('source loader accepts exact CritterDB routes and rejects arbitrary hosts before fetching', async () => {
  assert.deepEqual(Sources.parse(`https://critterdb.com:443/#/publishedbestiary/view/${ID}`), { kind: 'publishedbestiary', id: ID });
  for (const url of [`https://evil.test/#/creature/view/${ID}`, `http://critterdb.com/#/creature/view/${ID}`, `https://critterdb.com:4317/#/creature/view/${ID}`, `https://user@critterdb.com/#/creature/view/${ID}`, `https://critterdb.com/?token=secret#/creature/view/${ID}`]) {
    await assert.rejects(loadPublicSource(url, () => { throw new Error('Must not fetch'); }), /HTTPS CritterDB/);
  }
});
test('published bestiary pagination retains collection metadata and complete creature data', async () => {
  const routes = [], original = creature();
  const loaded = await Sources.load(`https://critterdb.com/#/publishedbestiary/view/${ID}`, async route => {
    routes.push(route);
    if (route.endsWith('/1')) return [original];
    if (route.endsWith('/2')) return [{ ...original, name: 'Second creature' }];
    if (route.endsWith('/3')) return [];
    return { _id: ID, name: 'Published test', extra: { keep: true } };
  });
  assert.equal(routes.length, 4); assert.equal(loaded.creatures.length, 2);
  assert.deepEqual(loaded.creatures[0], original); assert.deepEqual(loaded.extra, { keep: true });
});
test('public import uses only read-only fixed-host requests and keeps unknown fields and YAML', async () => {
  const original = creature();
  const loaded = await loadPublicSource(`https://critterdb.com/#/creature/view/${ID}`, async (url, options) => {
    assert.equal(url, `https://critterdb.com/api/creatures/${ID}`);
    assert.equal(options.method, undefined); assert.equal(options.headers, undefined); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(original));
  });
  assert.deepEqual(loaded, original);
});
test('private links give the existing-browser or JSON alternative without requesting credentials', async () => {
  await assert.rejects(loadPublicSource(`https://critterdb.com/#/bestiary/view/${ID}`, async () => new Response('No token provided', { status: 400 })), /Send to Aina/);
});
