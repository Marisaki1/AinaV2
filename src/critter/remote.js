const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const Core = require('./public/core');
const Remote = require('./public/remote-common');
const { RemoteError } = require('./remote-browser');
const { TabTransport } = require('./tab-transport');
const Sources = require('./public/sources');
const CreatureMath = require('./public/creature-math');

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
class RemoteEdits {
  constructor(store, { transport } = {}) {
    this.store = store;
    this.privateDirectory = path.join(store.directory, 'remote');
    this.file = path.join(this.privateDirectory, 'recovery.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { bindings: {}, drafts: {} };
    this.transport = transport || new TabTransport();
    this.reviews = new Map(); this.busy = false;
  }
  persist() { writeJSON(this.file, this.data); }
  view() {
    const result = this.store.read();
    for (const document of result.workspace.documents) {
      if (this.data.bindings[document.id] && this.data.drafts[document.id]) document.data = Core.clone(this.data.drafts[document.id].creature);
    }
    for (const [id, binding] of Object.entries(this.data.bindings)) if (binding.creatureKey && this.data.drafts[id]) {
      const ref = Core.creatures(result.workspace).find(c => c.key === binding.creatureKey);
      if (ref) { const doc = result.workspace.documents.find(d => d.id === ref.documentId); if (doc.data.creatures) doc.data.creatures[ref.index] = Core.clone(this.data.drafts[id].creature); else doc.data = Core.clone(this.data.drafts[id].creature); }
    }
    return result;
  }
  links() {
    return Object.entries(this.data.bindings).flatMap(([documentId, b]) => {
      const key = b.creatureKey || this.store.value.documents.find(d => d.id === documentId)?.keys[0];
      return key && Core.creatures(this.store.value).some(c => c.key === key) ? [{ documentId, key, url: b.url, verifiedAt: b.verifiedAt || null }] : [];
    });
  }
  async attach(key, url, original) {
    return this.exclusive(async () => {
      const target = Remote.parseCreatureURL(url), existing = this.links().find(l => l.key === key);
      if (existing) {
        if (this.data.bindings[existing.documentId].id !== target.id) throw new Error('This creature is already linked to a different CritterDB record.');
        const current = await this.transport.read(target.id);
        if (current?._id !== target.id) throw new RemoteError('inaccessible');
        if (!Remote.equal(current, this.data.bindings[existing.documentId].original)) throw new RemoteError('conflict', { changes: Remote.diff(this.data.bindings[existing.documentId].original, current) });
        const local = Core.creatures(this.view().workspace).find(c => c.key === key);
        if (!local || !Remote.equal(local.data, original)) throw Object.assign(new Error('The local creature changed while connecting. Reopen the current save review.'), { status: 409 });
        return { ...this.view(), documentId: existing.documentId, key };
      }
      if (original?._id !== target.id) throw new Error('The URL must identify this creature. New creatures must first be created/imported in CritterDB.');
      const value = await this.transport.read(target.id); Core.validateCreature(value);
      if (value._id !== target.id) throw new RemoteError('inaccessible');
      const ref = Core.creatures(this.view().workspace).find(c => c.key === key);
      if (!ref || !Remote.equal(ref.data, original)) throw Object.assign(new Error('Local creature changed while connecting. Your draft is retained; reopen Save to CritterDB.'), { status: 409 });
      // Keep remote identity, ownership and unknown properties. Every proposed content
      // difference is reviewed explicitly before the existing checked write path.
      const merge = (a, b) => Core.object(a) && Core.object(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k, Object.hasOwn(b, k) ? merge(a[k], b[k]) : Core.clone(a[k])])) : Core.clone(b);
      const candidate = Core.clone(value);
      for (const property of ['name', 'stats', 'flavor']) if (Object.hasOwn(original, property)) candidate[property] = merge(value[property], original[property]);
      Remote.assertIdentity(value, candidate);
      const documentId = 'creature:' + key;
      this.data.bindings[documentId] = { ...target, creatureKey: key, original: Core.clone(value) };
      this.backup(documentId, candidate, 'before-link-review'); this.stage(documentId, candidate);
      return { ...this.view(), documentId, key };
    });
  }
  binding(documentId) {
    const binding = this.data.bindings[documentId];
    if (binding?.creatureKey) {
      const ref = Core.creatures(this.store.value).find(c => c.key === binding.creatureKey);
      if (!ref) throw new Error('This linked library creature was removed.');
      return { binding, document: { id: documentId, keys: [ref.key], data: ref.data } };
    }
    const document = this.store.value.documents.find(d => d.id === documentId);
    if (!binding || !document || document.data.creatures) throw Object.assign(new Error('Load this creature through CritterDB before using remote controls. A URL or workspace backup alone does not establish a remote edit session.'), { status: 400 });
    return { binding, document };
  }
  checkCandidate(documentId, creature) {
    const { binding } = this.binding(documentId);
    Core.validateCreature(creature); Remote.assertIdentity(binding.original, creature);
    return binding;
  }
  stage(documentId, creature) {
    this.checkCandidate(documentId, creature);
    this.data.drafts[documentId] = { creature: Core.clone(creature), updatedAt: new Date().toISOString() };
    if (this.reviews.get(documentId)?.candidate !== Remote.canonical(creature)) this.reviews.delete(documentId);
    this.persist();
    return { state: 'unsaved', message: 'Unsaved changes retained on this computer.', updatedAt: this.data.drafts[documentId].updatedAt };
  }
  captureWorkspace(workspace) {
    for (const document of workspace.documents) if (this.data.bindings[document.id]) {
      this.checkCandidate(document.id, document.data);
      // An unrelated workspace save must not erase a newer separately retained form draft.
      const previous = this.store.value.documents.find(d => d.id === document.id);
      if (!Remote.equal(document.data, previous?.data)) this.stage(document.id, document.data);
    }
    for (const [id, b] of Object.entries(this.data.bindings)) if (b.creatureKey) {
      const ref = Core.creatures(workspace).find(c => c.key === b.creatureKey), previous = Core.creatures(this.store.value).find(c => c.key === b.creatureKey);
      if (ref && !Remote.equal(ref.data, previous?.data)) this.stage(id, ref.data);
    }
  }
  backup(documentId, creature, stage) {
    const { binding } = this.binding(documentId);
    const filename = `${binding.id}-${Date.now()}-${randomUUID()}.json`;
    writeJSON(path.join(this.privateDirectory, 'backups', filename), {
      format: 'aina-critterdb-recovery', version: 1, creatureURL: binding.url, createdAt: new Date().toISOString(),
      stage, original: binding.original, localEdits: creature,
    });
    return filename;
  }
  async exclusive(fn) {
    if (this.busy) throw Object.assign(new Error('A CritterDB operation is already running. Wait for it to finish.'), { status: 409 });
    this.busy = true; try { return await fn(); } finally { this.busy = false; }
  }
  async load(url, discardLocal = false) {
    return this.exclusive(async () => {
      const target = Remote.parseCreatureURL(url);
      const remote = await this.transport.read(target.id); Core.validateCreature(remote);
      if (remote._id !== target.id) throw new RemoteError('inaccessible');
      const current = this.store.read();
      let document = current.workspace.documents.find(d => this.data.bindings[d.id]?.id === target.id);
      let state = 'loaded', conflict = [];
      if (!document) {
        document = { id: randomUUID(), label: remote.name + ' · CritterDB', keys: [randomUUID()], data: Core.clone(remote), remote: { creatureId: target.id, url: target.url } };
        current.workspace.documents.push(document);
        this.data.bindings[document.id] = { ...target, original: Core.clone(remote) };
      } else {
        const previous = this.data.bindings[document.id], draft = this.data.drafts[document.id]?.creature || document.data;
        if (!Remote.equal(draft, previous.original) && !discardLocal) {
          document.data = Core.clone(draft);
          state = 'unsaved';
          if (!Remote.equal(remote, previous.original)) { state = 'conflict'; conflict = Remote.diff(previous.original, remote); }
        } else {
          if (!Remote.equal(draft, previous.original)) this.backup(document.id, draft, 'before-loading-latest');
          const rules = current.workspace.creatureCalculations?.[document.keys[0]];
          if (rules) current.workspace.creatureCalculations[document.keys[0]] = CreatureMath.reconcile(rules, remote, document.data);
          document.data = Core.clone(remote); document.label = remote.name + ' · CritterDB';
          this.data.bindings[document.id] = { ...target, original: Core.clone(remote) };
          delete this.data.drafts[document.id]; this.reviews.delete(document.id);
        }
      }
      this.persist();
      const saved = this.store.save(current.workspace, current.revision);
      return { ...saved, documentId: document.id, state, conflict, message: state === 'loaded' ? 'Loaded through your authenticated CritterDB account.' : 'Recovered local edits. Review them before saving.' };
    });
  }
  async loadSource(url) {
    const target = Sources.parse(url);
    if (target.kind === 'creature') {
      const existing = Core.creatures(this.view().workspace).find(c => c.data._id === target.id);
      if (existing) return this.attach(existing.key, url, existing.data);
      return this.load(url);
    }
    return this.exclusive(async () => {
      if (!this.transport.loadSource) throw new RemoteError('unsupported');
      const data = await this.transport.loadSource(target.kind, target.id);
      const imported = Core.importData(data);
      if (!data || data._id !== target.id || !Array.isArray(data.creatures)) throw new RemoteError('inaccessible');
      const current = this.view();
      // A prior empty account load and a later JSON/link import can leave two
      // local copies of the same collection. Prefer the populated copy; never
      // delete or overwrite the user's other copy to repair the old empty load.
      const matching = current.workspace.documents.filter(d => d.data.creatures && d.data._id === target.id);
      let document = matching.sort((a, b) => b.keys.length - a.keys.length)[0];
      if (document) {
        const before = Core.clone(current.workspace), conflicts = [];
        document.source = { kind: target.kind, id: target.id, url };
        let added = 0, refreshed = 0, retained = 0;
        const sameSource = new Set(matching.map(d => d.id));
        const otherIds = new Set(Core.creatures(current.workspace).filter(c => !sameSource.has(c.documentId)).map(c => c.data._id).filter(Boolean));
        if (data.creatures.some(c => otherIds.has(c._id))) throw Object.assign(new Error('This collection includes creatures already loaded in another library file. Export a backup and resolve those duplicate sources before refreshing this collection.'), { status: 409 });
        for (const remoteCreature of data.creatures) {
          let index = document.data.creatures.findIndex(c => c._id === remoteCreature._id);
          if (index < 0) {
            index = document.data.creatures.length; document.data.creatures.push(Core.clone(remoteCreature)); document.keys.push(randomUUID()); added++;
          }
          const key = document.keys[index], bindingId = 'creature:' + key, binding = this.data.bindings[bindingId];
          const local = document.data.creatures[index];
          if (binding && !Remote.equal(local, binding.original) && !Remote.equal(local, remoteCreature)) {
            retained++;
            if (!Remote.equal(remoteCreature, binding.original)) conflicts.push({ key, name: local.name, changes: Remote.diff(binding.original, remoteCreature) });
            // Retain both the local edits and the original baseline for conflict review.
            this.data.drafts[bindingId] = { creature: Core.clone(local), updatedAt: new Date().toISOString() };
          } else if (!binding && !Remote.equal(local, remoteCreature)) {
            // An imported JSON entry has no known load baseline. Keep its edits and
            // let the next explicit save review compare them to the current remote.
            retained++;
            this.data.bindings[bindingId] = { id: remoteCreature._id, url: 'https://critterdb.com/#/creature/edit/' + remoteCreature._id, creatureKey: key, original: Core.clone(remoteCreature) };
            this.data.drafts[bindingId] = { creature: Core.clone(local), updatedAt: new Date().toISOString() };
          } else {
            if (!Remote.equal(local, remoteCreature)) refreshed++;
            const rules = current.workspace.creatureCalculations?.[key];
            if (rules) current.workspace.creatureCalculations[key] = CreatureMath.reconcile(rules, remoteCreature, local);
            document.data.creatures[index] = Core.clone(remoteCreature);
            this.data.bindings[bindingId] = { ...(binding || {}), id: remoteCreature._id, url: 'https://critterdb.com/#/creature/edit/' + remoteCreature._id, creatureKey: key, original: Core.clone(remoteCreature) };
            delete this.data.drafts[bindingId];
          }
          this.reviews.delete(bindingId);
        }
        if (!Remote.equal(before, current.workspace)) writeJSON(path.join(this.store.directory, 'library-backups', 'before-sync-' + Date.now() + '-' + randomUUID() + '.json'), before);
        const saved = this.store.save(current.workspace, current.revision); this.persist();
        const count = document.data.creatures.length;
        return { ...saved, documentId: document.id, key: document.keys[0], state: conflicts.length ? 'conflict' : 'loaded', conflicts, creatureCount: count, remoteCount: data.creatures.length, added, refreshed, retained,
          message: `${document.data.name || document.label}: ${count} creatures in your library. ${added} added, ${refreshed} refreshed.${retained ? ' ' + retained + ' local edits retained.' : ''}${conflicts.length ? ' Remote changes conflict with local edits; review those creatures before saving.' : ''}${!count ? ' CritterDB returned an empty collection.' : ''}` };
      }
      const existing = new Set(Core.creatures(current.workspace).map(c => c.data._id).filter(Boolean));
      if (data.creatures.some(c => existing.has(c._id))) throw Object.assign(new Error('Some creatures from this bestiary are already loaded separately. Your edits were kept. Export a backup and use Clear to remove those local entries before loading the whole bestiary.'), { status: 409 });
      document = { id: randomUUID(), label: data.name || 'CritterDB bestiary', source: { kind: target.kind, id: target.id, url }, data: imported.data, keys: data.creatures.map(() => randomUUID()) };
      current.workspace.documents.push(document);
      const saved = this.store.save(current.workspace, current.revision);
      data.creatures.forEach((creature, index) => {
        const key = document.keys[index], id = 'creature:' + key;
        this.data.bindings[id] = { id: creature._id, url: 'https://critterdb.com/#/creature/edit/' + creature._id, creatureKey: key, original: Core.clone(creature) };
      });
      this.persist();
      return { ...saved, documentId: document.id, key: document.keys[0], state: 'loaded', creatureCount: data.creatures.length, remoteCount: data.creatures.length, added: data.creatures.length, message: data.name + ': ' + data.creatures.length + ' creatures loaded.' + (!data.creatures.length ? ' CritterDB returned an empty collection.' : '') };
    });
  }
  async review(documentId, creature) {
    return this.exclusive(async () => {
      const binding = this.checkCandidate(documentId, creature);
      this.stage(documentId, creature);
      const current = await this.transport.read(binding.id);
      if (!Remote.equal(current, binding.original)) throw new RemoteError('conflict', { changes: Remote.diff(binding.original, current) });
      const changes = Remote.diff(binding.original, creature);
      const token = randomUUID();
      this.reviews.set(documentId, { token, candidate: Remote.canonical(creature), original: Remote.canonical(binding.original), expires: Date.now() + 5 * 60 * 1000 });
      return { state: changes.length ? 'unsaved' : 'loaded', changes, reviewToken: token, creatureId: binding.id };
    });
  }
  async save(documentId, creature, reviewToken) {
    return this.exclusive(async () => {
      const binding = this.checkCandidate(documentId, creature), reviewed = this.reviews.get(documentId);
      if (!reviewed || reviewed.token !== reviewToken || reviewed.expires < Date.now() || reviewed.candidate !== Remote.canonical(creature) || reviewed.original !== Remote.canonical(binding.original)) throw Object.assign(new Error('Review the current pending changes again before saving to CritterDB.'), { status: 409 });
      this.backup(documentId, creature, 'before-remote-save');
      this.reviews.delete(documentId);
      this.stage(documentId, creature); // Recovery is durable before a network write can be attempted.
      const persisted = await this.transport.writeChecked(binding.id, binding.original, creature);
      if (!persisted || persisted._id !== binding.id) throw new RemoteError('failed');
      if (!Remote.persistedEqual(creature, persisted)) throw new RemoteError('failed', { verification: 'The reloaded creature does not match the requested data. Local edits and the original backup were retained. Use Verify saved data before attempting another save.', changes: Remote.diff(creature, persisted) });
      return this.finish(documentId, persisted);
    });
  }
  async verify(documentId, creature) {
    return this.exclusive(async () => {
      const binding = this.checkCandidate(documentId, creature);
      this.stage(documentId, creature);
      const persisted = await this.transport.read(binding.id);
      if (!Remote.persistedEqual(creature, persisted)) throw new RemoteError('conflict', { changes: Remote.diff(creature, persisted), verification: 'The remote data differs from your local edits. Your edits were kept; no write was sent.' });
      return this.finish(documentId, persisted);
    });
  }
  finish(documentId, persisted) {
    const { binding } = this.binding(documentId);
    if (persisted._id !== binding.id) throw new RemoteError('failed');
    const current = this.store.read();
    if (binding.creatureKey) {
      const ref = Core.creatures(current.workspace).find(c => c.key === binding.creatureKey), doc = current.workspace.documents.find(d => d.id === ref.documentId);
      if (doc.data.creatures) doc.data.creatures[ref.index] = Core.clone(persisted); else doc.data = Core.clone(persisted);
    } else { const document = current.workspace.documents.find(d => d.id === documentId); document.data = Core.clone(persisted); document.label = persisted.name + ' · CritterDB'; }
    const saved = this.store.save(current.workspace, current.revision);
    binding.original = Core.clone(persisted); binding.verifiedAt = new Date().toISOString();
    delete this.data.drafts[documentId]; this.reviews.delete(documentId); this.persist();
    return { ...saved, state: 'saved', documentId, verifiedAt: binding.verifiedAt, message: 'Saved to the same CritterDB creature and reloaded to verify all requested data.', avraeCommand: '!bestiary update' };
  }
  changes(documentId, creature) {
    const binding = this.checkCandidate(documentId, creature);
    return Remote.diff(binding.original, creature);
  }
  async close() { await this.transport.close?.(); }
}
module.exports = { RemoteEdits, writeJSON };
