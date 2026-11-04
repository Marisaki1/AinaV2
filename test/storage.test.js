const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readJson, writeJson } = require('../src/utils/jsonStore');
const { createRegistry } = require('../src/utils/userRegistry');
let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aina-storage-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test('JSON writes preserve the last complete file when replacement fails and clean temporary files', t => {
  const file = path.join(directory, 'records.json');
  writeJson(file, { before: true });
  t.mock.method(fs, 'renameSync', () => { throw new Error('disk busy'); });
  assert.throws(() => writeJson(file, { after: true }), /disk busy/);
  assert.deepEqual(readJson(file), { before: true });
  assert.deepEqual(fs.readdirSync(directory), ['records.json']);
});

test('missing JSON uses a separate default, BOM is accepted, and corruption is never replaced with empty data', () => {
  const file = path.join(directory, 'records.json');
  const fallback = { values: [] };
  readJson(file, fallback).values.push(1);
  assert.deepEqual(fallback.values, []);
  fs.writeFileSync(file, '\ufeff{"old":true}');
  assert.deepEqual(readJson(file, {}), { old: true });
  fs.writeFileSync(file, '{broken');
  assert.throws(() => readJson(file, {}), /Cannot read JSON/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('registry batches writes, preserves unknown data, records each interaction type once, and returns snapshots', () => {
  const file = path.join(directory, 'users.json');
  writeJson(file, { person: { extra: 'preserve', firstSeen: '2020-01-01', guilds: ['server'], messageCount: 2, commandCount: 1 } });
  const registry = createRegistry(() => file);
  registry.record({ id: 'person', username: 'New name' }, 'server', 'command');
  registry.record({ id: 'person', username: 'New name' }, 'other', 'message');
  assert.equal(readJson(file).person.commandCount, 1);
  registry.get('person').guilds.push('fake');
  registry.flush();
  const saved = readJson(file).person;
  assert.equal(saved.extra, 'preserve');
  assert.equal(saved.commandCount, 2);
  assert.equal(saved.messageCount, 3);
  assert.equal(saved.firstSeen, '2020-01-01');
  assert.deepEqual(saved.guilds, ['server', 'other']);
});

test('corrupt registry does not block a command or destroy the damaged file', t => {
  t.mock.method(console, 'error', () => {});
  const file = path.join(directory, 'users.json');
  fs.writeFileSync(file, 'broken');
  const registry = createRegistry(() => file);
  assert.equal(registry.record({ id: 'person' }, 'server', 'command'), null);
  registry.flush();
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
});
